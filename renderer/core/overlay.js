/* ===== 클릭 통과(click-through) 관리 =====
   [클릭통과 규칙] (CLAUDE.md §3.3) — 이 파일이 클릭통과의 유일한 소유자.
   새 입력 캡처 모드(필기/드래그/캡처 등)는 여기 조건을 직접 고치지 말고
   registerCaptureMode()로 등록할 것. */
let ignoring = true;
let dockEditing = false; // 독 편집 중에는 click-through를 끄고 고정 (드래그 끊김 방지)
function setIgnore(v){ if(ignoring!==v){ ignoring=v; ipc.setIgnore(v); } }

const captureModes = [];     // 활성화 시 클릭통과를 끄는 입력 모드들
const pointerHideModes = []; // 활성화 시 커스텀 포인터(링/스폿/렌즈)를 숨기는 모드들
// fn: () => boolean. opts.hidesPointer=false면 클릭통과만 관여하고 커스텀 포인터 표시엔 영향 없음 (예: 캡처 스닙)
function registerCaptureMode(fn, opts={}){
  captureModes.push(fn);
  if (opts.hidesPointer !== false) pointerHideModes.push(fn);
}

document.addEventListener('mousemove', e => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const overUI = !!(el && el.closest('.iv'));
  // 포인터(링/스포트/렌즈)·펜 모드일 때 독·툴바 위에서는 커스텀 포인터를 숨겨 시스템 커서가 보이게
  document.body.classList.toggle('ptr-over-ui', overUI && pointerHideModes.some(fn => fn()));
  // 독 편집 중에는 커서가 독을 잠깐 벗어나도 입력을 계속 받도록 통과 전환을 막음
  if (dockEditing || captureModes.some(fn => fn())) { setIgnore(false); trackPtr(e); return; }
  setIgnore(!overUI);
  trackPtr(e);
});
