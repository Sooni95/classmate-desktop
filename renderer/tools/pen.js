/* ===== 주석 — v0.4: 스트로크 레이어 방식 (형광펜 끊김/얼룩 제거) + 휠 굵기 ===== */
const dc=$('dc'),ctx=dc.getContext('2d');
const dctmp=$('dctmp'),tctx=dctmp.getContext('2d');
let drawMode=false,drawing=false,penColor='#ff3b3b',penType='pen',undoStack=[];
registerCaptureMode(()=>drawMode); // [클릭통과 규칙] 펜(필기) 모드 활성 중엔 통과 차단 + 커스텀 포인터 표시
const PW={pen:5,hl:16,eraser:26,rect:4,circle:4,arrow:4,mosaic:36}; // 도구별 굵기 (휠로 조절)
let rectStart=null,rectMode=false,circleMode=false,arrowMode=false;
let stroke=[]; // 현재 스트로크 점들
// 수정자 키 상태를 직접 추적 (오버레이/클릭통과 환경에서 pointer 이벤트에 ctrlKey/shiftKey가
// 안 실려 오는 경우가 있어, keydown/keyup으로 추적한 값을 같이 사용한다)
let keyCtrl=false,keyShift=false;
window.addEventListener('keydown',e=>{if(e.key==='Control')keyCtrl=true;if(e.key==='Shift')keyShift=true;},true);
window.addEventListener('keyup',e=>{if(e.key==='Control')keyCtrl=false;if(e.key==='Shift')keyShift=false;},true);
window.addEventListener('blur',()=>{keyCtrl=keyShift=false;});
function fitC(){dc.width=innerWidth;dc.height=innerHeight;dctmp.width=innerWidth;dctmp.height=innerHeight;}
addEventListener('resize',fitC);fitC();
function toggleDraw(force){
  drawMode=force!==undefined?force:!drawMode;
  dc.classList.toggle('on',drawMode);
  dctmp.classList.toggle('on',drawMode);
  $('dtb').classList.toggle('on',drawMode);
  $('drawBtn').classList.toggle('on',drawMode);
  // 펜 모드 중에는 캔버스를 핀/메모 위로 → 핀 위에도 필기 가능
  const z=drawMode?56:40;
  dc.style.zIndex=z;dctmp.style.zIndex=z+1;
  if(drawMode){
    setPanel(null);setIgnore(false);
    // 펜 툴바: 직접 옮긴 적 없으면 독이 있는 모니터 상단 중앙에
    if(!dtbMoved){
      const d=dockDisp(),tb=$('dtb');
      requestAnimationFrame(()=>{
        tb.style.left=(d.x+(d.w-tb.offsetWidth)/2)+'px';
        tb.style.top=(d.y+18)+'px';
      });
    }
  }else{commitText();$('dtbPill').classList.remove('on');$('penStamps')&&$('penStamps').classList.remove('on');}
}
// 펜 툴바 이동 (⠿ 손잡이)
let dtbMoved=false;
makeDrag($('dtbGrip'),(e,s)=>{
  const tb=$('dtb');
  if(!s){const r=tb.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height};}
  dtbMoved=true;
  const p=clampDock(e.clientX-s.dx,e.clientY-s.dy,s.w,s.h);
  tb.style.left=p.x+'px';tb.style.top=p.y+'px';
});
// 펜 툴바 접기 → ✏️ 알약 (이동 가능, 클릭하면 펼침)
let dtbPillMoved=false;
$('dtbMin').addEventListener('click',()=>{
  const tb=$('dtb'),p=$('dtbPill');
  const r=tb.getBoundingClientRect();
  tb.classList.remove('on');p.classList.add('on');
  const c=clampDock(r.left,r.top,44,44);
  p.style.left=c.x+'px';p.style.top=c.y+'px';
});
makeDrag($('dtbPill'),(e,s)=>{
  const p=$('dtbPill');
  if(!s){dtbPillMoved=false;const r=p.getBoundingClientRect();
    return{dx:e.clientX-r.left,dy:e.clientY-r.top,sx:e.clientX,sy:e.clientY};}
  if(Math.abs(e.clientX-s.sx)+Math.abs(e.clientY-s.sy)>4)dtbPillMoved=true;
  const c=clampDock(e.clientX-s.dx,e.clientY-s.dy,44,44);
  p.style.left=c.x+'px';p.style.top=c.y+'px';
});
$('dtbPill').addEventListener('click',()=>{
  if(dtbPillMoved){dtbPillMoved=false;return;}
  const tb=$('dtb'),p=$('dtbPill');
  const pr=p.getBoundingClientRect();
  p.classList.remove('on');tb.classList.add('on');dtbMoved=true;
  requestAnimationFrame(()=>{
    const c=clampDock(pr.left,pr.top,tb.offsetWidth,tb.offsetHeight);
    tb.style.left=c.x+'px';tb.style.top=c.y+'px';
  });
});
$('drawBtn').addEventListener('click',()=>toggleDraw());
$('exitDraw').addEventListener('click',()=>toggleDraw(false));
$('clearBtn').addEventListener('click',()=>{saveSt();ctx.clearRect(0,0,dc.width,dc.height);});
document.querySelectorAll('.sw').forEach(s=>s.addEventListener('click',()=>{
  document.querySelectorAll('.sw').forEach(x=>x.classList.remove('sel'));s.classList.add('sel');penColor=s.dataset.c;
}));
const STAMPS=['⭐','👍','✅','💮','🌸','🎉','💯','❤️','😊','✏️','🅾️','❌'];
let penStamp='⭐';
let stampSize=46; // 스탬프 크기 (휠로 조절)
function renderPenStamps(){
  const ps=$('penStamps');if(!ps)return;ps.innerHTML='';
  STAMPS.forEach(em=>{
    const b=document.createElement('div');b.className='bstamp'+(em===penStamp?' sel':'');b.textContent=em;
    b.addEventListener('click',()=>{penStamp=em;ps.querySelectorAll('.bstamp').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');});
    ps.appendChild(b);
  });
}
function stampAtDraw(x,y){
  saveSt();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=stampSize+'px "Apple Color Emoji","Segoe UI Emoji",serif';
  ctx.fillText(penStamp,x,y);
}
function setTool(t){
  if(penType==='text'&&t!=='text')commitText();
  penType=t;
  ['penBtn','hlBtn','erBtn','txBtn','rectBtn','circBtn','arrowBtn','stampBtn','mosaicBtn'].forEach(id=>$(id)&&$(id).classList.remove('on'));
  const m={pen:'penBtn',hl:'hlBtn',eraser:'erBtn',text:'txBtn',rect:'rectBtn',circle:'circBtn',arrow:'arrowBtn',stamp:'stampBtn',mosaic:'mosaicBtn'}[t];
  if(m&&$(m))$(m).classList.add('on');
  if(t==='mosaic')prepareMosaic(); // 화면이 계속 바뀌므로 선택할 때마다 새로 캡처
  const ps=$('penStamps');
  if(ps){
    if(t==='stamp'){renderPenStamps();const r=$('dtb').getBoundingClientRect();ps.style.left=r.left+'px';ps.style.top=(r.bottom+6)+'px';ps.classList.add('on');}
    else ps.classList.remove('on');
  }
}
$('penBtn').addEventListener('click',()=>setTool('pen'));
$('hlBtn').addEventListener('click',()=>setTool('hl'));
$('erBtn').addEventListener('click',()=>setTool('eraser'));
$('txBtn').addEventListener('click',()=>setTool('text'));
$('rectBtn').addEventListener('click',()=>setTool('rect'));
$('circBtn').addEventListener('click',()=>setTool('circle'));
$('arrowBtn')&&$('arrowBtn').addEventListener('click',()=>setTool('arrow'));
$('stampBtn')&&$('stampBtn').addEventListener('click',()=>setTool('stamp'));
$('mosaicBtn')&&$('mosaicBtn').addEventListener('click',()=>setTool('mosaic'));

/* --- 화살표: 직선 + 끝 화살촉 --- */
function drawArrow(c,x0,y0,x1,y1,w){
  const ang=Math.atan2(y1-y0,x1-x0),hl=Math.max(14,w*3.5);
  c.lineWidth=w;c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();
  c.beginPath();
  c.moveTo(x1,y1);c.lineTo(x1-hl*Math.cos(ang-0.45),y1-hl*Math.sin(ang-0.45));
  c.moveTo(x1,y1);c.lineTo(x1-hl*Math.cos(ang+0.45),y1-hl*Math.sin(ang+0.45));
  c.stroke();
}

/* --- 모자이크 펜: 캡처한 화면을 픽셀화해 붓처럼 찍어 가림 (학생 이름 등) --- */
let mzCv=null,mzB=null,mzBusy=false;
async function prepareMosaic(){
  if(mzBusy)return;mzBusy=true;
  try{
    const res=await ipc.captureScreen();
    if(!res){toast('📷 화면 캡처에 실패했어요 — 모자이크를 쓸 수 없어요');mzCv=null;return;}
    mzB=res.bounds;
    const im=new Image();
    await new Promise(r=>{im.onload=r;im.src=res.dataURL;});
    const f=14; // 픽셀 굵기 (클수록 거칠게 가려짐)
    const small=document.createElement('canvas');
    small.width=Math.max(1,Math.round(mzB.w/f));small.height=Math.max(1,Math.round(mzB.h/f));
    small.getContext('2d').drawImage(im,0,0,small.width,small.height);
    mzCv=document.createElement('canvas');mzCv.width=mzB.w;mzCv.height=mzB.h;
    const c=mzCv.getContext('2d');c.imageSmoothingEnabled=false;
    c.drawImage(small,0,0,mzB.w,mzB.h);
  }finally{mzBusy=false;}
}
function mosaicStamp(p){
  if(!mzCv||!mzB)return;
  const d=PW.mosaic,r=d/2;
  let sx=p.x-mzB.x-r,sy=p.y-mzB.y-r,sw=d,sh=d,dx=p.x-r,dy=p.y-r;
  if(sx<0){sw+=sx;dx-=sx;sx=0;}if(sy<0){sh+=sy;dy-=sy;sy=0;}
  if(sx+sw>mzB.w)sw=mzB.w-sx;if(sy+sh>mzB.h)sh=mzB.h-sy;
  if(sw<=0||sh<=0)return; // 캡처한 모니터 밖 (다른 모니터에선 동작 안 함)
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.drawImage(mzCv,sx,sy,sw,sh,dx,dy,sw,sh);
}

/* --- 글자 도구: 클릭한 곳에 입력 → Enter로 화면에 새김 (휠로 크기) --- */
let txSize=28,txEditor=null;
function showTextHud(){
  const hud=$('penHud');
  hud.querySelector('.dot').style.cssText='width:10px;height:10px;color:'+penColor;
  hud.querySelector('.ptxt').textContent='글자 크기 '+txSize+' (휠로 조절)';
  hud.style.left=(hx+24)+'px';hud.style.top=(hy+24)+'px';
  hud.classList.add('on');
  clearTimeout(penHudT);penHudT=setTimeout(()=>hud.classList.remove('on'),900);
}
function openTextEditor(x,y,w,fs){
  const ed=document.createElement('div');
  ed.className='cvtext iv';ed.contentEditable='true';
  ed.style.left=x+'px';ed.style.top=y+'px';
  ed.style.color=penColor;ed.style.fontSize=(fs||txSize)+'px';
  if(w&&w>40){ed.style.width=w+'px';ed.style.maxWidth='none';ed.dataset.maxw=w;}
  if(fs)txSize=fs; // 박스로 정한 크기를 기억
  ed.dataset.x=x;ed.dataset.y=y;
  document.body.appendChild(ed);txEditor=ed;
  setTimeout(()=>ed.focus(),0);
  ed.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitText();}
    else if(e.key==='Escape'){txEditor=null;ed.remove();}
  });
}
function wrapText(ctx,text,maxW){
  if(!maxW)return text.split('\n');
  const out=[];
  text.split('\n').forEach(para=>{
    let cur='';
    for(const ch of para){
      if(cur&&ctx.measureText(cur+ch).width>maxW){out.push(cur);cur=ch;}
      else cur+=ch;
    }
    out.push(cur);
  });
  return out;
}
function commitText(){
  if(!txEditor)return;
  const ed=txEditor;txEditor=null;
  const txt=ed.innerText.replace(/\n+$/,'');
  const x=+ed.dataset.x,y=+ed.dataset.y;
  const col=ed.style.color,fs=parseFloat(ed.style.fontSize);
  const maxw=ed.dataset.maxw?parseFloat(ed.dataset.maxw):0;
  ed.remove();
  if(!txt.trim())return;
  saveSt();
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.fillStyle=col;ctx.font='bold '+fs+'px "Malgun Gothic"';ctx.textBaseline='top';ctx.textAlign='left';
  wrapText(ctx,txt,maxw?Math.max(20,maxw-8):0).forEach((ln,i)=>ctx.fillText(ln,x+4,y+4+i*fs*1.28));
}
function saveSt(){if(undoStack.length>=20)undoStack.shift();undoStack.push(ctx.getImageData(0,0,dc.width,dc.height));}
function undo(){if(undoStack.length)ctx.putImageData(undoStack.pop(),0,0);}
$('undoBtn').addEventListener('click',undo);
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z')undo();
  if(drawMode&&(e.key==='F5'||e.key==='r'||e.key==='R')){e.preventDefault();setTool('rect');}
  if(drawMode&&(e.key==='c'||e.key==='C')){e.preventDefault();setTool('circle');}
  if(drawMode&&(e.key==='a'||e.key==='A')){e.preventDefault();setTool('arrow');}
  // 숫자키 1~7 = 팔레트 색 바로 선택 (ZoomIt의 한 글자 색 전환에 해당)
  if(drawMode&&!e.ctrlKey&&!e.altKey&&/^[1-9]$/.test(e.key)){
    const sws=document.querySelectorAll('.sw');
    const s=sws[+e.key-1];
    if(s){e.preventDefault();s.click();if(typeof showPenHud==='function')showPenHud();}
  }
  if(e.key==='Escape'){
    const curPanel=document.querySelector('.panel.on');
    if($('proMenu')&&$('proMenu').classList.contains('on'))$('proMenu').classList.remove('on');
    else if($('rosterModal')&&$('rosterModal').classList.contains('on'))$('rosterModal').classList.remove('on');
    else if(expWrap&&expWrap.classList.contains('on'))expWrap.classList.remove('on');
    else if(proWrap&&proWrap.classList.contains('on'))proWrap.classList.remove('on');
    else if($('noiseGuide').classList.contains('on'))$('noiseGuide').classList.remove('on');
    else if(drawWrap.classList.contains('on'))drawWrap.classList.remove('on');
    else if(shadeWrap.classList.contains('on'))shadeWrap.classList.remove('on');
    else if(gameWrap.classList.contains('on'))closeGame();
    else if(ladderWrap&&ladderWrap.classList.contains('on'))ladderWrap.classList.remove('on');
    else if($('camWrap').classList.contains('on'))closeCam();
    else if($('boardWrap')&&$('boardWrap').classList.contains('on')){$('boardWrap').classList.remove('on');}
    else if(curPanel)setPanel(null); // AI보조·번역 등 열린 패널 닫기
    else if(snipOn)endSnip();else if(typeof zoomOn!=='undefined'&&(zoomOn||zoomPick))window.zoomOff();else if(lensOn)setLens(0);else allOff();
  }
});
// 부드러운 곡선 경로 (중점 quadratic) — 한 번에 그려 알파 겹침 얼룩 제거
function pathStroke(c,pts,w){
  if(pts.length<2){ // 점 하나 = 점 찍기
    c.beginPath();c.arc(pts[0].x,pts[0].y,w/2,0,7);c.fill();return;
  }
  c.lineWidth=w;c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length-1;i++){
    const mx=(pts[i].x+pts[i+1].x)/2,my=(pts[i].y+pts[i+1].y)/2;
    c.quadraticCurveTo(pts[i].x,pts[i].y,mx,my);
  }
  c.lineTo(pts.at(-1).x,pts.at(-1).y);
  c.stroke();
}
dc.addEventListener('pointerdown',e=>{
  if(!drawMode)return;
  if(penType==='text'){
    commitText();
    const sx=e.clientX, sy=e.clientY;
    const box=document.createElement('div');box.className='txbox';
    box.style.left=sx+'px';box.style.top=sy+'px';document.body.appendChild(box);
    const mv=ev=>{
      const x=Math.min(sx,ev.clientX),y=Math.min(sy,ev.clientY),w=Math.abs(ev.clientX-sx),h=Math.abs(ev.clientY-sy);
      box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';
    };
    const up=ev=>{
      document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);
      const x=Math.min(sx,ev.clientX),y=Math.min(sy,ev.clientY),w=Math.abs(ev.clientX-sx),h=Math.abs(ev.clientY-sy);
      box.remove();
      if(w<14&&h<14){openTextEditor(sx,sy);} // 그냥 클릭이면 기존 방식(현재 크기)
      else{openTextEditor(x,y,w,Math.max(14,Math.min(240,Math.round(h))));} // 박스: 높이=글자크기, 폭=줄바꿈
    };
    document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);
    return;
  }
  if(penType==='stamp'){stampAtDraw(e.clientX,e.clientY);return;}
  saveSt();drawing=true;dc.setPointerCapture(e.pointerId);
  stroke=[{x:e.clientX,y:e.clientY}];
  // Ctrl 드래그 = 박스, Shift 드래그 = 원, Ctrl+Shift 드래그 = 화살표 (펜/형광 중에도)
  const ctrlDown=e.ctrlKey||keyCtrl, shiftDown=e.shiftKey||keyShift;
  const freehand=penType==='pen'||penType==='hl';
  arrowMode=(penType==='arrow')||(freehand&&ctrlDown&&shiftDown);
  rectMode=!arrowMode&&((penType==='rect')||(freehand&&ctrlDown));
  circleMode=!arrowMode&&((penType==='circle')||(freehand&&shiftDown));
  if(rectMode||circleMode||arrowMode){rectStart={x:e.clientX,y:e.clientY};return;}
  if(penType==='mosaic'){mosaicStamp({x:e.clientX,y:e.clientY});return;}
  if(penType==='eraser'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='#000';ctx.fillStyle='#000';
    pathStroke(ctx,stroke,PW.eraser);
  }
});
dc.addEventListener('pointermove',e=>{
  if(!drawing)return;
  if(rectMode||circleMode||arrowMode){
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
    dctmp.style.opacity=penType==='hl'?0.42:1;
    const x0=rectStart.x,y0=rectStart.y;
    const lw=PW[penType]||PW.rect;
    tctx.strokeStyle=penColor;tctx.lineWidth=lw;tctx.lineJoin='round';
    if(arrowMode){
      drawArrow(tctx,x0,y0,e.clientX,e.clientY,lw);
    }else if(circleMode){
      const cx=(x0+e.clientX)/2,cy=(y0+e.clientY)/2;
      const rx=Math.abs(e.clientX-x0)/2,ry=Math.abs(e.clientY-y0)/2;
      tctx.beginPath();tctx.ellipse(cx,cy,Math.max(1,rx),Math.max(1,ry),0,0,7);tctx.stroke();
    }else{
      const x=Math.min(x0,e.clientX),y=Math.min(y0,e.clientY);
      const w=Math.abs(e.clientX-x0),h=Math.abs(e.clientY-y0);
      tctx.strokeRect(x,y,w,h);
    }
    return;
  }
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  for(const ev of (evs.length?evs:[e]))stroke.push({x:ev.clientX,y:ev.clientY});
  if(penType==='mosaic'){
    for(const p of stroke.slice(-Math.min(stroke.length,8)))mosaicStamp(p);
    return;
  }
  if(penType==='eraser'){
    // 지우개는 즉시 본 캔버스에
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='#000';ctx.fillStyle='#000';
    pathStroke(ctx,stroke.slice(-Math.min(stroke.length,8)),PW.eraser);
    return;
  }
  // 펜/형광: 임시 캔버스에 현재 스트로크 전체를 매번 다시 그림 (불투명) →
  // 임시 캔버스 자체의 CSS opacity로 형광 효과 → 겹침 얼룩·끊김 없음
  tctx.clearRect(0,0,dctmp.width,dctmp.height);
  tctx.strokeStyle=penColor;tctx.fillStyle=penColor;
  dctmp.style.opacity=penType==='hl'?0.42:1;
  pathStroke(tctx,stroke,PW[penType]);
});
const endD=()=>{
  if(!drawing)return;drawing=false;
  if(rectMode||circleMode||arrowMode){
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=penType==='hl'?0.42:1;
    ctx.drawImage(dctmp,0,0);
    ctx.globalAlpha=1;
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
    stroke=[];rectMode=false;circleMode=false;arrowMode=false;return;
  }
  if(penType!=='eraser'&&penType!=='mosaic'&&stroke.length){
    // 완성된 스트로크를 본 캔버스에 한 번만 합성 (형광은 반투명으로)
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=penType==='hl'?0.42:1;
    ctx.drawImage(dctmp,0,0);
    ctx.globalAlpha=1;
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
  }
  ctx.globalCompositeOperation='source-over';
  stroke=[];
};
dc.addEventListener('pointerup',endD);dc.addEventListener('pointercancel',endD);

