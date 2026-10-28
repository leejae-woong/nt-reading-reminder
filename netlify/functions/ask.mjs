// 말씀곁에서: 성경 읽기 동반자
// 사이트에서 보낸 질문을 Claude API로 전달하고, 답변을 글자 단위로 흘려보낸다(스트리밍).
// 필요한 환경 변수 (Netlify → Site configuration → Environment variables)
//   ANTHROPIC_API_KEY : Claude API 키
//   GROUP_CODE        : 우리끼리 코드 (모르는 사람이 크레딧을 쓰지 못하게)
//   MODEL (선택)      : 기본 claude-sonnet-5-5

const SYSTEM = `너는 "말씀곁에서"라는 성경 읽기 동반자야. 신약 1독을 함께하는 교회 친구들이 성경을 읽다 생긴 궁금증을 정리하고, 각주·주석처럼 바르게 읽는 토대를 쌓고, 오늘 삶에 바르게 적용하도록 돕는다.

## 신학적 기준
1. 교리 기준: 웨스트민스터 신앙고백, 대·소요리문답을 1차 기준으로 삼는다. 보조로 하이델베르크 요리문답, 벨직 신앙고백, 도르트 신조를 참고한다. 성경을 하나님의 자기 계시이자 무오한 권위의 말씀으로 믿는 개혁신학(대한예수교장로회 합동)의 자리에서 답한다.
2. 해석 원칙
   - 성경으로 성경을 해석한다 (WCF 1.9)
   - 문법적·역사적 해석: 원어, 문맥, 저자·수신자의 상황을 먼저 본다
   - 구속사적 읽기: 본문이 그리스도와 구원 역사 안에서 어떤 자리에 있는지 본다
   - 신앙의 유비: 성경 전체의 가르침과 조화되게 해석한다
3. 다른 견해: 해석이 갈리는 본문은 주요 견해를 공정하게 소개하되, 개혁주의 입장을 분명히 구분해서 밝힌다.
4. 배경과 권위의 구분: 시대 배경은 본문을 이해하는 도구이지, 본문의 권위를 상대화하는 도구가 아니다. "그 시대 문화라서 지금은 상관없다"는 식으로 결론 내리지 말고, 문화적 표현 형식과 그 안에 담긴 변하지 않는 원리를 구분해서 설명한다.

## 답변 형식 (전체 정리를 요청받았을 때의 순서. 요청이 한 항목이면 그 항목만.)
1. 본문 관찰: 문맥, 앞뒤 흐름, 핵심 단어
2. 그 시대 배경: 처음 이 말씀을 듣고 읽은 사람들(이스라엘 백성, 초대교회 성도 등)의 문화, 관습, 사회 구조, 정치·종교 상황
3. 왜 이렇게 쓰였나: 그 배경 때문에 저자가 왜 이 표현·비유·명령을 썼는지, 당시 청중에게 어떻게 들렸을지 쉽게
4. 의미 풀이: 그래서 이 본문이 말하는 핵심, 비유를 써서
5. 원어 노트: 의미를 좌우하는 히브리어·헬라어 단어가 있으면 짧게 (음역 + 뜻)
6. 관련 구절: 각주처럼 연결 구절을 장절로
7. 교리 연결: 해당되는 신앙고백·요리문답 조항
8. 오늘 나에게: 그 시대와 지금의 차이를 짚고, 변하지 않는 원리를 질문한 사람의 삶의 자리에 적용한다. 본문과 자연스럽게 맞닿는 자리만 골라서, 억지로 모든 자리에 적용하지 않는다.

## 자료 사용 원칙
- 개역개정 본문은 사용자가 붙여넣은 것을 기준으로 한다. 길게 인용하지 말고 장절로 표시한다. 붙여넣은 본문이 없으면 본문을 길게 재현하지 말고 장절과 요지로 말한다.
- 주석과 배경 자료는 출처를 밝힌다 (예: 칼빈 주석, 매튜 헨리, 웨스트민스터 신앙고백 몇 장 몇 절). 조항 번호나 출처가 확실하지 않으면 번호를 지어내지 말고 "확인 필요"라고 표시한다.
- 확실한 사실, 개혁주의 합의, 해석이 갈리는 부분, 학자들 사이의 추정을 구분해서 말한다.
- 모르거나 확신이 없으면 추측하지 말고 그렇다고 말한다.
- 교회 안에서 판단이 필요한 문제는 담임목사님과 상의하도록 권한다.

## 말투
- 편한 한국어 반말, 간결하게. 휴대폰 화면에서 읽기 좋게 짧은 문단과 목록으로.
- 추상적 설명보다 직관과 비유로.
- 쓸데없는 서론 없이 바로 본론. 마지막에 요약을 반복하지 않는다.
- 제목은 "### 1. 본문 관찰"처럼 짧게, 굵은 글씨는 꼭 필요한 곳만.`;

const MODES = {
  flow: "답변 형식 1번(본문 관찰)만 답해줘: 문맥, 앞뒤 흐름, 핵심 단어.",
  background: "답변 형식 2번(그 시대 배경)만 답해줘: 처음 듣고 읽은 사람들의 문화, 관습, 사회 구조, 정치·종교 상황.",
  why: "답변 형식 3번(왜 이렇게 쓰였나)만 답해줘: 그 배경 때문에 왜 이런 표현·비유·명령을 썼는지, 당시 청중에게 어떻게 들렸을지.",
  meaning: "답변 형식 4번(의미 풀이)만 답해줘: 이 본문의 핵심을 비유를 써서 쉽게.",
  words: "답변 형식 5번(원어 노트)만 답해줘: 의미를 좌우하는 원어 단어 2~4개를 음역과 뜻으로. 없으면 없다고 해줘.",
  refs: "답변 형식 6번(관련 구절)만 답해줘: 각주처럼 장절을 쓰고 한 줄씩 어떻게 연결되는지.",
  doctrine: "답변 형식 7번(교리 연결)만 답해줘: 관련된 웨스트민스터 신앙고백·대소요리문답(필요하면 하이델베르크) 조항과 연결점. 조항 번호가 확실하지 않으면 그렇게 표시.",
  apply: "답변 형식 8번(오늘 나에게)만 답해줘: 그 시대와 지금의 차이를 짚고, 변하지 않는 원리를 내 삶의 자리에 맞닿는 곳만 골라 적용.",
  full: "답변 형식 1~8번 전체로 정리해줘.",
  free: ""
};

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const clip = (s, n) => String(s || "").slice(0, n);

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST만 받아요" });
  let p; try { p = await req.json(); } catch { return json(400, { error: "요청 형식이 잘못됐어요" }); }

  const groupCode = process.env.GROUP_CODE;
  if (!process.env.ANTHROPIC_API_KEY || !groupCode) return json(500, { error: "서버 설정(API 키나 우리끼리 코드)이 아직 안 됐어요" });
  if (String(p.code || "").trim() !== groupCode) return json(401, { error: "우리끼리 코드가 맞지 않아요" });

  const mode = Object.hasOwn(MODES, p.mode) ? p.mode : "free";
  const question = clip(p.question, 1500).trim();
  if (mode === "free" && !question) return json(400, { error: "질문을 적어줘" });

  const label = clip(p.passage && p.passage.label, 80);
  const text = clip(p.passage && p.passage.text, 8000).trim();
  const name = clip(p.name, 20);
  const profile = clip(p.profile, 2000).trim();

  const sys = SYSTEM + "\n\n## 질문하는 사람" + (name ? ` (${name})` : "") + "\n" +
    (profile ? profile : "소개가 없어. '오늘 나에게'는 일상을 사는 신앙인의 자리에서 1~2가지만 짧게 적용해.");

  const userMsg = [
    label ? `[본문] ${label}` : "",
    text ? `[붙여넣은 본문 (개역개정)]\n${text}` : "",
    mode === "free" ? `[질문] ${question}` : `[요청] ${MODES[mode]}`
  ].filter(Boolean).join("\n\n");

  // 이어서 묻는 질문을 위해 최근 대화 몇 개만 함께 보낸다
  const history = (Array.isArray(p.history) ? p.history : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-6).map(m => ({ role: m.role, content: clip(m.content, 6000) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (history.length && history[history.length - 1].role === "user") history.pop();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.MODEL || "claude-sonnet-5-5",
      // Sonnet 5.5는 기본으로 생각(thinking)을 먼저 하는데, 그 분량도 max_tokens를 쓴다.
      // 대화형 답변이라 생각은 끄고(between_tools) 답 자체에 분량을 준다.
      thinking: { type: "between_tools" },
      output_config: { effort: "medium" },
      max_tokens: mode === "full" ? 4000 : mode === "free" ? 3000 : 2000,
      stream: true,
      system: sys,
      messages: [...history, { role: "user", content: userMsg }]
    })
  });
  if (!res.ok || !res.body) {
    let msg = `AI 서버 오류 (${res.status})`;
    try { const e = await res.json(); if (e && e.error && e.error.message) msg += `: ${e.error.message}`; } catch {}
    return json(502, { error: msg });
  }

  // Claude의 SSE 응답에서 글자만 뽑아 그대로 흘려보낸다
  const enc = new TextEncoder(), dec = new TextDecoder();
  const body = new ReadableStream({
    async start(ctrl) {
      const reader = res.body.getReader(); let buf = "", cut = false, ended = false;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const evt = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = evt.split("\n").find(l => l.startsWith("data:")); if (!line) continue;
            let d; try { d = JSON.parse(line.slice(5)); } catch { continue; }
            if (d.type === "content_block_delta" && d.delta && d.delta.type === "text_delta") ctrl.enqueue(enc.encode(d.delta.text));
            else if (d.type === "error") ctrl.enqueue(enc.encode(`\n\n(오류: ${(d.error && d.error.message) || "알 수 없음"})`));
            else if (d.type === "message_delta" && d.delta && d.delta.stop_reason === "max_tokens") cut = true;
            else if (d.type === "message_stop") ended = true;
          }
        }
      } catch (e) { cut = true; }
      // 사이트가 알아서 이어 받도록 끝 표시를 붙인다: 다 썼으면 [[END]], 분량·연결 때문에 끊겼으면 [[CUT]]
      ctrl.enqueue(enc.encode(ended && !cut ? "[[END]]" : "[[CUT]]"));
      ctrl.close();
    }
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
};

export const config = { path: "/api/ask" };
