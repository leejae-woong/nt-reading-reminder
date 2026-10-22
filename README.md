# 신약 1독 알림

매일 한국 시간 아침 9시, 저녁 9시 무렵에 실행돼서
**오늘 읽기 기록이 없는 멤버에게만** "오늘 성경 읽으셨나요?" 알림을 보내.

- `notify.mjs` : Firestore에서 멤버·기록·알림 구독을 읽고 웹 푸시 전송
- `.github/workflows/remind.yml` : 예약 실행 (08:50, 20:50 KST에 시작)
- `vapid-public.txt` : 웹 푸시 공개키 (사이트와 같은 값)
- `site-url.txt` : 기본 사이트 주소 (알림은 각자 구독한 사이트로 열림)

## 처음 한 번
Settings → Secrets and variables → Actions → New repository secret
- Name: `VAPID_PRIVATE_KEY`
- Secret: 따로 받은 비밀키 한 줄

## 테스트
Actions → 성경 읽기 알림 → Run workflow → test 체크 → Run
