# ClassMate Desktop — 코코아팹 강사툴

한국 초등 교사를 위한 **올인원 수업 보조 오버레이**(Windows 데스크탑, Electron).
모든 프로그램 위에 투명하게 떠서, 도구를 쓸 때만 입력을 받고 평소엔 클릭이 아래로 통과됩니다.

## 주요 기능

- **타이머 / 스톱워치** — 원형 표시 + 분리 플로팅
- **뽑기·게임** — 발표자 뽑기(이름/번호/모둠), 제비뽑기, 돌림판, 핀볼(물리 시뮬), 모둠 점수판, 주사위, 신호등, 칠판 가리개(커튼형)
- **펜(주석)** — 펜·형광펜·글자·박스(Ctrl+드래그)·지우개, 휠로 굵기, 검정/흰색 포함 색상
- **포인터** — 커서 링+클릭 강조, 스포트라이트(원/사각), 돋보기(휠 배율 / Ctrl+휠 원 크기)

- **소음 측정** — 폭탄 게이지(기준 초과 지속 시 충전 → 폭발)
- **핀 / 카메라** — 화면 캡처·웹캠 촬영을 핀으로 고정 + 핀 위 메모
- **QR / 단축URL** — 오프라인 QR + `코코아팹.kr/한글이름` 단축주소(만료 설정, 동적 QR), PNG 저장/복사
- **다문화 번역** — 한국어 → 베트남·중국·러시아·필리핀·우즈베크·태국·일본·영어 텍스트 번역(BYO Anthropic 키), 번역문 듣기. 음성 실시간 번역은 구현 예정
- **메모** — 부분 글자 크기, 복사, txt 저장, 음성 녹음

## 빠른 시작

```bash
npm install
npm start        # 로컬 실행
```

## 빌드

main 브랜치에 push하면 GitHub Actions가 Windows EXE를 빌드해 `latest` 릴리즈에 올립니다.
직접 빌드하려면 **Windows 환경에서** `npm run dist`.

## 구조

| 파일 | 역할 |
|---|---|
| `main.js` | Electron 메인 — 창/멀티모니터/캡처/IPC/단축키/트레이 |
| `preload.js` | `window.cm.*` API 브리지 |
| `renderer/index.html` | UI 구조 + 전체 CSS |
| `renderer/app.js` | 모든 기능 로직 |
| `assets/` | 로고·트레이 아이콘·오프라인 QR 라이브러리 |

## 외부 인프라 (단축URL)

Cloudflare Workers + KV, 도메인 `코코아팹.kr`. 단축URL 생성은 `main.js`의 `shorten` IPC가 처리합니다.

## 다운로드 랜딩 페이지

`docs/index.html`이 공식 다운로드 페이지입니다. **기존 도메인 `kocoafab.cc`의 서브도메인
(`classmate.kocoafab.cc`)에 Cloudflare Pages로 배포하는 것이 최종 목표**입니다 — 다운로드 버튼과 Worker
엔드포인트가 같은 도메인에 있어야 `/download`가 상대경로로 동작하고 workers.dev 주소가 주소창에 노출되지 않습니다.
자세한 절차는 [WORKER_ENDPOINTS.md](WORKER_ENDPOINTS.md)의 "기존 도메인(kocoafab.cc)의 서브도메인으로 전환하기" 섹션 참고.

서브도메인 연결 전 임시로 GitHub Pages에서도 확인 가능합니다(이 경우 다운로드는 workers.dev를 그대로 거침):
1. 이 저장소 GitHub Settings → Pages → Source에서 Branch `main` / Folder `/docs` 선택 후 저장.
2. `https://sooni95.github.io/classmate-desktop/`에서 페이지 확인.
3. `docs/index.html` 안의 YouTube `iframe` `src`(`PLACEHOLDER_VIDEO_ID`)를 실제 시연 영상 ID로 교체.

> ⚠️ 저장소가 Private면 GitHub Pages는 유료 플랜에서만 지원됩니다. `classmate.kocoafab.cc` + Cloudflare Pages로
> 전환하면 저장소를 Public으로 바꿀 필요 없이(Cloudflare Pages는 Private 저장소도 연결 가능) 해결됩니다.

---
ⓒ 네패스 코코아팹 — 컬러 `#F68C1F`
