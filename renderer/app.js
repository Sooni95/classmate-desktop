/* ClassMate Desktop renderer
   핵심 차이(웹 대비): ① 클릭 통과 관리 ② 돋보기/영역캡처가 '진짜 화면'을 캡처 ③ 전역 단축키 수신 */
const $ = id => document.getElementById(id);

/* ===== 클릭 통과(click-through) 관리 =====
   기본은 통과(ignore=true). 커서가 위젯(.iv) 위에 오면 ignore=false로 전환.
   forward:true 덕분에 ignore 상태에서도 mousemove는 계속 수신됨. */
let ignoring = true;
function setIgnore(v){ if(ignoring!==v){ ignoring=v; window.cm.setIgnore(v); } }
document.addEventListener('mousemove', e => {
  // 전체 입력이 필요한 모드(주석/돋보기/캡처)에서는 항상 잡는다
  if (drawMode || lensOn || snipOn) { setIgnore(false); trackPtr(e); return; }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  setIgnore(!(el && el.closest('.iv')));
  trackPtr(e);
});

/* ===== 공통 헬퍼 ===== */
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
function rollPick(el, arr, fmt, onDone){
  let n=0; el.classList.add('spin');
  const iv=setInterval(()=>{
    el.textContent=arr[Math.random()*arr.length|0];
    if(++n>=16){clearInterval(iv);el.classList.remove('spin');
      const w=arr[Math.random()*arr.length|0];el.textContent=fmt(w);onDone&&onDone(w);}
  },45);
}

/* ===== 패널 & 독 ===== */
const panels={}; document.querySelectorAll('.panel').forEach(p=>panels[p.id]=p);
let openPanel=null;
function setPanel(id){
  Object.values(panels).forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tool[data-p]').forEach(b=>b.classList.remove('on'));
  if(openPanel===id||!id){openPanel=null;return;}
  panels[id].classList.add('on');
  const b=document.querySelector(`.tool[data-p="${id}"]`); if(b)b.classList.add('on');
  openPanel=id; placePanels();
}
document.querySelectorAll('.tool[data-p]').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.p)));
document.querySelectorAll('.tabs').forEach(tb=>{
  const panel=tb.closest('.panel');
  tb.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    tb.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    panel.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id==='pane-'+t.dataset.t));
  }));
});
const dock=$('dock');
function placePanels(){
  const r=dock.getBoundingClientRect();
  const cx=Math.min(Math.max(r.left+r.width/2,175),innerWidth-175);
  Object.values(panels).forEach(p=>{p.style.left=cx+'px';p.style.bottom=(innerHeight-r.top+12)+'px';});
}
makeDrag($('brand'),(e,start)=>{
  if(!start){const r=dock.getBoundingClientRect();dock.classList.add('free');
    dock.style.left=r.left+'px';dock.style.top=r.top+'px';
    return{dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height};}
  dock.style.left=Math.min(Math.max(e.clientX-start.dx,6),innerWidth-start.w-6)+'px';
  dock.style.top=Math.min(Math.max(e.clientY-start.dy,6),innerHeight-start.h-6)+'px';
  placePanels();
});
$('quitBtn').addEventListener('click',()=>window.cm.quit());

/* ===== 타이머 ===== */
let tTotal=300,tLeft=300,tInt=null,tRun=false;
const tDisp=$('tDisp');
const fmtT=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
function rT(){tDisp.textContent=fmtT(tLeft);tDisp.className='tdisp'+(tLeft===0?' done':(tLeft<=10?' warn':''));}
function stopT(){clearInterval(tInt);tInt=null;tRun=false;$('tStart').textContent='시작';}
function beep(){try{const ac=new AudioContext();[0,.2,.4].forEach(d=>{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=880;o.start(ac.currentTime+d);g.gain.setValueAtTime(.15,ac.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d+.18);o.stop(ac.currentTime+d+.2);});}catch(e){}}
document.querySelectorAll('.presets button').forEach(b=>b.addEventListener('click',()=>{tTotal=tLeft=+b.dataset.m*60;stopT();rT();}));
$('setC').addEventListener('click',()=>{tTotal=tLeft=(parseInt($('cMin').value)||0)*60+(parseInt($('cSec').value)||0);stopT();rT();});
$('tStart').addEventListener('click',function(){
  if(tRun){stopT();return;}
  if(tLeft<=0)tLeft=tTotal;
  tRun=true;this.textContent='일시정지';
  tInt=setInterval(()=>{tLeft--;rT();if(tLeft<=0){stopT();beep();}},1000);
});
$('tReset').addEventListener('click',()=>{stopT();tLeft=tTotal;rT();});
rT();

/* ===== 발표자 ===== */
let pool=[],orig=[],pHist=[],nHist=[];
const pres=$('pres'),hist=$('hist');
function loadN(){orig=$('nameList').value.split('\n').map(s=>s.trim()).filter(Boolean);pool=[...orig];}
$('nameList').addEventListener('input',loadN);
$('pickBtn').addEventListener('click',()=>{
  loadN();const src=$('noRep').checked?pool:orig;
  if(!src.length){pres.textContent='이름 없음';return;}
  rollPick(pres,src,w=>'🎉 '+w,p=>{
    if($('noRep').checked)pool=pool.filter(x=>x!==p);
    pHist.unshift(p);if(pHist.length>5)pHist.pop();hist.textContent='최근: '+pHist.join(' → ');
  });
});
$('pickRst').addEventListener('click',()=>{loadN();pool=[...orig];pres.textContent='— 준비 —';pHist=[];hist.textContent='';});
$('pickN').addEventListener('click',()=>{
  const a=parseInt($('nFrom').value)||1,b=parseInt($('nTo').value)||30;
  if(a>b){$('presN').textContent='범위 오류';return;}
  const nums=Array.from({length:b-a+1},(_,i)=>String(a+i));
  rollPick($('presN'),nums,w=>'🎯 '+w+'번',p=>{
    nHist.unshift(p);if(nHist.length>5)nHist.pop();$('histN').textContent='최근: '+nHist.join(' → ');
  });
});
$('tBtn').addEventListener('click',()=>{
  const names=$('tNames').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const n=parseInt($('tN').value)||4;
  if(names.length<n){$('tRes').textContent='인원이 팀 수보다 적습니다';return;}
  const sh=[...names].sort(()=>Math.random()-.5);
  const teams=Array.from({length:n},()=>[]);
  sh.forEach((nm,i)=>teams[i%n].push(nm));
  $('tRes').innerHTML=teams.map((t,i)=>`<b style="color:#FF7A00">팀${i+1}</b> ${t.join(', ')}`).join('<br>');
});

/* ===== QR (오프라인 라이브러리) ===== */
let qrT;
$('qrUrl').addEventListener('input',e=>{clearTimeout(qrT);qrT=setTimeout(()=>genQR(e.target.value.trim()),450);});
function genQR(url){
  const box=$('qrbox');
  if(!url){box.className='empty';box.textContent='URL 입력 시 자동 생성 (오프라인 작동)';return;}
  box.className='';box.innerHTML='';
  try{new QRCode(box,{text:url,width:132,height:132,colorDark:'#1c1d1f',colorLight:'#ffffff'});}catch(e){}
}

/* ===== 메모 ===== */
const MCOLS=['#FFF3A3','#FFB3C6','#B3F0D4','#C7D2FF'];let mCnt=0;
$('memoBtn').addEventListener('click',()=>{
  mCnt++;const m=document.createElement('div');m.className='memo iv';
  const c=MCOLS[mCnt%4];
  m.style.cssText=`left:${130+Math.random()*200}px;top:${110+Math.random()*160}px;`;
  m.innerHTML=`<div class="mbar" style="background:${c}cc"><span></span><div><button class="mbtn2">─</button><button class="mbtn2">×</button></div></div><textarea placeholder="메모…" style="background:${c}"></textarea>`;
  document.body.appendChild(m);
  const [minB,xB]=m.querySelectorAll('.mbtn2');
  xB.addEventListener('click',()=>m.remove());
  minB.addEventListener('click',()=>{m.classList.toggle('min');minB.textContent=m.classList.contains('min')?'▢':'─';});
  makeDrag(m.querySelector('.mbar'),(e,s)=>{
    if(!s){const r=m.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    m.style.left=(e.clientX-s.dx)+'px';m.style.top=(e.clientY-s.dy)+'px';
  },e=>e.target.tagName==='BUTTON');
  m.querySelector('textarea').focus();
});

/* ===== 핀 ===== */
function addPin(src,label,x,y,w){
  const p=document.createElement('div');p.className='pin iv';
  p.style.cssText=`left:${x??(200+Math.random()*160)}px;top:${y??(110+Math.random()*120)}px;width:${w??280}px;`;
  p.innerHTML=`<div class="pb"><span class="lbl">📌 ${label||'핀'}</span><button class="x">×</button></div><img src="${src}" draggable="false"><div class="rs"></div>`;
  document.body.appendChild(p);
  p.querySelector('.x').addEventListener('click',()=>p.remove());
  makeDrag(p.querySelector('.pb'),(e,s)=>{
    if(!s){const r=p.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    p.style.left=(e.clientX-s.dx)+'px';p.style.top=(e.clientY-s.dy)+'px';
  },e=>e.target.tagName==='BUTTON');
  makeDrag(p.querySelector('.rs'),(e,s)=>{
    if(!s)return{sx:e.clientX,sw:p.offsetWidth};
    p.style.width=Math.max(100,s.sw+(e.clientX-s.sx))+'px';
  });
}
document.addEventListener('paste',e=>{
  const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));
  if(it){const r=new FileReader();r.onload=ev=>addPin(ev.target.result,'붙여넣기');r.readAsDataURL(it.getAsFile());}
});

/* ===== 영역 캡처 → 핀 (Snipaste 핵심) ===== */
let snipOn=false,snipImgData=null,sx0,sy0;
const snipWrap=$('snipWrap'),snipRect=$('snipRect');
async function startSnip(){
  if(snipOn)return;
  const data=await window.cm.captureScreen();
  if(!data)return;
  snipImgData=data;$('snipImg').src=data;
  snipOn=true;snipWrap.classList.add('on');setIgnore(false);
}
function endSnip(){snipOn=false;snipWrap.classList.remove('on');snipRect.style.display='none';}
snipWrap.addEventListener('pointerdown',e=>{
  sx0=e.clientX;sy0=e.clientY;
  snipRect.style.display='block';
  snipRect.style.cssText+=`left:${sx0}px;top:${sy0}px;width:0;height:0;display:block;`;
  snipWrap.setPointerCapture(e.pointerId);
});
snipWrap.addEventListener('pointermove',e=>{
  if(snipRect.style.display!=='block'||sx0===undefined)return;
  if(e.buttons!==1)return;
  const x=Math.min(sx0,e.clientX),y=Math.min(sy0,e.clientY);
  const w=Math.abs(e.clientX-sx0),h=Math.abs(e.clientY-sy0);
  Object.assign(snipRect.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
});
snipWrap.addEventListener('pointerup',e=>{
  const x=Math.min(sx0,e.clientX),y=Math.min(sy0,e.clientY);
  const w=Math.abs(e.clientX-sx0),h=Math.abs(e.clientY-sy0);
  sx0=undefined;
  if(w<8||h<8){endSnip();return;}
  // 스냅샷에서 해당 영역 잘라내기 (스케일 보정)
  const img=new Image();
  img.onload=()=>{
    const scX=img.naturalWidth/innerWidth, scY=img.naturalHeight/innerHeight;
    const cv=document.createElement('canvas');cv.width=w*scX;cv.height=h*scY;
    cv.getContext('2d').drawImage(img,x*scX,y*scY,w*scX,h*scY,0,0,w*scX,h*scY);
    addPin(cv.toDataURL('image/png'),'캡처',x,y,w);
    endSnip();
  };
  img.src=snipImgData;
});
$('snipBtn').addEventListener('click',startSnip);

/* ===== 포인터: 링 / 스팟 ===== */
const halo=$('halo'),spotEl=$('spot'),spotHole=$('spotHole');
const PS={ring:false,spot:0,size:160};
let hx=innerWidth/2,hy=innerHeight/2,ptrRAF=0;
function syncPtr(){
  $('mRing').classList.toggle('on',PS.ring);
  $('mSpotC').classList.toggle('on',PS.spot===1);
  $('mSpotR').classList.toggle('on',PS.spot===2);
  halo.classList.toggle('on',PS.ring);
  spotEl.classList.toggle('on',PS.spot>0);
  spotHole.className=PS.spot===2?'rect':'circle';
  renderPtr();
}
function renderPtr(){
  if(PS.ring)halo.style.transform=`translate(${hx-17}px,${hy-17}px)`;
  if(PS.spot>0){
    const s=PS.size;
    spotHole.style.cssText=`left:${hx-s/2}px;top:${hy-s/2}px;width:${s}px;height:${PS.spot===2?s*0.66:s}px;`;
  }
}
function trackPtr(e){
  hx=e.clientX;hy=e.clientY;
  if(!(PS.ring||PS.spot>0)&&!lensOn)return;
  if(!ptrRAF)ptrRAF=requestAnimationFrame(()=>{ptrRAF=0;renderPtr();});
}
document.addEventListener('pointerdown',e=>{
  if(!PS.ring)return;
  const r=document.createElement('div');r.className='ripple';
  r.style.cssText=`left:${e.clientX}px;top:${e.clientY}px;transform:translate(-50%,-50%);`;
  document.body.appendChild(r);setTimeout(()=>r.remove(),520);
});
$('mRing').addEventListener('click',()=>{PS.ring=!PS.ring;syncPtr();});
$('mSpotC').addEventListener('click',()=>{PS.spot=PS.spot===1?0:1;syncPtr();});
$('mSpotR').addEventListener('click',()=>{PS.spot=PS.spot===2?0:2;syncPtr();});
$('pSize').addEventListener('input',e=>{PS.size=+e.target.value;renderPtr();});

/* ===== 돋보기: 실제 화면 정지 + 확대 (ZoomIt 방식) ===== */
let lensOn=false,lz=2,lensImgW=0,lensImgH=0,lox=0,loy=0,dragging=false,dlx,dly;
const lensWrap=$('lensWrap'),lensImg=$('lensImg');
async function toggleLens(force){
  const on=force!==undefined?force:!lensOn;
  if(on===lensOn)return;
  if(on){
    const data=await window.cm.captureScreen();
    if(!data)return;
    lensImg.src=data;
    await new Promise(r=>{lensImg.onload=r;});
    lensImgW=lensImg.naturalWidth;lensImgH=lensImg.naturalHeight;
    lz=2;centerLensAt(hx,hy);
    lensOn=true;lensWrap.classList.add('on');setIgnore(false);
  }else{
    lensOn=false;lensWrap.classList.remove('on');
  }
  $('mLens').classList.toggle('on',lensOn);
}
function centerLensAt(cx,cy){
  // 화면좌표 cx,cy가 확대 중심이 되도록 이미지 배치
  const scX=lensImgW/innerWidth, scY=lensImgH/innerHeight;
  lox=innerWidth/2 - cx*scX*(lz/scX)/1; // 단순화: 아래 applyLens에서 계산
  applyLens(cx,cy);
}
function applyLens(cx,cy){
  const sc=innerWidth/lensImgW; // 이미지→화면 기본 축소비
  const z=sc*lz;
  lox=innerWidth/2 - cx*(lensImgW/innerWidth)*z;
  loy=innerHeight/2 - cy*(lensImgH/innerHeight)*z;
  lensImg.style.transform=`translate(${lox}px,${loy}px) scale(${z})`;
}
lensWrap.addEventListener('wheel',e=>{
  e.preventDefault();
  lz=Math.min(6,Math.max(1,lz+(e.deltaY<0?0.3:-0.3)));
  applyLens(hx,hy);
},{passive:false});
lensWrap.addEventListener('pointerdown',e=>{dragging=true;dlx=e.clientX;dly=e.clientY;lensWrap.setPointerCapture(e.pointerId);});
lensWrap.addEventListener('pointermove',e=>{
  if(!dragging)return;
  lox+=e.clientX-dlx;loy+=e.clientY-dly;dlx=e.clientX;dly=e.clientY;
  const sc=innerWidth/lensImgW;
  lensImg.style.transform=`translate(${lox}px,${loy}px) scale(${sc*lz})`;
});
lensWrap.addEventListener('pointerup',()=>dragging=false);
$('mLens').addEventListener('click',()=>toggleLens());

/* ===== 주석 ===== */
const dc=$('dc'),ctx=dc.getContext('2d');
let drawMode=false,drawing=false,penColor='#ff3b3b',penType='pen',lastX,lastY,undoStack=[];
function fitC(){dc.width=innerWidth;dc.height=innerHeight;}
addEventListener('resize',fitC);fitC();
function toggleDraw(force){
  drawMode=force!==undefined?force:!drawMode;
  dc.classList.toggle('on',drawMode);
  $('dtb').classList.toggle('on',drawMode);
  $('drawBtn').classList.toggle('on',drawMode);
  if(drawMode){setPanel(null);setIgnore(false);}
}
$('drawBtn').addEventListener('click',()=>toggleDraw());
$('exitDraw').addEventListener('click',()=>toggleDraw(false));
$('clearBtn').addEventListener('click',()=>{saveSt();ctx.clearRect(0,0,dc.width,dc.height);});
document.querySelectorAll('.sw').forEach(s=>s.addEventListener('click',()=>{
  document.querySelectorAll('.sw').forEach(x=>x.classList.remove('sel'));s.classList.add('sel');penColor=s.dataset.c;
}));
function setTool(t){penType=t;['penBtn','hlBtn','erBtn'].forEach(id=>$(id).classList.remove('on'));$({pen:'penBtn',hl:'hlBtn',eraser:'erBtn'}[t]).classList.add('on');}
$('penBtn').addEventListener('click',()=>setTool('pen'));
$('hlBtn').addEventListener('click',()=>setTool('hl'));
$('erBtn').addEventListener('click',()=>setTool('eraser'));
function saveSt(){if(undoStack.length>=20)undoStack.shift();undoStack.push(ctx.getImageData(0,0,dc.width,dc.height));}
function undo(){if(undoStack.length)ctx.putImageData(undoStack.pop(),0,0);}
$('undoBtn').addEventListener('click',undo);
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z')undo();
  if(e.key==='Escape'){if(snipOn)endSnip();else if(lensOn)toggleLens(false);else allOff();}
});
dc.addEventListener('pointerdown',e=>{
  if(!drawMode)return;saveSt();drawing=true;[lastX,lastY]=[e.clientX,e.clientY];dc.setPointerCapture(e.pointerId);
  if(penType==='eraser')ctx.globalCompositeOperation='destination-out';
  else{ctx.globalCompositeOperation='source-over';ctx.globalAlpha=penType==='hl'?0.35:1;}
});
dc.addEventListener('pointermove',e=>{
  if(!drawing)return;
  const w=penType==='hl'?15:(penType==='eraser'?24:5);
  ctx.strokeStyle=penColor;ctx.lineWidth=w;ctx.lineCap='round';ctx.lineJoin='round';
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  ctx.beginPath();ctx.moveTo(lastX,lastY);
  for(const ev of (evs.length?evs:[e])){ctx.lineTo(ev.clientX,ev.clientY);[lastX,lastY]=[ev.clientX,ev.clientY];}
  ctx.stroke();
});
const endD=()=>{drawing=false;ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';};
dc.addEventListener('pointerup',endD);dc.addEventListener('pointercancel',endD);

/* ===== 전체 끄기 & 전역 단축키 수신 ===== */
function allOff(){PS.ring=false;PS.spot=0;syncPtr();toggleDraw(false);if(lensOn)toggleLens(false);if(snipOn)endSnip();}
window.cm.onHotkey(ch=>{
  switch(ch){
    case 'hk-ring': PS.ring=!PS.ring;syncPtr();break;
    case 'hk-spot': PS.spot=(PS.spot+1)%3;syncPtr();break;
    case 'hk-lens': toggleLens();break;
    case 'hk-draw': toggleDraw();break;
    case 'hk-snip': startSnip();break;
    case 'hk-dock': dock.classList.toggle('hide');break;
    case 'hk-escape': allOff();break;
  }
});
