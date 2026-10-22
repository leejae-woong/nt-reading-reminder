// 신약 1독 체크표 알림
// 아침 9시, 저녁 9시(한국 시간)에 실행되어 오늘 읽기 기록이 없는 멤버에게만 웹 푸시를 보낸다.
import webpush from "web-push";
import { readFileSync } from "node:fs";

const PROJECT = "bible-nt-check";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SITE = (process.env.SITE_URL || readFileSync(new URL("./site-url.txt", import.meta.url), "utf8")).trim();
const VAPID_PUBLIC = readFileSync(new URL("./vapid-public.txt", import.meta.url), "utf8").trim();
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const TEST = process.env.TEST === "true"; // 기록 여부와 상관없이 모두에게 보내기
const DRY = process.env.DRY_RUN === "true"; // 보내지 않고 누구에게 갈지만 출력

if (!VAPID_PRIVATE && !DRY) {
  console.error("VAPID_PRIVATE_KEY 시크릿이 없어요. 저장소 Settings → Secrets and variables → Actions에서 등록해 주세요.");
  process.exit(1);
}
if (!DRY) webpush.setVapidDetails(SITE, VAPID_PUBLIC, VAPID_PRIVATE);

// ---- 날짜 (한국 시간) ----
const kstNow = new Date(Date.now() + 9 * 3600e3);
const TODAY = kstNow.toISOString().slice(0, 10);
const HOUR = kstNow.getUTCHours();
const SLOT = process.env.SLOT || (HOUR < 15 ? "morning" : "evening");
const END = TODAY.slice(0, 4) + "-12-31";
const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const DAYS_LEFT = Math.max(1, dayNum(END) - dayNum(TODAY) + 1);

// ---- 신약 장 번호 ----
const BOOKS = [["마태복음",28],["마가복음",16],["누가복음",24],["요한복음",21],["사도행전",28],["로마서",16],["고린도전서",16],["고린도후서",13],["갈라디아서",6],["에베소서",6],["빌립보서",4],["골로새서",4],["데살로니가전서",5],["데살로니가후서",3],["디모데전서",6],["디모데후서",4],["디도서",3],["빌레몬서",1],["히브리서",13],["야고보서",5],["베드로전서",5],["베드로후서",3],["요한일서",5],["요한이서",1],["요한삼서",1],["유다서",1],["요한계시록",22]];
const OFFS = []; let total = 0; for (const [, c] of BOOKS) { OFFS.push(total); total += c; }
function label(i) { let b = 0; while (b < BOOKS.length - 1 && OFFS[b + 1] <= i) b++; return `${BOOKS[b][0]} ${i - OFFS[b] + 1}장`; }

// ---- Firestore REST 읽기 ----
function decode(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return null;
}
async function list(col) {
  const out = []; let token = "";
  do {
    const res = await fetch(`${BASE}/${col}?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    if (!res.ok) throw new Error(`${col} 읽기 실패: ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), ...decode({ mapValue: { fields: d.fields || {} } }) });
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

const [members, logs, prior, subs] = await Promise.all(["members", "logs", "prior", "push"].map(list));
console.log(`오늘 ${TODAY} (${SLOT}) · 멤버 ${members.length} · 알림 구독 ${subs.length}${TEST ? " · 테스트" : ""}`);

let sent = 0, skipped = 0, removed = 0;
for (const m of members) {
  const mine = logs.filter(l => l.member === m.id);
  const readToday = mine.some(l => l.date === TODAY);
  const mySubs = subs.filter(s => s.member === m.id);
  if (!mySubs.length && !DRY) continue;

  const done = new Set((prior.find(p => p.id === m.id)?.chapters) || []);
  for (const l of mine) if (l.date < TODAY) for (let i = l.start; i <= l.end; i++) done.add(i);
  const all = new Set(done); for (const l of mine) for (let i = l.start; i <= l.end; i++) all.add(i);
  const remain = total - all.size;
  if (remain <= 0) { skipped++; continue; }
  if (DRY && readToday && !TEST) console.log(`[미리보기] ${m.name}: 오늘 기록 있음 → 안 보냄`);                 // 완독한 사람은 보내지 않음
  if (readToday && !TEST) { skipped++; continue; }           // 오늘 기록했으면 보내지 않음

  const quota = Math.ceil((total - done.size) / DAYS_LEFT);
  let next = 0; while (next < total && all.has(next)) next++;
  const body = SLOT === "morning"
    ? `${m.name}, 오늘은 ${quota}장이면 돼요. ${label(next)}부터 시작!`
    : `${m.name}, 아직 오늘 기록이 없어요. 자기 전에 ${quota}장 같이 읽어요.`;
  const payloadFor = s => JSON.stringify({ title: "오늘 성경 읽으셨나요?", body, url: s.site || SITE, tag: `nt-${TODAY}-${SLOT}` });

  if (DRY) { console.log(`[미리보기] ${m.name} (구독 ${mySubs.length}) ← ${body}`); continue; }
  for (const s of mySubs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadFor(s), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {   // 앱 삭제 등으로 만료된 구독은 정리
        await fetch(`${BASE}/push/${s.id}`, { method: "DELETE" });
        removed++;
      } else console.error(`${m.name} 전송 실패:`, e.statusCode || "", e.body || e.message);
    }
  }
}
console.log(`보냄 ${sent} · 건너뜀 ${skipped} · 만료 정리 ${removed}`);
