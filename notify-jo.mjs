// 말씀 동행(조원용 사이트) 알림
// 아침 9시, 저녁 9시(한국 시간)에 실행되어 오늘 기록이 없는 조원에게만 웹 푸시를 보낸다.
// 재웅·동규·준호 알림(notify.mjs)과 데이터가 완전히 따로다 (jo_ 컬렉션).
import webpush from "web-push";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./jo/site/plans.js");
const { PLANS, chLabel } = globalThis.BIBLE_DATA;

const PROJECT = "bible-nt-check";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const urlFile = new URL("./jo/site-url.txt", import.meta.url);
const SITE = (process.env.JO_SITE_URL || (existsSync(urlFile) ? readFileSync(urlFile, "utf8") : "")).trim();
const VAPID_PUBLIC = readFileSync(new URL("./vapid-public.txt", import.meta.url), "utf8").trim();
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/[\s"'`=]/g, "");
const TEST = process.env.TEST === "true";
const DRY = process.env.DRY_RUN === "true";
const tag = "[말씀 동행]";

const fail = msg => { console.log(`::error::${tag} ${msg}`); process.exit(1); };
process.on("uncaughtException", e => fail(`실행 오류: ${e.message}`));
process.on("unhandledRejection", e => fail(`실행 오류: ${e && e.message || e}`));
if (!VAPID_PRIVATE && !DRY) fail("VAPID_PRIVATE_KEY 시크릿이 없어요.");
if (!DRY) webpush.setVapidDetails(SITE || "https://bible-main.netlify.app/", VAPID_PUBLIC, VAPID_PRIVATE);

const kstNow = new Date(Date.now() + 9 * 3600e3);
const TODAY = kstNow.toISOString().slice(0, 10);
const HOUR = kstNow.getUTCHours();
const SLOT = process.env.SLOT || (HOUR < 15 ? "morning" : "evening");
const EVENT = process.env.EVENT || "";
const MARK = `sent/jo-${TODAY}-${SLOT}`;
if (!TEST && !DRY) {
  if (EVENT === "schedule") {
    const inWindow = SLOT === "morning" ? HOUR >= 8 && HOUR < 12 : HOUR >= 20;
    if (!inWindow) { console.log(`::notice::${tag} 예약 실행이 늦어서 건너뜀 (한국 ${HOUR}시)`); process.exit(0); }
  }
  if (existsSync(new URL(`./${MARK}`, import.meta.url))) { console.log(`::notice::${tag} ${TODAY} ${SLOT} 알림은 이미 보내서 건너뜀`); process.exit(0); }
}

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
    if (res.status === 403) return null; // 보안 규칙이 아직 없으면 (사이트 준비 전) 조용히 건너뜀
    if (!res.ok) throw new Error(`${col} 읽기 실패: ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), ...decode({ mapValue: { fields: d.fields || {} } }) });
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

const loaded = await Promise.all(["jo_members", "jo_logs", "jo_push"].map(list));
if (loaded.some(x => x === null)) { console.log(`::notice::${tag} 아직 준비 전이라 건너뜀 (데이터 접근 규칙 없음)`); process.exit(0); }
const [members, logs, subs] = loaded;
console.log(`${tag} 오늘 ${TODAY} (${SLOT}) · 조원 ${members.length} · 알림 구독 ${subs.length}${TEST ? " · 테스트" : ""}`);

const addDay = (d, n) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 864e5); return x.toISOString().slice(0, 10); };
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };
const readOn = d => new Set(logs.filter(l => l.date === d).map(l => l.member));
function streakUntilYesterday(id) { let d = addDay(TODAY, -1), n = 0; const s = new Set(logs.filter(l => l.member === id).map(l => l.date)); while (s.has(d) && n < 3650) { n++; d = addDay(d, -1); } return n; }
function nextLabel(m) {
  const P = PLANS[m.plan]; if (!P) return "";
  const done = new Set(logs.filter(l => l.member === m.id).flatMap(l => l.items || []));
  if (P.kind === "seq") { const ch = P.order.find(c => !done.has("c" + c)); return ch == null ? "" : chLabel(ch); }
  const lim = P.days === Infinity ? 100000 : P.days; let d = 1;
  while (d <= lim && P.day(d).every(p => done.has(p.id))) d++;
  if (d > lim) return "";
  const rest = P.day(d).filter(p => !done.has(p.id));
  return rest[0].label + (rest.length > 1 ? ` 외 ${rest.length - 1}` : "");
}

const today = readOn(TODAY);
let sent = 0, skipped = 0, removed = 0;
for (const m of members) {
  const mySubs = subs.filter(s => s.member === m.id);
  if (!mySubs.length && !DRY) continue;
  if (today.has(m.id) && !TEST) { skipped++; if (DRY) console.log(`::notice::${tag}[점검] ${m.name}: 오늘 기록 있음 → 안 보냄`); continue; }
  const next = nextLabel(m), st = streakUntilYesterday(m.id);
  const others = members.filter(x => x.id !== m.id && today.has(x.id));
  const body = SLOT === "morning"
    ? (next ? `${m.name}, 오늘의 말씀은 ${next}이에요.` : `${m.name}, 오늘도 말씀과 함께해요.`) + (st >= 2 ? ` 말씀과 함께 ${st + 1}일째를 이어가요` : "")
    : others.length
      ? `${m.name}, 오늘 ${others.map(x => x.name).join(", ")}${josa(others[others.length - 1].name, "이", "가")} 읽었어요. 한 장이라도 함께 읽어요!`
      : `${m.name}, 아직 오늘 기록이 없어요. 자기 전에 ${next || "한 장"}${next ? "부터" : "이라도"} 함께 읽어요.`;
  if (DRY) { console.log(`::notice::${tag}[점검] ${m.name} · 폰 ${mySubs.length}대 ← ${body}`); continue; }
  for (const s of mySubs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "오늘 말씀 읽으셨나요?", body, url: s.site || SITE || "./", tag: `jo-${TODAY}-${SLOT}` }), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await fetch(`${BASE}/jo_push/${s.id}`, { method: "DELETE" }); removed++; }
      else console.log(`::warning::${tag} ${m.name} 전송 실패: ${e.statusCode || ""} ${e.body || e.message}`);
    }
  }
}
if (!TEST && !DRY) { mkdirSync(new URL("./sent/", import.meta.url), { recursive: true }); writeFileSync(new URL(`./${MARK}`, import.meta.url), `보냄 ${sent}\n`); }
console.log(`::notice::${tag} ${TODAY} ${SLOT}${DRY ? " (점검만)" : ""} · 구독 ${subs.length} · 보냄 ${sent} · 건너뜀 ${skipped} · 만료 정리 ${removed}`);
