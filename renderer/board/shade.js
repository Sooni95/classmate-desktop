/* --- 가리개 (커튼형) --- */
const shadeWrap=$('shadeWrap'),shadePanel=$('shadePanel');
function openShade(){
  setPanel(null);
  shadeWrap.classList.add('on');setIgnore(false);
  // 멀티모니터에서 %기반 CSS는 전체 화면(유니언) 기준이라 모니터 중간에 걸쳐 뜸 →
  // 독이 있는 모니터 기준 픽셀 좌표로 그 모니터 중앙에 배치
  const place=()=>{
    const d=dockDisp();
    const w=Math.round(d.w*0.6), h=Math.round(d.h*0.55);
    shadePanel.style.right='auto';shadePanel.style.bottom='auto';
    shadePanel.style.width=w+'px';shadePanel.style.height=h+'px';
    shadePanel.style.left=(d.x+(d.w-w)/2)+'px';
    shadePanel.style.top=(d.y+(d.h-h)/2)+'px';
  };
  place();requestAnimationFrame(place);
}
$('shadeClose').addEventListener('click',()=>shadeWrap.classList.remove('on'));
// 바(상단)로 이동
makeDrag($('shadeBar'),(e,s)=>{
  if(!s){const r=shadePanel.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  shadePanel.style.left=(e.clientX-s.dx)+'px';shadePanel.style.top=(e.clientY-s.dy)+'px';
  shadePanel.style.right='auto';shadePanel.style.bottom='auto';
},e=>e.target.id==='shadeClose');
// 8방향 모서리로 자유 리사이즈
shadePanel.querySelectorAll('.sh-rz').forEach(rz=>{
  const dir=[...rz.classList].find(c=>c.startsWith('sh-')&&c!=='sh-rz').slice(3); // n,s,e,w,ne...
  makeDrag(rz,(e,s)=>{
    const r=shadePanel.getBoundingClientRect();
    if(!s)return{x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height};
    let{l,t,w,h}=s;const dx=e.clientX-s.x,dy=e.clientY-s.y;
    if(dir.includes('e'))w=Math.max(80,s.w+dx);
    if(dir.includes('s'))h=Math.max(60,s.h+dy);
    if(dir.includes('w')){w=Math.max(80,s.w-dx);l=s.l+(s.w-w);}
    if(dir.includes('n')){h=Math.max(60,s.h-dy);t=s.t+(s.h-h);}
    shadePanel.style.left=l+'px';shadePanel.style.top=t+'px';
    shadePanel.style.right='auto';shadePanel.style.bottom='auto';
    shadePanel.style.width=w+'px';shadePanel.style.height=h+'px';
  });
});
