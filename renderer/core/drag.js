/* ===== 드래그 공통 헬퍼 ===== */
function makeDrag(handle, onMove, skip){
  handle.addEventListener('pointerdown', e => {
    if (skip && skip(e)) return;
    handle.setPointerCapture(e.pointerId); e.preventDefault();
    const start = onMove(e, null);
    const mv = ev => onMove(ev, start);
    const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up);
  });
}
// 모서리 손잡이를 오른쪽 아래로 끌면 위젯 전체를 transform:scale로 키움/줄임
// (신호등·활동상징처럼 내부 레이아웃 없이 통째로 확대만 하면 되는 위젯용)
function makeScaleHandle(handle, widget, opts){
  const min=(opts&&opts.min)||0.6, max=(opts&&opts.max)||3, key=opts&&opts.key;
  let scale=1;
  if(key){const saved=parseFloat(localStorage.getItem(key));if(saved>0)scale=Math.min(max,Math.max(min,saved));}
  function apply(){widget.style.transformOrigin='top left';widget.style.transform='scale('+scale+')';}
  apply();
  makeDrag(handle,(e,s)=>{
    if(!s){const r=widget.getBoundingClientRect();return{sx:e.clientX,sy:e.clientY,scale0:scale,baseW:Math.max(1,r.width/scale)};}
    const d=Math.max(e.clientX-s.sx,e.clientY-s.sy);
    scale=Math.min(max,Math.max(min,s.scale0+d/s.baseW));
    apply();
    if(key)localStorage.setItem(key,scale);
  });
  return {apply,setScale(v){scale=Math.min(max,Math.max(min,v));apply();if(key)localStorage.setItem(key,scale);},getScale(){return scale;}};
}
