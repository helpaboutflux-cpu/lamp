/* Lamp — 환경 설정 */

export const CONFIG = {
  version: '1.1.0',

  // Cloudflare Workers + KV 정적 호스팅 엔진
  edge: 'https://lamp-edge.helpaboutflux.workers.dev',

  // Supabase Auth (로그인 전용. 서비스 키는 프론트엔드에 없다)
  supabase: {
    url: 'https://foisgisqbyaykrlddvio.supabase.co',
    key: 'sb_publishable_HyWOEZAtTR0r2lUYBjK6Sw_cn-yUdXD'
  },

  // LK ID 로그인 (승인 화면은 Soft Hub가 제공하고, 코드 교환은 엔진이 한다)
  // client_id는 엔진 설정(/api/config)에서 내려온다. 여기에 적으면 그 값이 우선한다.
  lk: {
    authorize: 'https://helpaboutflux-cpu.github.io/cream-ai-hub-android/oauth.html',
    clientId: 'lkc_lampwebdeploy20261122',
    scope: 'profile:basic'
  },

  // OAuth 뒤 돌아올 주소의 기본값. 실제로는 지금 열린 주소(appRoot)를 쓴다.
  site: 'https://lamp-edge.helpaboutflux.workers.dev/'
};
