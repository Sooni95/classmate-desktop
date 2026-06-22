# 연수생 온라인 접속 보드 — 설계안 (#8, 다음 단계)

데스크탑 단독으로는 실시간 공유가 불가능합니다(여러 참가자 간 실시간 동기화 = 서버 필수).
기존 인프라(Cloudflare Workers + KV)에 **Durable Object(DO) + WebSocket**을 더하면 가장 깔끔합니다.

## 구조
```
[발표자 ClassMate]  ──방 생성──▶  Worker /room/new  →  6자리 접속코드(예: 7K2Q9X)
                                       │
[연수생 브라우저] ──코드 입력──▶  Worker /room/{code}  →  Durable Object(방) WebSocket
                                       │
   포스트잇 추가/이동/수정 · 이미지 붙여넣기 → DO가 모든 접속자에게 broadcast
```
- **Durable Object**: 방 1개 = DO 1개. 접속자 WebSocket 목록 유지, 메시지 relay + 현재 보드 상태(postit 배열) 보관.
- **접속코드**: KV `ROOMS`에 code→DO id 매핑(만료 TTL 4시간).
- **연수생 측**: 설치 불필요한 **웹 페이지**(GitHub Pages에 호스팅). 코드 입력 → WebSocket 접속 → 포스트잇 작성. (앱 설치 강요 안 함)
- **이미지 붙여넣기**: 클라이언트에서 리사이즈(예: 최대 1024px) 후 base64 → DO 경유 broadcast. 용량 큰 원본은 R2 업로드 후 URL 공유로 확장 가능.

## 메시지 프로토콜(초안)
```json
{ "t": "join", "name": "홍길동" }
{ "t": "add", "id": "p_ab12", "x": 120, "y": 80, "text": "질문 있어요", "color": "#ffe14d" }
{ "t": "move", "id": "p_ab12", "x": 300, "y": 140 }
{ "t": "edit", "id": "p_ab12", "text": "수정됨" }
{ "t": "img",  "id": "p_cd34", "x": 200, "y": 200, "data": "data:image/jpeg;base64,..." }
{ "t": "del",  "id": "p_ab12" }
{ "t": "state","postits": [ ... ] }   // 신규 접속자에게 현재 상태 전송
```

## 단계별 진행
1. Worker에 `/room/new`, `/room/{code}`(WebSocket 업그레이드) + DO 클래스 추가, KV `ROOMS` 바인딩.
2. 연수생용 단일 HTML 페이지(접속코드 입력 → 캔버스/포스트잇 보드, 이미지 붙여넣기).
3. ClassMate 앱: "온라인 보드 시작" → 방 생성, 접속코드를 **화면에 크게 + QR**로 표시(기존 QR 기능 재사용), 앱도 같은 보드에 참여.
4. 기존 핀/메모를 온라인 포스트잇으로 승격(드래그·색·이미지).

> 분량이 커서 별도 작업으로 진행 권장. 위 구조로 착수하면 됩니다.
