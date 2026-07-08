# 단축 URL 관리 — Cloudflare Worker 엔드포인트 추가 안내

앱의 "단축 URL 보기·관리" 기능 중 **삭제**와 **관리자 전체 관리**는 Worker에 아래 엔드포인트가 있어야 동작합니다.
(목록 보기·열기·복사·연결 수정은 추가 배포 없이 바로 됩니다.)

기존 Worker(`classmate-links.suhun099.workers.dev`)의 `fetch` 라우팅에 아래 분기를 추가하세요.

## 1) 관리자 토큰 시크릿 추가 (한 번만)

```
npx wrangler secret put ADMIN_TOKEN
# 값: 외부에 노출되지 않는 임의의 긴 문자열 (앱에서 관리자가 직접 입력)
```

> 생성용 `x-token`(앱에 내장)과 **다른** 비밀값이어야 합니다. 이 값이 관리자 권한 열쇠입니다.

## 2) 라우트 추가 (KV 네임스페이스 이름은 기존 `LINKS` 기준)

```js
// === /api/delete : 생성자 본인 삭제 (슬러그의 수정키로 인증) ===
if (url.pathname === '/api/delete' && request.method === 'POST') {
  const { slug, key } = await request.json();
  const raw = await env.LINKS.get(slug);
  if (!raw) return new Response('not found', { status: 404 });
  let rec; try { rec = JSON.parse(raw); } catch { rec = { target: raw }; }
  if (!rec.key || rec.key !== key) return new Response('forbidden', { status: 403 });
  await env.LINKS.delete(slug);
  return new Response('ok', { status: 200 });
}

// === /api/admin/list : 관리자 전체 목록 ===
if (url.pathname === '/api/admin/list' && request.method === 'GET') {
  if (request.headers.get('x-admin') !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });
  const list = await env.LINKS.list();
  const out = [];
  for (const k of list.keys) {
    const raw = await env.LINKS.get(k.name);
    let rec = {}; try { rec = JSON.parse(raw); } catch { rec = { target: raw }; }
    out.push({ slug: k.name, target: rec.target || '', expiry: k.expiration || null });
  }
  return Response.json(out);
}

// === /api/admin/delete : 관리자 임의 삭제 ===
if (url.pathname === '/api/admin/delete' && request.method === 'POST') {
  if (request.headers.get('x-admin') !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });
  const { slug } = await request.json();
  await env.LINKS.delete(slug);
  return new Response('ok', { status: 200 });
}
```

> ⚠️ 위 코드는 `/api/create`가 KV에 `JSON.stringify({ target, key })` 형태로 저장한다고 가정합니다.
> 실제 저장 형식이 다르면 `rec.target` / `rec.key` 부분만 맞춰주세요.

## 3) 배포

```
npx wrangler deploy
```

배포 후 앱에서:
- 🗑 삭제 → 본인이 만든 URL은 바로 삭제됩니다.
- 🔑 전체 URL 관리 → ADMIN_TOKEN 입력 시 모든 URL을 보고 삭제할 수 있습니다.

---

# 영역 OCR (Pro) — /api/ocr 엔드포인트 추가 안내

앱의 "🔤 영역 글자 추출 (OCR)"이 Pro 인증 사용자에 대해 회사 키로 동작하려면 아래 라우트가 필요합니다.
(미배포 상태에서는: 개인 AI 키를 설정한 사용자는 그 키로 직접 동작하고, 그 외에는 "서버에 OCR 기능 배포가 필요해요" 안내가 뜹니다.)

```js
// === /api/ocr : 영역 이미지에서 텍스트 추출 (Pro 전용, ANTHROPIC_KEY 사용) ===
if (url.pathname === '/api/ocr' && request.method === 'POST') {
  const { image, proKey } = await request.json(); // image: base64 PNG (data: 접두어 없이)
  // Pro 키 검증 (pro-verify와 동일한 PROKEYS 대조)
  const rec = proKey ? await env.PROKEYS.get(proKey) : null;
  if (!rec) return Response.json({ ok: false, message: 'invalid proKey' }, { status: 403 });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', // OCR 정확도를 위해 Sonnet 사용 (Haiku는 영역 OCR 인식률이 낮음)
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
        { type: 'text', text: '이미지에 보이는 모든 텍스트를 원문 그대로, 줄바꿈을 유지해서 정확하게 추출해줘. 표나 목록의 구조도 최대한 유지하고, 설명 없이 추출한 텍스트만 출력해.' },
      ] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) return Response.json({ ok: false, message: (data.error && data.error.message) || 'upstream error' }, { status: 502 });
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return Response.json({ ok: true, text });
}
```

> 만료 키 처리(`until` 필드)가 pro-verify에 있다면 같은 검증을 여기에도 복사하세요.

---

# 회의 녹음 화자분리·요약 (Pro) — /api/meeting/submit, /api/meeting/status 엔드포인트 추가 안내

앱의 "🎙️ 회의 녹음·화자분리·요약" 기능은 [AssemblyAI](https://www.assemblyai.com/)로 화자분리(diarization)
전사를 처리합니다. 오디오가 길면 처리에 시간이 걸리므로, 제출(submit)과 상태 확인(status)을 분리한
비동기 job 방식입니다. **AssemblyAI 계정을 만들고 API 키를 발급받아 아래처럼 시크릿으로 등록하세요.**

```
npx wrangler secret put ASSEMBLYAI_KEY
# 값: AssemblyAI 대시보드에서 발급받은 API 키
```

```js
// === /api/meeting/submit : 녹음 파일 업로드 → AssemblyAI에 화자분리 전사 요청 제출 ===
if (url.pathname === '/api/meeting/submit' && request.method === 'POST') {
  const proKey = url.searchParams.get('proKey');
  const rec = proKey ? await env.PROKEYS.get(proKey) : null;
  if (!rec) return Response.json({ ok: false, message: 'invalid proKey' }, { status: 403 });
  const audioBuf = await request.arrayBuffer(); // 앱이 application/octet-stream으로 오디오 원본을 보냄
  // 1) AssemblyAI에 오디오 업로드 → 임시 URL 발급
  const upRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: env.ASSEMBLYAI_KEY },
    body: audioBuf,
  });
  const upData = await upRes.json();
  if (!upRes.ok || !upData.upload_url) return Response.json({ ok: false, message: 'upload failed' }, { status: 502 });
  // 2) 화자분리(speaker_labels) 전사 작업 생성 — 한국어 지정
  const trRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: env.ASSEMBLYAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: upData.upload_url, speaker_labels: true, language_code: 'ko' }),
  });
  const trData = await trRes.json();
  if (!trRes.ok || !trData.id) return Response.json({ ok: false, message: 'transcript request failed' }, { status: 502 });
  return Response.json({ ok: true, id: trData.id });
}

// === /api/meeting/status : 전사 작업 상태 확인 (완료되면 화자별 발언 목록 반환) ===
if (url.pathname === '/api/meeting/status' && request.method === 'GET') {
  const proKey = url.searchParams.get('proKey');
  const rec = proKey ? await env.PROKEYS.get(proKey) : null;
  if (!rec) return Response.json({ ok: false, message: 'invalid proKey' }, { status: 403 });
  const id = url.searchParams.get('id');
  const stRes = await fetch('https://api.assemblyai.com/v2/transcript/' + id, {
    headers: { authorization: env.ASSEMBLYAI_KEY },
  });
  const stData = await stRes.json();
  if (!stRes.ok) return Response.json({ ok: false, message: 'status check failed' }, { status: 502 });
  if (stData.status === 'error') return Response.json({ ok: true, status: 'error' });
  if (stData.status !== 'completed') return Response.json({ ok: true, status: stData.status });
  const utterances = (stData.utterances || []).map(u => ({ speaker: u.speaker, text: u.text }));
  return Response.json({ ok: true, status: 'completed', utterances, text: stData.text });
}
```

> 미배포 상태에서는 앱이 "전사 요청 실패" 메시지를 보여주지만, **녹음 파일 자체는 서버 상태와 무관하게
> 항상 로컬에 먼저 저장**되므로 원본은 유실되지 않습니다.

---

# 다운로드 랜딩 페이지 집계 — /download, /api/download-count 엔드포인트 추가 안내

`docs/index.html`(GitHub Pages 다운로드 랜딩 페이지)의 모든 다운로드 버튼은 GitHub 직링크가 아니라
기존 Worker(`classmate-links.suhun099.workers.dev`)의 `/download`를 거치도록 되어 있습니다.
집계 누락을 막기 위한 것이므로, 아래 라우트를 기존 `fetch` 핸들러에 추가하세요.
KV 네임스페이스는 기존 `LINKS`를 그대로 재사용하고, 카운터는 `download_count:win` /
`download_count:mac` 키로 별도 저장하므로 기존 단축URL 슬러그와 충돌하지 않습니다.

```js
const RELEASE_URLS = {
  win: 'https://github.com/Sooni95/classmate-desktop/releases/latest/download/KocoMate-portable.exe',
  mac: 'https://github.com/Sooni95/classmate-desktop/releases/latest/download/KocoMate-Setup-mac.dmg',
};

// === /download : 다운로드 집계 후 GitHub Release 파일로 리다이렉트 ===
if (url.pathname === '/download') {
  const os = url.searchParams.get('os');
  if (os !== 'win' && os !== 'mac') {
    return new Response('Invalid os parameter. Use ?os=win or ?os=mac', { status: 400 });
  }
  const key = `download_count:${os}`;
  const current = parseInt((await env.LINKS.get(key)) || '0', 10);
  await env.LINKS.put(key, String(current + 1));
  return Response.redirect(RELEASE_URLS[os], 302);
}

// === /api/download-count : 누적 다운로드 수 조회 (CORS 허용, 랜딩 페이지에서 fetch) ===
if (url.pathname === '/api/download-count') {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  }
  const win = parseInt((await env.LINKS.get('download_count:win')) || '0', 10);
  const mac = parseInt((await env.LINKS.get('download_count:mac')) || '0', 10);
  return new Response(JSON.stringify({ win, mac, total: win + mac }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
```

> `RELEASE_URLS`는 `latest` 릴리즈의 실제 파일명(`KocoMate-portable.exe`, `KocoMate-Setup-mac.dmg`)
> 기준입니다. 2026-07-09 "코코메이트" 리브랜딩 이후 파일명이 `ClassMate-*` → `KocoMate-*`로
> 바뀌었으니, 이 상수를 반드시 최신 파일명으로 갱신하세요 — 안 그러면 다운로드 버튼이 404로 깨집니다.
> Windows·macOS 빌드는 `build.yml`의 `build-win`/`build-mac` job이 push마다 자동으로 같은
> `latest` 릴리즈에 두 파일을 함께 올립니다.

## 배포

---

# 다운로드 신청자 정보 수집 — /api/lead, /api/admin/leads 엔드포인트 추가 안내

다운로드 버튼을 누르면 소속·성명·직급·전화번호·이메일과 개인정보 수집·이용 동의(필수)·
마케팅 활용 동의(선택)를 입력받는 폼이 먼저 뜹니다(`docs/index.html`의 `#leadOverlay`).
제출 성공 시에만 실제 다운로드(`/download?os=...`)로 넘어갑니다. 수집한 정보는
`docs/admin-leads.html`에서 `ADMIN_TOKEN`으로 확인할 수 있습니다(별도 배포 불필요, KV만 재사용).

```js
// === /api/lead : 다운로드 신청자 정보 저장 ===
if (url.pathname === '/api/lead' && request.method === 'POST') {
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, message: '형식 오류' }, { status: 400 }); }
  const org = String(body.org || '').trim().slice(0, 100);
  const name = String(body.name || '').trim().slice(0, 50);
  const position = String(body.position || '').trim().slice(0, 50);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const email = String(body.email || '').trim().slice(0, 100);
  const consent = body.consent === true;
  const marketing = body.marketing === true;
  const os = (body.os === 'mac') ? 'mac' : 'win';
  if (!org || !name || !position || !phone || !email)
    return Response.json({ ok: false, message: '필수 항목을 모두 입력해 주세요' }, { status: 400 });
  if (!consent)
    return Response.json({ ok: false, message: '개인정보 수집·이용에 동의해야 다운로드할 수 있어요' }, { status: 400 });
  const id = 'lead:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await env.LINKS.put(id, JSON.stringify({ org, name, position, phone, email, consent, marketing, os, date: new Date().toISOString() }));
  return Response.json({ ok: true });
}

// === /api/admin/leads : 관리자 전용 — 다운로드 신청자 목록 (최신순) ===
if (url.pathname === '/api/admin/leads' && request.method === 'GET') {
  if (request.headers.get('x-admin') !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });
  const list = await env.LINKS.list({ prefix: 'lead:' });
  const out = [];
  for (const k of list.keys) {
    const raw = await env.LINKS.get(k.name);
    if (raw) out.push(JSON.parse(raw));
  }
  out.sort((a, b) => new Date(b.date) - new Date(a.date));
  return Response.json(out);
}
```

> `ADMIN_TOKEN` 시크릿은 앞서 단축URL 관리 기능을 위해 이미 등록했다면 그대로 재사용합니다
> (새로 만들 필요 없음). `docs/admin-leads.html`을 열어 같은 토큰을 입력하면 목록이 보입니다.

## 배포

```
npx wrangler deploy
```

배포 후 `docs/index.html`의 다운로드 버튼(Windows/Mac)을 각각 눌러 리다이렉트가 되는지,
`/api/download-count`가 `{ win, mac, total }`을 반환하는지 확인하세요.

## 기존 도메인(kocoafab.cc)의 서브도메인으로 전환하기 (신뢰도 개선)

지금은 다운로드 버튼이 `classmate-links.suhun099.workers.dev`(개인 계정명이 노출되는 기본 workers.dev 주소)를
거칩니다. 동작에는 문제없지만 낯선 주소로 잠깐 이동하므로 다소 수상해 보일 수 있어, 새 도메인을 사는 대신
**이미 쓰고 있는 `kocoafab.cc`의 서브도메인**을 쓰기로 했습니다. `kocoafab.cc` 루트는 이미 코코아팹 공식
쇼핑몰/홈페이지가 운영 중이라 겹치지 않게 서브도메인 `classmate.kocoafab.cc`를 사용합니다. 이렇게 하면
다운로드 버튼이 `/download?os=win`처럼 **상대경로**가 되어 주소창에 외부 도메인이 전혀 보이지 않습니다.

> 서브도메인 이름을 다르게 하고 싶다면(예: `download.kocoafab.cc`), 아래 절차의 `classmate.kocoafab.cc`를
> 원하는 이름으로 바꾸고 `docs/index.html`의 `WORKER_BASE` 분기 조건도 같이 바꾸세요.

### 1) kocoafab.cc가 Cloudflare에 있는지 확인

`kocoafab.cc`의 DNS/Worker가 이미 Cloudflare 계정에서 관리되고 있다면(기존 `classmate-links` Worker와 같은
계정일 가능성이 높음) 별도 이전 없이 바로 아래 단계로 진행할 수 있습니다. 다른 곳(가비아 등)에서 관리 중이라면
해당 등록기관에서 네임서버를 Cloudflare로 변경해야 합니다.

### 2) 랜딩페이지를 Cloudflare Pages로 배포

이 저장소(`classmate-desktop`)의 `docs/` 폴더를 그대로 소스로 씁니다. GitHub Pages 대신(또는 함께) 사용:

1. Cloudflare 대시보드 → **Workers & Pages → Create → Pages → Connect to Git**
2. 저장소 `Sooni95/classmate-desktop` 선택, **Build output directory**를 `docs`로 지정 (빌드 명령 없음, 정적 파일 그대로 배포)
3. 배포된 Pages 프로젝트 → **Custom domains → Set up a custom domain** → `classmate.kocoafab.cc` 연결

### 3) 다운로드 Worker를 같은 서브도메인의 경로로 라우팅

1. 기존 Worker(`classmate-links`) → **Settings → Domains & Routes → Add Route**
2. Route에 `classmate.kocoafab.cc/download*`와 `classmate.kocoafab.cc/api/download-count*` 두 개 추가 (Zone: kocoafab.cc)
3. 이제 `https://classmate.kocoafab.cc/download?os=win`, `https://classmate.kocoafab.cc/api/download-count`가 같은 도메인에서 동작

### 4) 코드에서 확인할 것

`docs/index.html`은 이미 준비되어 있습니다 — `location.hostname`이 `classmate.kocoafab.cc`이면 자동으로
상대경로를 쓰도록 분기해뒀으므로, 위 1~3단계만 끝내면 **코드를 더 손댈 필요 없이** 그대로 동작합니다.

```js
var WORKER_BASE = (location.hostname === "classmate.kocoafab.cc") ? "" : "https://classmate-links.suhun099.workers.dev";
```
