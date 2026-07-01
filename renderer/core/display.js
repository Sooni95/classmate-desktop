/* ===== 디스플레이 정보 (멀티/싱글 모니터 공통) ===== */
let DISPLAYS = [{ x: 0, y: 0, w: innerWidth, h: innerHeight, primary: true }];
async function refreshDisplays() {
  try { const d = await window.cm.getDisplays(); if (d && d.length) DISPLAYS = d; } catch (e) {}
}
function dispAt(x, y) {
  return DISPLAYS.find(d => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h)
      || DISPLAYS.find(d => d.primary) || DISPLAYS[0];
}
function dockDisp() {
  const r = dock.getBoundingClientRect();
  return dispAt(r.left + r.width / 2, r.top + r.height / 2);
}
// 모달류를 독이 있는 모니터 중앙에 배치
function centerOnDockDisplay(el) {
  const place=()=>{
    const d = dockDisp();
    el.style.left = Math.max(d.x + 8, d.x + (d.w - el.offsetWidth) / 2) + 'px';
    el.style.top = Math.max(d.y + 8, d.y + (d.h - el.offsetHeight) / 2) + 'px';
  };
  place();
  requestAnimationFrame(place); // 렌더 후 크기 확정되면 재배치 (모니터 사이 걸침 방지)
}
