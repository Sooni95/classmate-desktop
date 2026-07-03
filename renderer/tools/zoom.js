/* ===== 화면 정지 확대 (freeze zoom) =====
   현재 모니터 화면을 캡처해 전체화면으로 띄우고 휠로 확대·드래그로 이동.
   돋보기(부분 확대)와 짝을 이루는 "전체 화면 확대" — 교과서 PDF 등 작은 글씨 크게 보여줄 때. */
let zoomOn=false;   // 다른 파일(pen.js의 ESC 체인, app.js의 allOff)에서 참조하는 전역 상태
let zoomPick=false; // 멀티모니터: "확대할 화면을 클릭" 대기 상태 (pen.js ESC 체인에서 참조)
(function(){
  const wrap=$('zoomWrap'); if(!wrap)return;
  const img=$('zoomImg'),hint=$('zoomHint'),dim=$('zoomDim');
  let B=null,S=1,tx=0,ty=0;
  registerCaptureMode(()=>zoomOn||zoomPick,{hidesPointer:false}); // [클릭통과 규칙] 확대/대기 중엔 통과 차단
  function apply(){img.style.transform=`translate(${tx}px,${ty}px) scale(${S})`;}
  function clampPan(){ // 이미지 밖 빈 공간이 모니터 영역에 드러나지 않게
    tx=Math.min(B.x,Math.max(B.x+B.w-B.w*S,tx));
    ty=Math.min(B.y,Math.max(B.y+B.h-B.h*S,ty));
  }
  async function zoomOpen(){
    if(zoomOn)return;
    const res=await ipc.captureScreen(); // 캡처 대상 = 이 순간 커서가 있는 모니터
    if(!res){zoomOff();toast('📷 화면 캡처에 실패했어요. 다시 시도해 주세요');return;}
    B=res.bounds;img.src=res.dataURL;
    img.style.display='block';
    img.style.left='0px';img.style.top='0px';img.style.width=B.w+'px';img.style.height=B.h+'px';
    dim.style.display='block';
    dim.style.left=B.x+'px';dim.style.top=B.y+'px';dim.style.width=B.w+'px';dim.style.height=B.h+'px';
    S=1;tx=B.x;ty=B.y;apply();
    hint.textContent='🖼️ 휠: 확대/축소 · 드래그: 이동 · ESC/우클릭: 닫기 (이 상태에서 펜 필기도 돼요)';
    hint.style.left=(B.x+B.w/2)+'px';hint.style.top=(B.y+14)+'px';
    zoomPick=false;wrap.classList.remove('pick');
    zoomOn=true;wrap.classList.add('on');
    $('mZoom').classList.add('on');
    setIgnore(false);ipc.grabFocus&&ipc.grabFocus();
  }
  // 멀티모니터: 독 버튼은 항상 독이 있는 모니터에서 눌리므로, 바로 캡처하지 않고
  // "확대할 화면을 클릭" 대기 모드로 전환 → 클릭 순간 커서가 곧 목표 모니터에 있게 된다.
  function zoomPickStart(){
    zoomPick=true;
    img.style.display='none';dim.style.display='none'; // 이전 캡처 잔상 숨김
    hint.textContent='🖱️ 확대할 화면을 클릭하세요 (ESC: 취소)';
    hint.style.left=(innerWidth/2)+'px';hint.style.top='24px';
    wrap.classList.add('on','pick');
    $('mZoom').classList.add('on');
    setIgnore(false);ipc.grabFocus&&ipc.grabFocus();
  }
  function zoomOff(){
    zoomOn=false;zoomPick=false;
    wrap.classList.remove('on','pick');
    $('mZoom').classList.remove('on');
  }
  window.zoomOff=zoomOff;
  // 단축키(Ctrl+Alt+Z): 커서가 이미 목표 모니터에 있으므로 즉시 캡처
  window.toggleFreezeZoom=()=>{(zoomOn||zoomPick)?zoomOff():zoomOpen();};
  $('mZoom').addEventListener('click',async()=>{
    if(zoomOn||zoomPick){zoomOff();return;}
    const ds=await (ipc.getDisplays?ipc.getDisplays():null);
    if(ds&&ds.length>1)zoomPickStart();else zoomOpen();
  });
  wrap.addEventListener('pointerdown',e=>{
    if(!zoomPick)return;
    e.preventDefault();e.stopPropagation();
    zoomOpen(); // 이 순간 커서가 있는(=클릭한) 모니터가 캡처됨
  },true);
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
    if(!zoomOn||!B)return; // pick 대기 중 클릭이 팬 드래그로 이어지지 않게
    if(!s)return{sx:e.clientX,sy:e.clientY,tx0:tx,ty0:ty};
    tx=s.tx0+(e.clientX-s.sx);ty=s.ty0+(e.clientY-s.sy);
    clampPan();apply();
  });
  wrap.addEventListener('contextmenu',e=>{e.preventDefault();zoomOff();});
})();
