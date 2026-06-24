# 의견 보내기 — Cloudflare 워커 설정 (메일 앱 선택창 없이 인앱 전송)

앱은 `POST https://classmate-links.suhun099.workers.dev/api/feedback` 로 보냅니다.
워커에 아래 라우트를 추가하면, 전송 시 앱에는 **"접수되었습니다."** 만 뜨고
메일이 `ksh0502@nepes.co.kr` 로 도착합니다. (메일 앱 선택창은 더 이상 안 뜸)

---

## 1) 기존 워커 fetch 핸들러에 라우트 추가

```javascript
// === /api/feedback : 사용자 의견 수신 → 메일 발송 ===
if (url.pathname === '/api/feedback' && request.method === 'POST') {
  let d = {};
  try { d = await request.json(); } catch (_) {}
  const message = (d.message || '').toString().slice(0, 4000);
  const contact = (d.contact || '').toString().slice(0, 200);
  const meta    = (d.meta || '').toString().slice(0, 60);
  if (!message.trim()) return new Response('empty', { status: 400, headers: cors });

  // (A) 유실 방지용 KV 저장 (선택 — PROKEYS 네임스페이스 재사용)
  try { if (env.PROKEYS) await env.PROKEYS.put('fb:' + Date.now(), JSON.stringify(d), { expirationTtl: 60*60*24*90 }); } catch (_) {}

  // (B) 메일 발송 — Resend (무료 3,000통/월)
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ClassMate <onboarding@resend.dev>',      // 도메인 인증 전 테스트 발신주소
        to: ['ksh0502@nepes.co.kr'],                     // 차단 시 ksh0502@kocoa.or.kr 로
        subject: '[ClassMate 의견] ' + meta,
        text: message + '\n\n— 회신처: ' + (contact || '(없음)') + '\n— 버전: ' + meta,
        reply_to: contact || undefined,
      }),
    });
    if (!r.ok) return new Response('mail-fail', { status: 502, headers: cors });
  } catch (e) {
    return new Response('mail-error', { status: 502, headers: cors });
  }

  return new Response('ok', { status: 200, headers: cors });
}
```

> `cors` 는 기존 워커의 CORS 헤더 객체를 그대로 사용. 없으면: `const cors = { 'Access-Control-Allow-Origin': '*' };`

---

## 2) Resend 준비 (5분, 무료)

1. resend.com 가입 → **API Keys** 발급
2. 워커 시크릿 저장: `npx wrangler secret put RESEND_KEY`
   (대시보드: Workers → 워커 → Settings → Variables → **RESEND_KEY** 추가, Encrypt)
3. `from` 은 테스트용 `onboarding@resend.dev` 로 바로 발송. 추후 코코아팹 도메인 인증 시 그 주소로 변경.

### NEPES 회사메일이 막힐 때
사내 서버가 외부 자동발송을 스팸 처리할 수 있음 → `to` 를 `ksh0502@kocoa.or.kr` 로 변경(코드 한 줄).

---

## 3) 배포 후 동작
- [⚙ 설정 → ✉️ 의견 보내기] → 작성 → 보내기 → "접수되었습니다." → 메일 도착
- 라우트 미배포 시 앱은 "전송에 실패했어요. 잠시 후 다시 시도" 안내 (메일 앱 선택창 안 뜸)

---

## (대안) Resend 대신 Google Apps Script
워커 (B) 블록을 아래로 교체 후, Apps Script 웹앱(MailApp.sendEmail) URL을 시크릿 `FEEDBACK_FORWARD` 에 저장:
```javascript
if (env.FEEDBACK_FORWARD) {
  const r = await fetch(env.FEEDBACK_FORWARD, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) });
  if (!r.ok) return new Response('mail-fail', { status: 502, headers: cors });
}
```
