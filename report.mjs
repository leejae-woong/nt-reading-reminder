// 점검 보고서: 알림 연결과 읽기 기록을 실행 화면에 표시 (아무것도 보내거나 바꾸지 않음)
const BASE = "https://firestore.googleapis.com/v1/projects/bible-nt-check/databases/(default)/documents";
const BOOKS = [["마태복음",28],["마가복음",16],["누가복음",24],["요한복음",21],["사도행전",28],["로마서",16],["고린도전서",16],["고린도후서",13],["갈라디아서",6],["에베소서",6],["빌립보서",4],["골로새서",4],["데살로니가전서",5],["데살로니가후서",3],["디모데전서",6],["디모데후서",4],["디도서",3],["빌레몬서",1],["히브리서",13],["야고보서",5],["베드로전서",5],["베드로후서",3],["요한일서",5],["요한이서",1],["요한삼서",1],["유다서",1],["요한계시록",22]];
const OFFS = []; let total = 0; for (const [, c] of BOOKS) { OFFS.push(total); total += c; }
const pos = i => { let b = 0; while (b < BOOKS.length - 1 && OFFS[b + 1] <= i) b++; return [b, i - OFFS[b] + 1]; };
const range = (a, z) => { const [b1, c1] = pos(a), [b2, c2] = pos(z); return b1 === b2 ? `${BOOKS[b1][0]} ${c1}${a === z ? "" : "–" + c2}장` : `${BOOKS[b1][0]} ${c1}장~${BOOKS[b2][0]} ${c2}장`; };
const kst = ms => { const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
function decode(v) { if (!v) return null; if ("stringValue" in v) return v.stringValue; if ("integerValue" in v) return Number(v.integerValue); if ("doubleValue" in v) return v.doubleValue; if ("booleanValue" in v) return v.booleanValue; if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode); if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)])); return null; }
async function list(col) { const out = []; let t = ""; do { const r = await fetch(`${BASE}/${col}?pageSize=300${t ? "&pageToken=" + encodeURIComponent(t) : ""}`); if (!r.ok) throw new Error(`${col} ${r.status}`); const j = await r.json(); for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), ...decode({ mapValue: { fields: d.fields || {} } }) }); t = j.nextPageToken || ""; } while (t); return out; }
const note = (title, lines) => console.log(`::notice title=${title}::${lines.join("%0A")}`);

const [members, logs, prior, push] = await Promise.all(["members", "logs", "prior", "push"].map(list));
const ms = [...members].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
note("알림 연결", ms.map(m => { const s = push.filter(p => p.member === m.id).sort((a, b) => a.createdAt - b.createdAt);
  return `${m.name}: ${s.length ? s.map(p => `${kst(p.createdAt)} 켬 (${p.device || "?"}, ${(p.site || "").replace(/^https:\/\//, "").replace(/\/$/, "") || "?"})`).join(" / ") : "연결 없음"}`; }).concat(push.filter(p => !members.some(m => m.id === p.member)).length ? [`(멤버 없는 연결 ${push.filter(p => !members.some(m => m.id === p.member)).length}개)`] : []));
for (const m of ms) {
  const mine = logs.filter(l => l.member === m.id).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const set = new Set((prior.find(p => p.id === m.id) || {}).chapters || []); const pr = set.size;
  for (const l of mine) for (let i = l.start; i <= l.end; i++) set.add(i);
  const lines = [`읽은 장 ${set.size}/260 (이미 읽은 분량 ${pr}장) · 기록 ${mine.length}개`];
  for (const l of mine) lines.push(`${l.date.slice(5).replace("-", "/")} ${range(l.start, l.end)} (${l.end - l.start + 1}장) · 입력 ${l.createdAt ? kst(l.createdAt) : "?"}${l.note ? " · \"" + l.note.slice(0, 30) + (l.note.length > 30 ? "…" : "") + "\"" : ""}`);
  note(`읽기 기록 · ${m.name}`, lines);
}
