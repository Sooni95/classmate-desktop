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
  win: 'https://github.com/Sooni95/classmate-desktop/releases/latest/download/ClassMate-portable.exe',
  mac: 'https://github.com/Sooni95/classmate-desktop/releases/latest/download/ClassMate-Setup-mac.dmg',
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

> ⚠️ `RELEASE_URLS`는 현재 자동 빌드(`build.yml`)가 배포하는 `latest` 릴리즈의 실제 파일명
> (`ClassMate-portable.exe`)을 기준으로 했습니다. **Mac 빌드는 아직 CI로 자동 배포되지 않으므로**,
> `ClassMate-Setup-mac.dmg`를 `latest` 릴리즈에 수동으로(`npm run dist:mac` 후 업로드) 올리기 전까지는
> Mac 다운로드 버튼이 404로 연결됩니다. Mac 빌드를 자동화하려면 `build.yml`에 macOS 러너 job을 추가하세요.

## 배포

```
npx wrangler deploy
```

배포 후 `docs/index.html`의 다운로드 버튼(Windows/Mac)을 각각 눌러 리다이렉트가 되는지,
`/api/download-count`가 `{ win, mac, total }`을 반환하는지 확인하세요.
