/* ===== 화면 정지 확대 (freeze zoom) =====
   현재 모니터 화면을 캡처해 전체화면으로 띄우고 휠로 확대·드래그로 이동.
   돋보기(부분 확대)와 짝을 이루는 "전체 화면 확대" — 교과서 PDF 등 작은 글씨 크게 보여줄 때. */
let zoomOn=false; // 다른 파일(pen.js의 ESC 체인, app.js의 allOff)에서 참조하는 전역 상태
(function(){
  const wrap=$('zoomWrap'); if(!wrap)return;
  const img=$('zoomImg'),hint=$('zoomHint');
  let B=null,S=1,tx=0,ty=0;
  registerCaptureMode(()=>zoomOn,{hidesPointer:false}); // [클릭통과 규칙] 확대 중엔 통과 차단
  function apply(){img.style.transform=`translate(${tx}px,${ty}px) scale(${S})`;}
  function clampPan(){ // 이미지 밖 빈 공간이 모니터 영역에 드러나지 않게
    tx=Math.min(B.x,Math.max(B.x+B.w-B.w*S,tx));
    ty=Math.min(B.y,Math.max(B.y+B.h-B.h*S,ty));
  }
  async function zoomOpen(){
    if(zoomOn)return;
    const res=await ipc.captureScreen();
    if(!res){toast('📷 화면 캡처에 실패했어요. 다시 시도해 주세요');return;}
    B=res.bounds;img.src=res.dataURL;
    img.style.left='0px';img.style.top='0px';img.style.width=B.w+'px';img.style.height=B.h+'px';
    S=1;tx=B.x;ty=B.y;apply();
    hint.style.left=(B.x+B.w/2)+'px';hint.style.top=(B.y+14)+'px';
    zoomOn=true;wrap.classList.add('on');
    $('mZoom').classList.add('on');
    setIgnore(false);ipc.grabFocus&&ipc.grabFocus();
  }
  function zoomOff(){
    zoomOn=false;wrap.classList.remove('on');
    $('mZoom').classList.remove('on');
  }
  window.zoomOff=zoomOff;
  window.toggleFreezeZoom=()=>{zoomOn?zoomOff():zoomOpen();};
  $('mZoom').addEventListener('click',()=>toggleFreezeZoom());
  wrap.addEventListener('wheel',e=>{
    if(!zoomOn)return;
    e.preventDefault();
    const f=e.deltaY<0?1.25:0.8;
    const nS=Math.min(8,Math.max(1,S*f));
    if(nS===S)return;
    // 커서 아래 지점이 그대로 유지되도록 확대 중심 보정
    tx=e.clientX-(e.clientX-tx)*(nS/S);
    ty=e.clientY-(e.clientY-ty)*(nS/S);
    S=nS;clampPan();apply();
  },{passive:false});
  makeDrag(wrap,(e,s)=>{
    if(!s)return{sx:e.clientX,sy:e.clientY,tx0:tx,ty0:ty};
    tx=s.tx0+(e.clientX-s.sx);ty=s.ty0+(e.clientY-s.sy);
    clampPan();apply();
  });
  wrap.addEventListener('contextmenu',e=>{e.preventDefault();zoomOff();});
})();
