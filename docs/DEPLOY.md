# ChemVerse 배포 가이드 (교사용)

## 1. GitHub Pages 배포 (최초 1회, 10분)

1. github.com 로그인 → New repository → 이름 예: `chemverse` → Public → Create
2. 내 컴퓨터에서 cmd 열기:
```cmd
cd "C:\Users\user\Documents\용인고등학교\화학\클로드 시뮬레이션 도비\ChemVerse"
git init
git add .
git commit -m "ChemVerse Phase 1"
git branch -M main
git remote add origin https://github.com/<아이디>/chemverse.git
git push -u origin main
```
3. GitHub 저장소 → Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save
4. 1~2분 후 학생 접속 URL: `https://<아이디>.github.io/chemverse/`
5. 이후 수정 시: `git add . && git commit -m "수정" && git push` 만 하면 자동 반영

> 정적 호스팅이므로 동시 접속 40명이 아니라 400명이어도 서버 부하 문제 없음.
> 멀티플레이 트래픽만 아래 서비스를 거친다.

## 2. 멀티플레이 켜기 — 방법 A: Supabase (인터넷, 무료)

1. supabase.com 무료 가입 → New project (리전: Northeast Asia)
2. Project Settings → API → `Project URL` 과 `anon public` 키 복사
3. `js/net/config.js` 열어서 붙여넣기:
```js
export const SUPABASE_URL = "https://xxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
export const DEFAULT_MODE = "supabase";
```
4. git push → 학생은 로비에서 같은 "방 코드"(예: 2학년3반-1모둠) 입력

무료 한도: 동시 200접속 / 월 200만 메시지.
**한 룸에 10명 이하(모둠별 방 코드)로 쓰면 월 한도 걱정 없음.** 40명을 한 방에 넣으면 수업 1~2회 만에 월 한도에 근접할 수 있음.

> anon key는 공개되어도 되는 키지만, Realtime 외 DB 기능을 쓰지 않으므로 위험 없음.

## 3. 멀티플레이 켜기 — 방법 B: 교내망 릴레이 (인터넷 한도 없음)

교사 PC에서:
```cmd
cd ChemVerse\server
npm install ws
node relay.js
```
- 교사 PC IP가 예: 192.168.0.10 이면 학생 접속: `http://192.168.0.10:8080` (relay.js가 정적 파일도 함께 서빙)
- 장점: 한도 없음, 지연 최소. 단점: 학교 Wi-Fi가 기기 간 통신을 막으면 불가 → 사전 테스트 필요

## 4. 문제 해결
| 증상 | 조치 |
|---|---|
| 태블릿에서 검은 화면 | 브라우저 최신화(크롬/사파리), 시크릿 모드 해제 |
| 멀티플레이 연결 안 됨 | HUD 상태 뱃지 확인 → 자동으로 솔로 모드 폴백됨. config.js 키 재확인 |
| 프레임 저하 | 로비에서 그래픽 '태블릿' 모드 선택 (기본값) |
