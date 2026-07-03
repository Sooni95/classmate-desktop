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
