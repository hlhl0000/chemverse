// ═══════════════════════════════════════════════════════════
// ARENA 네트워크 설정 — ★ 교사 수정 지점 ★ (소유: Fable)
// 본편(ChemVerse)과 같은 Supabase 프로젝트를 사용하되 룸 키에 'arena:' 접두사로 분리.
// 수업 본번(동시 다인 대전)은 교내망 릴레이 권장: node arena/server/relay.js
// URL 파라미터로 강제 가능: ?net=solo | supabase | wsrelay
// ═══════════════════════════════════════════════════════════

export const SUPABASE_URL = "https://wmfpimitvymxkzbzckuk.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZnBpbWl0dnlteGt6Ynpja3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3OTc3MjQsImV4cCI6MjA5OTM3MzcyNH0.YEuoYMlSnghx1C55JqV8BIl1WZsHNeMqMYt-tUgBP7U"; // anon public 키 — 공개 안전

// 기본 접속 모드: 'auto' = wsrelay 단서(릴레이 서빙/WSRELAY_URL) 우선, 다음 supabase, 없으면 solo
export const DEFAULT_MODE = "auto";

// 교내망 릴레이 주소 (릴레이가 페이지를 직접 서빙하면 자동 감지되므로 보통 비워둠)
export const WSRELAY_URL = ""; // 예: "ws://192.168.0.10:8080"

// 대전용 상태 전송률(Hz)·정지 시 keepalive(ms)
// ⚠ Supabase 무료 티어: 10인·8Hz·10분 매치 ≈ 43만 msg → 월 4매치 규모. 수업 본번은 wsrelay 사용!
export const SEND_HZ = 8;
export const KEEPALIVE_MS = 4000;

// 매치 규칙
export const MATCH_SECONDS = 600;   // 제한시간 10분
export const RESPAWN_SECONDS = 3;   // 리스폰 유예 (Phase B)
export const MAX_PER_ROOM = 10;     // 룸 정원
