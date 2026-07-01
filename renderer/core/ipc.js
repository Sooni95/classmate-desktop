/* ===== IPC 브리지 단일 통로 =====
   preload.js가 노출한 window.cm(contextBridge)의 유일한 참조 지점.
   다른 모듈은 window.cm을 직접 쓰지 말고 ipc.*를 호출할 것 (ARCHITECTURE.md core/ipc.js 규칙).
   실제 net.fetch는 main.js에서만 실행됨(CLAUDE.md §3.4) — 여기선 그 IPC 브리지만 감싼다. */
const ipc = window.cm;
