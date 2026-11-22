# Lamp — 폴더 하나면, 사이트 하나

0원 웹 배포 플랫폼 **Lamp** v1.0입니다. 폴더나 ZIP을 끌어다 놓으면 Cloudflare Workers + KV 위에
정적 사이트가 만들어지고, 버전 되돌리기·내장 편집기·SEO 진단·폼 수집·방문자 분석·문서 생성기를
한 화면에서 씁니다.

- **앱 주소(라이브)**: https://lamp-edge.helpaboutflux.workers.dev — 이 워커가 대시보드와 호스팅을 함께 제공합니다.
- 저장소: https://github.com/helpaboutflux-cpu/lamp
  (GitHub Pages로도 띄울 수 있게 구성돼 있습니다. 저장소 Settings → Pages → Deploy from a branch: `main` / `(root)` 를 켜면 `https://helpaboutflux-cpu.github.io/lamp/` 로 열립니다. App 권한에 Pages 설정 권한이 없어 자동 활성화는 하지 못했습니다.)
- Cloudflare Pages 업로드 스크립트도 들어 있습니다(`worker/deploy_pages.py`). 이 계정에서는 아직 서브도메인이 500을 반환해 워커 호스팅을 기본으로 씁니다.
- 로그인: Supabase Auth (`foisgisqbyaykrlddvio`)

## 구성

```
index.html            앱 셸 (랜딩·로그인·대시보드 SPA)
css/styles.css        디자인 시스템 (라이트/다크, 산세리프만)
js/
  app.js              부팅·라우터·공통 이벤트
  core.js             상태·렌더 뼈대·알림·썸네일
  auth.js             Supabase Auth + LK ID 연결점
  api.js              엔진 API 클라이언트
  ui.js               커스텀 셀렉트·컬러피커·차트·에디터
  deploy.js           드래그·ZIP·GitHub·템플릿 배포
  seo.js              SEO 진단 + 문서 생성기
  qr.js               QR 인코더 (외부 라이브러리 없음)
  templates.js        스타터 템플릿 4종
  views-main.js       랜딩·로그인·대시보드·목록 화면
  views-site.js       사이트 상세(개요·배포·설정)
  views-ide.js        IDE·SEO·방문자·Forms
  views-tools.js      생성기·설정·문서
worker/
  lamp-edge.js        배포 엔진 (Workers + KV)
  wrangler.toml       wrangler 설정
  deploy_worker.py    Cloudflare API로 워커 배포
supabase_schema.sql   관계형 스키마(선택 — SQL Editor에서 1회 실행)
tests/
  engine_smoke.py     실서버 엔진 테스트
  ui_smoke.py         UI 테스트 (로컬 서버 + 네트워크 목)
  unit.test.mjs       단위 테스트 (node --test)
```

## 동작

| 기능 | 설명 |
| --- | --- |
| 배포 | 폴더·ZIP·개별 파일 드래그, GitHub 공개 저장소 가져오기, 템플릿 4종 |
| 버전 | 배포마다 버전 생성, 원클릭 롤백, 버전별 프리뷰(`/p/<slug>/<v>/`), ZIP 내려받기 |
| 규칙 파일 | `_redirects`, `_headers`, `404.html`, `index.html` |
| IDE | 파일 트리 + 구문 강조 편집기 + 실시간 미리보기(PC 분할 / 모바일 탭) → 재배포 |
| SEO | 0~100 점수, 구글·SNS 미리보기, robots.txt·sitemap.xml·404 생성 배포 |
| Forms | 폼 생성, `POST /f/<formId>` 로 접수, 제출 목록·CSV |
| 분석 | 일별·시간별 페이지 조회, 실시간 3시간, A/B 변형별 조회 |
| 안전 | 1분 5회 배포 제한, 피싱·난독화 스크립트 사전 검사, 비밀번호 잠금 |
| 생성기 | 개인정보 처리방침, 이용약관, ads.txt, 404, QR·배지, 이미지 압축 |

### 한도

- 계정당 사이트 **10개**, 사이트당 **10MB**, 한 번에 300개 파일
- 사이트당 버전 20개 보관, 배포 속도 1분 5회

## 배포 엔진 (Cloudflare Workers + KV)

`worker/lamp-edge.js` 한 파일로 동작하며 외부 의존성이 없습니다.

```bash
cd worker
CF_API_TOKEN=... CF_ACCOUNT_ID=... LAMP_KV_ID=... \
LAMP_ADMIN_KEY=... LAMP_SECRET_SALT=... \
python3 deploy_worker.py --token "$CF_API_TOKEN" --account "$CF_ACCOUNT_ID" \
  --kv "$LAMP_KV_ID" --admin-key "$LAMP_ADMIN_KEY" --salt "$LAMP_SECRET_SALT"
```

바인딩

| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `LAMP_KV` | KV namespace | 사이트·버전·파일·집계·폼 |
| `SUPABASE_URL` | plain | `https://foisgisqbyaykrlddvio.supabase.co` |
| `SUPABASE_ANON_KEY` | plain | publishable key (공개 키) |
| `PUBLIC_BASE` | plain | `https://lamp-edge.helpaboutflux.workers.dev` |
| `ADMIN_KEY` | secret | 운영·CI용 관리자 키 |
| `SECRET_SALT` | secret | 비밀번호 쿠키 서명 키 |

서비스(secret) 키는 **워커에 넣지 않습니다.** 워커는 사용자 액세스 토큰을 Supabase
`/auth/v1/user` 로 검증하기만 하고, 시크릿 키는 프론트엔드에도 워커에도 저장하지 않습니다.

### 대시보드 올리기 (엔진이 직접 서빙)

```bash
python3 worker/upload_dashboard.py --token "$CF_API_TOKEN" --account "$CF_ACCOUNT_ID" --kv "$LAMP_KV_ID"
```

정적 파일 전체를 KV 키 하나(`dash:files`)에 담아 **쓰기 1회**로 올립니다. 워커는 60초 캐시 후 새 번들을 읽습니다.

### KV 연산 절약

무료 티어는 하루 쓰기·삭제·목록 1,000회로 제한됩니다. 그래서:

- 배포 1회 = **쓰기 3회** (파일을 한 개 번들 값으로 저장 + 버전 인덱스 + 사이트 메타)
  * 2MB를 넘는 큰 사이트만 파일별 키로 나눠 저장합니다.
- 방문 집계는 메모리에 모아 **시간이 바뀔 때 한 번만** 기록합니다(사이트당 시간당 1회).
- 목록 조회(`KV.list`)를 쓰지 않고 인덱스 키를 읽습니다.
- 배포 속도 제한은 메모리 카운터를 먼저 봅니다.

## 로그인

- **이메일 링크 / 코드** — 지금 바로 동작합니다(Supabase email provider).
- **GitHub** — Supabase → Authentication → Providers → GitHub 에 OAuth 앱을 등록하면 켜집니다.
  (callback: `https://foisgisqbyaykrlddvio.supabase.co/auth/v1/callback`)
- **LK ID** — `js/config.js` 의 `lk.clientId` 가 채워지면 동작합니다(LK 쪽에 redirect URL 등록 필요).

## 테스트

```bash
# 엔진 (실서버)
python3 tests/engine_smoke.py

# UI (로컬 정적 서버 + 가짜 API — KV 연산 없음)
python3 tests/ui_smoke.py

# 단위
node --test tests/unit.test.mjs
```

## 원칙

이모지 0건, 세리프·궁서 폴백 없음, 브라우저 팝업(alert/confirm/prompt) 대신 인라인 UI,
`<select>`·`<input type="color">` 대신 자체 컴포넌트, 개발자 실명을 예시로 쓰지 않습니다.
