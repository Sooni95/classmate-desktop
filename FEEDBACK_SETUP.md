# 의견 보내기(피드백) 백엔드 설정 — ksh0502@nepes.co.kr 수신

앱은 의견을 Cloudflare Worker의 `POST /api/feedback` 로 보냅니다(이미 쓰는 워커 그대로).
워커에 아래 라우트를 추가하면 메일이 발송됩니다. 메일 발송은 **Google Apps Script**가 가장 간단·확실합니다.

## 1) Google Apps Script 웹앱 (메일 실제 발송) — 추천
script.google.com → 새 프로젝트 → 아래 붙여넣기 → 배포 → "웹 앱" → 액세스: 모든 사용자.
배포 URL을 복사해 워커 시크릿 `FEEDBACK_FORWARD` 에 저장.

```javascript
function doPost(e){
  var d = JSON.parse(e.postData.contents || '{}');
  MailApp.sendEmail({
    to: 'ksh0502@nepes.co.kr',
    subject: '[ClassMate 의견] ' + (d.meta || ''),
    body: (d.message || '') + '\n\n— 회신처: ' + (d.contact || '(없음)') + '\n— 버전: ' + (d.meta || '')
  });
  return ContentService.createTextOutput('ok');
}
```

## 2) Cloudflare Worker 라우트 (기존 워커의 fetch 핸들러에 추가)
```javascript
if (url.pathname === '/api/feedback' && request.method === 'POST') {
  const body = await request.text();
  // (선택) 유실 방지용으로 KV에도 저장
  try { if (env.PROKEYS) await env.PROKEYS.put('fb:' + Date.now(), body, { expirationTtl: 60*60*24*90 }); } catch(_) {}
  // Apps Script로 전달 → 메일 발송
  if (env.FEEDBACK_FORWARD) {
    const r = await fetch(env.FEEDBACK_FORWARD, { method:'POST', headers:{'Content-Type':'application/json'}, body });
    return new Response(await r.text(), { status: r.ok ? 200 : 502, headers: cors });
  }
  return new Response('stored', { status: 200, headers: cors });
}
```
배포 후 앱의 [⚙ 설정 → 의견 보내기]에서 전송하면 "접수되었습니다."가 뜨고 메일이 도착합니다.
