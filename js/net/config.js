// ═══════════════════════════════════════════════════════════
// ChemVerse 네트워크 설정 — ★ 교사 수정 지점 ★
// docs/DEPLOY.md 2절 참고. Supabase 무료 가입 후 아래 두 값만 채우면
// 멀티플레이가 활성화됩니다. 비워두면 자동으로 솔로 모드로 동작합니다.
// ═══════════════════════════════════════════════════════════

export const SUPABASE_URL = "";        // 예: "https://abcdefgh.supabase.co"
export const SUPABASE_ANON_KEY = "";   // 예: "eyJhbGciOi..." (anon public 키 — 공개되어도 안전)

// 기본 접속 모드: 'auto' | 'solo' | 'supabase' | 'wsrelay'
// 'auto' = Supabase 키가 있으면 supabase, 없으면 solo
export const DEFAULT_MODE = "auto";

// wsrelay 모드일 때 릴레이 주소 (교사 PC에서 node server/relay.js 실행 시)
// 페이지를 relay가 서빙하면 자동 감지되므로 보통 비워둠
export const WSRELAY_URL = "";         // 예: "ws://192.168.0.10:8080"

// 아바타 상태 전송률(Hz)·정지 시 keepalive(ms) — 무료 티어 트래픽 보호용. 올리지 말 것
export const SEND_HZ = 2;
export const KEEPALIVE_MS = 5000;
