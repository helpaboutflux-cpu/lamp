/* Lamp — 환경 설정 */

export const CONFIG = {
  version: '1.0.0',

  // Cloudflare Workers + KV 정적 호스팅 엔진
  edge: 'https://lamp-edge.helpaboutflux.workers.dev',

  // Supabase Auth (로그인 전용. 서비스 키는 프론트엔드에 없다)
  supabase: {
    url: 'https://foisgisqbyaykrlddvio.supabase.co',
    key: 'sb_publishable_HyWOEZAtTR0r2lUYBjK6Sw_cn-yUdXD'
  },

  // LK ID 로그인 (client_id 등록 후 동작)
  lk: {
    authorize: 'https://helpaboutflux-cpu.github.io/cream-ai-hub-android/oauth.html',
    clientId: '',
    scope: 'profile:basic'
  },

  site: 'https://helpaboutflux-cpu.github.io/lamp/'
};
