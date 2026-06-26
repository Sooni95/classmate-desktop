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
