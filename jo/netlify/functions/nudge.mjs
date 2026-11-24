// 말씀 동행 콕 찌르기: 조원이 다른 조원의 휴대폰으로 알림을 보낸다. (jo_ 컬렉션만 씀)
// 사이트는 보내는 키를 모르기 때문에, 이 함수가 대신 보낸다.
// 필요한 환경 변수 (Netlify → Site configuration → Environment variables)
//   VAPID_PRIVATE_KEY : 알림 보내는 비밀키 (GitHub 시크릿에 넣은 것과 같은 값)
import webpush from "web-push";

const PROJECT = "bible-nt-check";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const VAPID_PUBLIC = "BNS4OJoIpx9uNntsmxnzHD-MsjTWsQdaB0KQKIszNoScGC73M55ARYSMx8Dgw8T-zZ49Hxwy_AFvTFL_ICbxzUo";
const GAP = 3 * 60 * 1000; // 같은 사람에게는 3분에 한 번
const MAX_TEXT = 60;
const last = new Map(); // 함수가 깨어 있는 동안만 기억하는 가벼운 도배 방지

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };

function decode(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  return null;
}
async function list(col) {
  const out = []; let token = "";
  do {
    const res = await fetch(`${BASE}/${col}?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    if (!res.ok) throw new Error(`${col} ${res.status}`);
    const j = await res.json();
    for (const d of j.documents || []) { const o = { id: d.name.split("/").pop() }; for (const [k, x] of Object.entries(d.fields || {})) o[k] = decode(x); out.push(o); }
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST만 받아요" });
  const key = (process.env.VAPID_PRIVATE_KEY || "").replace(/[\s"'`=]/g, "");
  if (!key) return json(500, { error: "알림 키가 아직 설정되지 않았어요 (Netlify 환경 변수 VAPID_PRIVATE_KEY)" });

  let b; try { b = await req.json(); } catch (_) { return json(400, { error: "요청을 읽지 못했어요" }); }
  const from = String(b.from || ""), to = String(b.to || "");
  const text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  if (!from || !to || from === to) return json(400, { error: "받는 사람을 다시 골라주세요" });
  if (!text) return json(400, { error: "보낼 말을 적어주세요" });

  const pair = from + ">" + to, now = Date.now();
  if (last.has(pair) && now - last.get(pair) < GAP) return json(429, { error: "방금 보냈어요. 조금 있다가 다시 보내주세요" });

  let members, subs;
  try { [members, subs] = await Promise.all([list("jo_members"), list("jo_push")]); }
  catch (e) { return json(502, { error: "조원 정보를 불러오지 못했어요. 잠시 후 다시 해주세요" }); }
  const f = members.find(m => m.id === from), t = members.find(m => m.id === to);
  if (!f || !t) return json(400, { error: "조원을 찾지 못했어요. 새로고침하고 다시 해주세요" });

  const mine = subs.filter(s => s.member === to && s.endpoint && s.p256dh && s.auth);
  if (!mine.length) return json(200, { sent: 0 });

  last.set(pair, now);
  const origin = new URL(req.url).origin + "/";
  webpush.setVapidDetails(origin, VAPID_PUBLIC, key);
  let sent = 0;
  for (const s of mine) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: `${f.name}${josa(f.name, "이", "가")} 콕 찔렀어요`, body: text, url: s.site || origin, tag: `jo-nudge-${from}` }), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      // 만료된 구독은 정리한다
      if (e.statusCode === 404 || e.statusCode === 410) await fetch(`${BASE}/jo_push/${s.id}`, { method: "DELETE" }).catch(() => {});
      else console.log("nudge 전송 실패", e.statusCode || "", e.body || e.message);
    }
  }
  if (!sent) last.delete(pair);
  return json(200, { sent });
};

export const config = { path: "/api/nudge" };
