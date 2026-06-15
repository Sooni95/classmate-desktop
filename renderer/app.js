/* ClassMate Desktop v0.4 renderer
   v0.4 변경: ① 디스플레이 인식 배치(1/2/3모니터) ② 접힘 pill 위치 유지+이동 ③ 돌림판/핀볼
   ④ 폭탄 소음 게이지 ⑤ 메모 부분 글자크기 ⑥ 형광펜 품질 + 휠 굵기 ⑦ 포인터 패널 재구성
   ⑧ 카메라→핀 ⑨ 핀 메모 ⑩ 코코아팹 브랜드(#F68C1F) */
const $ = id => document.getElementById(id);

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
  const d = dockDisp();
  el.style.left = Math.max(d.x + 8, d.x + (d.w - el.offsetWidth) / 2) + 'px';
  el.style.top = Math.max(d.y + 8, d.y + (d.h - el.offsetHeight) / 2) + 'px';
}

/* ===== 클릭 통과(click-through) 관리 ===== */
let ignoring = true;
function setIgnore(v){ if(ignoring!==v){ ignoring=v; window.cm.setIgnore(v); } }
document.addEventListener('mousemove', e => {
  if (drawMode || lensOn || snipOn || PS.spot>0) { setIgnore(false); trackPtr(e); return; }
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
  const d=dockDisp();
  // 패널이 독이 있는 모니터를 벗어나지 않도록 클램프
  const cx=Math.min(Math.max(r.left+r.width/2, d.x+175), d.x+d.w-175);
  Object.values(panels).forEach(p=>{p.style.left=cx+'px';p.style.bottom=(innerHeight-r.top+12)+'px';p.style.transform='translateX(-50%)';});
}
function clampDock(x,y,w,h){
  return {
    x: Math.min(Math.max(x, 6), innerWidth - w - 6),
    y: Math.min(Math.max(y, 6), innerHeight - h - 6),
  };
}
makeDrag($('brand'),(e,start)=>{
  if(!start){const r=dock.getBoundingClientRect();
    return{dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height};}
  const p=clampDock(e.clientX-start.dx,e.clientY-start.dy,start.w,start.h);
  dock.style.left=p.x+'px';dock.style.top=p.y+'px';
  placePanels();
});
// 시작 위치: 주 모니터 하단 중앙 (멀티모니터 합산 중앙 ✕)
async function initDockPos(){
  await refreshDisplays();
  const d=DISPLAYS.find(x=>x.primary)||DISPLAYS[0];
  const r=dock.getBoundingClientRect();
  dock.style.left=(d.x+(d.w-r.width)/2)+'px';
  dock.style.top=(d.y+d.h-r.height-22)+'px';
  dock.classList.add('ready');
  placePanels();
}
initDockPos();
// 버전 + 빌드 날짜 표시
(async()=>{
  try{
    const info=await window.cm.getAppInfo();
    const ver='v'+info.version;
    $('dockVer').textContent=ver;
    $('dockVer').title='ClassMate '+ver+(info.buildDate&&info.buildDate!=='개발 빌드'?(' (빌드: '+info.buildDate+')'):'');
    $('pillVer').textContent=ver;
  }catch(e){}
})();
// 모니터 연결/해제 시: 독이 화면 밖에 있으면 주 모니터로 복귀
window.cm.onBoundsChanged(async()=>{
  await refreshDisplays(); fitC();
  const r=dock.getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  const inside=DISPLAYS.some(d=>cx>=d.x&&cx<d.x+d.w&&cy>=d.y&&cy<d.y+d.h);
  if(!inside){
    const d=DISPLAYS.find(x=>x.primary)||DISPLAYS[0];
    dock.style.left=(d.x+(d.w-r.width)/2)+'px';
    dock.style.top=(d.y+d.h-r.height-22)+'px';
  }
  placePanels();
});
$('quitBtn').addEventListener('click',()=>window.cm.quit());
let toastT;
function toast(msg){
  const t=$('toast');const d=dockDisp();
  t.style.left=(d.x+d.w/2)+'px';
  t.style.bottom=(innerHeight-(d.y+d.h)+96)+'px';
  t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1800);
}

/* ===== 접어두기 — v0.4: 제자리 접힘 + pill 이동 가능 ===== */
const pill=$('pill');
let pillMoved=false;
function collapseDock(){
  const r=dock.getBoundingClientRect();
  dock.classList.add('hide');pill.classList.add('on');
  Object.values(panels).forEach(p=>p.classList.remove('on'));openPanel=null;
  document.querySelectorAll('.tool[data-p]').forEach(b=>b.classList.remove('on'));
  // pill을 독이 있던 그 자리에 (중앙 이동 ✕)
  const pr=pill.getBoundingClientRect();
  const p=clampDock(r.left+r.width/2-pr.width/2, r.top+r.height/2-pr.height/2, pr.width, pr.height);
  pill.style.left=p.x+'px';pill.style.top=p.y+'px';
}
function expandDock(){
  const pr=pill.getBoundingClientRect();
  dock.classList.remove('hide');pill.classList.remove('on');
  const r=dock.getBoundingClientRect();
  const p=clampDock(pr.left+pr.width/2-r.width/2, pr.top+pr.height/2-r.height/2, r.width, r.height);
  dock.style.left=p.x+'px';dock.style.top=p.y+'px';
  placePanels();
}
$('collapseBtn').addEventListener('click',collapseDock);
makeDrag(pill,(e,s)=>{
  if(!s){pillMoved=false;const r=pill.getBoundingClientRect();
    return{dx:e.clientX-r.left,dy:e.clientY-r.top,sx:e.clientX,sy:e.clientY,w:r.width,h:r.height};}
  if(Math.abs(e.clientX-s.sx)+Math.abs(e.clientY-s.sy)>4)pillMoved=true;
  const p=clampDock(e.clientX-s.dx,e.clientY-s.dy,s.w,s.h);
  pill.style.left=p.x+'px';pill.style.top=p.y+'px';
});
pill.addEventListener('click',()=>{ if(pillMoved){pillMoved=false;return;} expandDock(); });

/* ===== 타이머 ===== */
let tTotal=300,tLeft=300,tInt=null,tRun=false;
const tDisp=$('tDisp');
const fmtT=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
let floatSrc='td'; // 플로팅 창이 보여줄 것: td(타이머) / sw(스톱워치)
function showFloat(){
  const tf=$('tFloat');
  if(tf.classList.contains('on'))return;
  tf.classList.add('on');
  const d=dockDisp();
  tf.style.right='auto';
  tf.style.left=(d.x+d.w-tf.offsetWidth-30)+'px';tf.style.top=(d.y+26)+'px';
}
function rT(){
  const cls=(tLeft===0?' done':(tLeft<=10?' warn':''));
  tDisp.textContent=fmtT(tLeft);tDisp.className='tdisp'+cls;
  if(floatSrc==='td'){const tf=$('tfTime');tf.textContent=fmtT(tLeft);tf.className='tf'+cls;}
}
function stopT(){clearInterval(tInt);tInt=null;tRun=false;$('tStart').textContent='시작';}
function beep(){try{const ac=new AudioContext();[0,.2,.4].forEach(d=>{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=880;o.start(ac.currentTime+d);g.gain.setValueAtTime(.15,ac.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d+.18);o.stop(ac.currentTime+d+.2);});}catch(e){}}
document.querySelectorAll('.presets button').forEach(b=>b.addEventListener('click',()=>{tTotal=tLeft=+b.dataset.m*60;stopT();rT();}));
$('setC').addEventListener('click',()=>{tTotal=tLeft=(parseInt($('cMin').value)||0)*60+(parseInt($('cSec').value)||0);stopT();rT();});
$('tStart').addEventListener('click',function(){
  if(tRun){stopT();return;}
  if(tLeft<=0)tLeft=tTotal;
  tRun=true;this.textContent='일시정지';
  floatSrc='td';showFloat();rT();
  tInt=setInterval(()=>{tLeft--;rT();if(tLeft<=0){stopT();beep();}},1000);
});
$('tReset').addEventListener('click',()=>{stopT();tLeft=tTotal;rT();});
rT();

/* ===== 스톱워치 (카운트업) ===== */
let swSec=0,swInt=null,swRun=false;
const fmtSW=s=>{
  const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;
  return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0');
};
function rSW(){
  $('swDisp').textContent=fmtSW(swSec);
  if(floatSrc==='sw'){const tf=$('tfTime');tf.textContent=fmtSW(swSec);tf.className='tf';}
}
$('swStart').addEventListener('click',function(){
  if(swRun){clearInterval(swInt);swInt=null;swRun=false;this.textContent='계속';return;}
  swRun=true;this.textContent='일시정지';
  floatSrc='sw';showFloat();rSW();
  swInt=setInterval(()=>{swSec++;rSW();},1000);
});
$('swReset').addEventListener('click',()=>{
  clearInterval(swInt);swInt=null;swRun=false;swSec=0;
  $('swStart').textContent='시작';rSW();
});
$('tfClose').addEventListener('click',e=>{e.stopPropagation();$('tFloat').classList.remove('on');});
$('tfPause').addEventListener('click',e=>{
  e.stopPropagation();
  if(floatSrc==='sw'){$('swStart').click();$('tfPause').textContent=swRun?'⏸':'▶';}
  else{$('tStart').click();$('tfPause').textContent=tRun?'⏸':'▶';}
});
$('tfReset').addEventListener('click',e=>{
  e.stopPropagation();
  if(floatSrc==='sw')$('swReset').click();else $('tReset').click();
  $('tfPause').textContent='▶';
});
let tfSize=34;
function setTfSize(d){tfSize=Math.min(72,Math.max(22,tfSize+d));$('tfTime').style.fontSize=tfSize+'px';}
$('tfSm').addEventListener('click',e=>{e.stopPropagation();setTfSize(-8);});
$('tfLg').addEventListener('click',e=>{e.stopPropagation();setTfSize(8);});
makeDrag($('tFloat'),(e,s)=>{
  if(!s){const r=$('tFloat').getBoundingClientRect();$('tFloat').style.right='auto';return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  $('tFloat').style.left=(e.clientX-s.dx)+'px';$('tFloat').style.top=(e.clientY-s.dy)+'px';
},e=>e.target.tagName==='BUTTON');

/* ===== 발표자 (공용 명단 = 돌림판/핀볼도 사용) ===== */
let pool=[],orig=[],pHist=[],nHist=[];
const pres=$('pres'),hist=$('hist');
function loadN(){orig=$('nameList').value.split('\n').map(s=>s.trim()).filter(Boolean);pool=[...orig];}
function candidates(){loadIfStale();return $('noRep').checked?pool:orig;}
function loadIfStale(){ // textarea 변경분 반영하되 pool 유지
  const cur=$('nameList').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(JSON.stringify(cur)!==JSON.stringify(orig)){orig=cur;pool=[...orig];}
}
function recordWin(p){
  if($('noRep').checked)pool=pool.filter(x=>x!==p);
  pHist.unshift(p);if(pHist.length>5)pHist.pop();hist.textContent='최근: '+pHist.join(' → ');
}
$('nameList').addEventListener('input',loadN);
$('pickBtn').addEventListener('click',()=>{
  const src=candidates();
  if(!src.length){pres.textContent='이름 없음';return;}
  rollPick(pres,src,w=>'🎉 '+w,recordWin);
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
  $('tRes').innerHTML=teams.map((t,i)=>`<b style="color:#F68C1F">팀${i+1}</b> ${t.join(', ')}`).join('<br>');
});

/* ===== 게임 모달 공통 ===== */
const gameWrap=$('gameWrap'),gCv=$('gameCv'),gx=gCv.getContext('2d'),gRes=$('gameRes'),gGo=$('gameGo');
let gameMode=null,gameAnim=0,gameNames=[];
const BRAND=['#F68C1F','#FFB45E','#D9760F','#5b8def','#34c759','#e05544','#a78bfa','#ffd166'];
// "이름*5" → 구슬 5개 (withCount=true일 때)
function parseNames(txt,withCount){
  const out=[];
  txt.split('\n').map(s=>s.trim()).filter(Boolean).forEach(line=>{
    const m=line.match(/^(.*?)\s*\*\s*(\d+)$/);
    if(m&&withCount){const n=Math.min(10,Math.max(1,+m[2]));for(let i=0;i<n;i++)out.push(m[1].trim());}
    else out.push((m?m[1]:line).trim());
  });
  return out.filter(Boolean);
}
function openGame(mode){
  const src=mode==='wheel'?parseNames($('wheelNames').value,false):parseNames($('pkNames').value,true);
  if(src.length<2){toast('명단을 2명(개) 이상 입력하세요');return;}
  if(mode==='plinko'&&src.length>40)src.length=40; // 구슬 최대 40개
  gameNames=src;gameMode=mode;gRes.textContent='';gGo.disabled=false;
  $('gameTitle').textContent=mode==='wheel'?'🎡 돌림판':'🎢 핀볼 — 마지막에 골인하는 사람 당첨!';
  gGo.textContent=mode==='wheel'?'돌리기!':'구슬 떨어뜨리기!';
  gCv.height=mode==='wheel'?430:470;
  gameWrap.classList.add('on');
  centerOnDockDisplay(gameWrap);
  if(mode==='wheel')drawWheel(src,0);else{pk=pkInit(src);pkDraw();}
}
function closeGame(){cancelAnimationFrame(gameAnim);gameWrap.classList.remove('on');gameMode=null;}
$('gameClose').addEventListener('click',closeGame);
/* ===== 게이미피케이션 런처 ===== */
function gShowCfg(id){
  ['cfgPick','cfgDraw','cfgWheel','cfgPk'].forEach(c=>$(c).classList.remove('on'));
  ['gcPick','gcDraw','gcWheel','gcPk','gcScore','gcDice','gcLight','gcShade'].forEach(c=>$(c)&&$(c).classList.remove('on'));
  if(id)$(id).classList.add('on');
}
$('gcPick').addEventListener('click',()=>{gShowCfg('gcPick');$('cfgPick').classList.add('on');});
$('gcDraw').addEventListener('click',()=>{gShowCfg('gcDraw');$('cfgDraw').classList.add('on');});
$('gcWheel').addEventListener('click',()=>{gShowCfg('gcWheel');$('cfgWheel').classList.add('on');});
$('gcPk').addEventListener('click',()=>{gShowCfg('gcPk');$('cfgPk').classList.add('on');});
$('gcScore').addEventListener('click',()=>{gShowCfg();openWidget('scoreW');});
$('gcDice').addEventListener('click',()=>{gShowCfg();openWidget('diceW');});
$('gcLight').addEventListener('click',()=>{gShowCfg();openWidget('lightW');});
$('gcShade').addEventListener('click',()=>{gShowCfg();openShade();});

/* --- 제비뽑기 --- */
const drawWrap=$('drawWrap');let drawData=[],drawWinLeft=0,drawOpened=0;
makeDrag($('drawHead'),(e,s)=>{
  if(!s){const r=drawWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  drawWrap.style.left=(e.clientX-s.dx)+'px';drawWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='drawClose');
$('drawClose').addEventListener('click',()=>drawWrap.classList.remove('on'));
$('drawOpen').addEventListener('click',()=>{
  let items=$('drawNames').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!items.length)items=Array.from({length:30},(_,i)=>(i+1)+'번');
  if(items.length>60)items.length=60;
  const winN=Math.min(items.length,Math.max(1,parseInt($('drawWin').value)||1));
  if($('drawShuffle').checked)items=items.sort(()=>Math.random()-.5);
  // 당첨 위치 무작위 지정
  const winIdx=new Set();while(winIdx.size<winN)winIdx.add(Math.floor(Math.random()*items.length));
  drawData=items.map((t,i)=>({txt:t,win:winIdx.has(i),open:false}));
  drawWinLeft=winN;drawOpened=0;
  renderDraw();
  drawWrap.classList.add('on');
  centerOnDockDisplay(drawWrap);
});
function renderDraw(){
  $('drawCount').textContent='제비 '+drawData.length+'개 · 당첨 '+drawWinLeft+'개 남음';
  $('drawResult').textContent='';
  const g=$('drawGrid');g.innerHTML='';
  drawData.forEach((d,i)=>{
    const t=document.createElement('div');t.className='ticket'+(d.open?' open':'')+(d.open&&d.win?' win':'');
    t.innerHTML='<span class="tk-win">👑</span><span class="tk-txt">'+d.txt+'</span>';
    if(!d.open)t.addEventListener('click',()=>openTicket(i,t));
    g.appendChild(t);
  });
}
function openTicket(i,el){
  if(drawData[i].open)return;
  drawData[i].open=true;drawOpened++;
  el.classList.add('open');
  if(drawData[i].win){el.classList.add('win');if(drawWinLeft>0)drawWinLeft--;beep();
    $('drawResult').textContent='🎉 당첨! "'+drawData[i].txt+'"';}
  else{$('drawResult').textContent='"'+drawData[i].txt+'" — 꽝!';}
  $('drawCount').textContent='제비 '+drawData.length+'개 · 당첨 '+drawWinLeft+'개 남음';
}

/* --- 가리개 (스포트라이트형) --- */
const shadeWrap=$('shadeWrap'),shadeCv=$('shadeCv'),sctx=shadeCv.getContext('2d');
let shadePaint=false,shadeShape='circle';
function shadeFill(){
  shadeCv.width=innerWidth;shadeCv.height=innerHeight;
  sctx.clearRect(0,0,shadeCv.width,shadeCv.height);
  sctx.fillStyle='rgba(12,16,22,0.93)';
  sctx.fillRect(0,0,shadeCv.width,shadeCv.height);
}
function shadeReveal(x,y){
  sctx.globalCompositeOperation='destination-out';
  if(shadeShape==='circle'){
    sctx.beginPath();sctx.arc(x,y,60,0,7);sctx.fill();
  }else{
    sctx.fillRect(x-130,y-40,260,80);
  }
  sctx.globalCompositeOperation='source-over';
}
function openShade(){
  setPanel(null);
  shadeWrap.classList.add('on');setIgnore(false);
  shadeFill();
}
$('shadeClose').addEventListener('click',()=>{shadeWrap.classList.remove('on');});
$('shadeReset').addEventListener('click',shadeFill);
$('shadeMode').addEventListener('click',()=>{
  shadeShape=shadeShape==='circle'?'rect':'circle';
  $('shadeMode').textContent=shadeShape==='circle'?'⭕ 원형':'▭ 띠';
});
shadeCv.addEventListener('pointerdown',e=>{shadePaint=true;shadeCv.setPointerCapture(e.pointerId);shadeReveal(e.clientX,e.clientY);});
shadeCv.addEventListener('pointermove',e=>{if(shadePaint)shadeReveal(e.clientX,e.clientY);});
shadeCv.addEventListener('pointerup',()=>shadePaint=false);
addEventListener('resize',()=>{if(shadeWrap.classList.contains('on'))shadeFill();});

// 플로팅 위젯 공통: 표시 + 드래그 + 닫기
function openWidget(id){
  const w=$(id);
  if(!w.dataset.init){
    makeDrag(w.querySelector('.fwh'),(e,s)=>{
      if(!s){const r=w.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      w.style.left=(e.clientX-s.dx)+'px';w.style.top=(e.clientY-s.dy)+'px';
    },e=>e.target.classList.contains('x'));
    w.querySelector('.x').addEventListener('click',()=>w.classList.remove('on'));
    w.dataset.init='1';
    if(id==='scoreW'){[1,2,3].forEach(()=>scoreAddRow());}
    if(id==='diceW')diceRender(1);
  }
  w.classList.add('on');
  const d=dockDisp();
  w.style.left=(d.x+d.w/2-w.offsetWidth/2+(Math.random()*80-40))+'px';
  w.style.top=(d.y+d.h/2-w.offsetHeight/2)+'px';
}

/* --- 모둠 점수판 --- */
let scoreN=0;const SCORE_COL=['#F68C1F','#5b8def','#37c871','#e84d3d','#a78bfa','#ffc02e'];
function scoreAddRow(name){
  scoreN++;const i=scoreN;
  const row=document.createElement('div');row.className='srow2';
  row.dataset.score='0';
  row.innerHTML=`<span class="crown"></span>
    <span style="width:9px;height:9px;border-radius:50%;background:${SCORE_COL[(i-1)%6]}"></span>
    <input class="nm2" value="${name||('모둠 '+i)}">
    <button class="mn">－</button><span class="sc">0</span><button class="pl2">＋</button>`;
  $('scoreRows').appendChild(row);
  const sc=row.querySelector('.sc');
  const upd=d=>{let v=+row.dataset.score+d;row.dataset.score=v;sc.textContent=v;sc.classList.remove('pop');void sc.offsetWidth;sc.classList.add('pop');scoreRank();};
  row.querySelector('.pl2').addEventListener('click',()=>upd(1));
  row.querySelector('.mn').addEventListener('click',()=>upd(-1));
}
function scoreRank(){
  const rows=[...$('scoreRows').children];
  const max=Math.max(...rows.map(r=>+r.dataset.score));
  rows.forEach(r=>{
    const lead=+r.dataset.score===max&&max>0;
    r.classList.toggle('lead',lead);
    r.querySelector('.crown').textContent=lead?'👑':'';
  });
}
$('scoreAdd').addEventListener('click',()=>scoreAddRow());

/* --- 주사위 --- */
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
let diceCount=1;
$('diceW')&&$('diceW').querySelectorAll('.dcnt button').forEach(b=>b.addEventListener('click',()=>{
  $('diceW').querySelectorAll('.dcnt button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');diceCount=+b.dataset.n;diceRender(diceCount);$('diceTotal').textContent='';
}));
function dieEl(v){
  const d=document.createElement('div');d.className='die';
  for(let i=0;i<9;i++){const dot=document.createElement('i');if(PIPS[v].includes(i))dot.style.visibility='visible';d.appendChild(dot);}
  return d;
}
function diceRender(n,vals){
  const wrap=$('diceFaces');wrap.innerHTML='';
  for(let i=0;i<n;i++)wrap.appendChild(dieEl(vals?vals[i]:1));
}
$('diceRoll').addEventListener('click',()=>{
  const dice=[...$('diceFaces').children];dice.forEach(d=>d.classList.add('rolling'));
  $('diceTotal').textContent='';
  let n=0;const iv=setInterval(()=>{
    const vals=Array.from({length:diceCount},()=>1+Math.floor(Math.random()*6));
    diceRender(diceCount,vals);$('diceFaces').querySelectorAll('.die').forEach(d=>d.classList.add('rolling'));
    if(++n>=11){clearInterval(iv);
      const fin=Array.from({length:diceCount},()=>1+Math.floor(Math.random()*6));
      diceRender(diceCount,fin);
      const sum=fin.reduce((a,b)=>a+b,0);
      $('diceTotal').innerHTML=diceCount>1?('합계 <b>'+sum+'</b>'):('<b>'+sum+'</b>');
      beep();
    }
  },70);
});

/* --- 신호등 --- */
$('lightW')&&$('lightW').querySelectorAll('.tl button').forEach(b=>b.addEventListener('click',()=>{
  $('lightW').querySelectorAll('.tl button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');$('lightLabel').textContent=b.dataset.m;
}));

$('wheelOpen').addEventListener('click',()=>openGame('wheel'));
$('plinkoOpen').addEventListener('click',()=>openGame('plinko'));
makeDrag($('gameHead'),(e,s)=>{
  if(!s){const r=gameWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  gameWrap.style.left=(e.clientX-s.dx)+'px';gameWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='gameClose');
gGo.addEventListener('click',()=>{
  gGo.disabled=true;gRes.textContent='';
  if(gameMode==='wheel')spinWheel(gameNames);else dropPlinko();
});

/* --- 돌림판 (당첨 = 위쪽 중앙 포인터) --- */
const WW=540,WH=430,WCX=WW/2,WCY=WH/2+12,WR=178;
function drawWheel(names,angle){
  gx.clearRect(0,0,WW,WH);
  // 외곽 림
  gx.beginPath();gx.arc(WCX,WCY,WR+11,0,7);
  gx.strokeStyle='#2c3744';gx.lineWidth=16;gx.stroke();
  const n=names.length,step=Math.PI*2/n;
  for(let i=0;i<n;i++){
    const a0=angle+i*step,a1=a0+step;
    gx.beginPath();gx.moveTo(WCX,WCY);gx.arc(WCX,WCY,WR,a0,a1);gx.closePath();
    gx.fillStyle=BRAND[i%BRAND.length];gx.fill();
    gx.strokeStyle='rgba(0,0,0,.25)';gx.lineWidth=1;gx.stroke();
    gx.save();gx.translate(WCX,WCY);gx.rotate(a0+step/2);
    gx.fillStyle='#fff';
    gx.font='bold '+(n>20?11:n>12?13:16)+'px "Malgun Gothic"';
    gx.shadowColor='rgba(0,0,0,.4)';gx.shadowBlur=3;
    gx.textAlign='right';gx.textBaseline='middle';
    const label=names[i].length>6?names[i].slice(0,6)+'…':names[i];
    gx.fillText(label,WR-12,0);gx.restore();
  }
  // 중심
  gx.beginPath();gx.arc(WCX,WCY,26,0,7);gx.fillStyle='#161c24';gx.fill();
  gx.strokeStyle='#F68C1F';gx.lineWidth=4;gx.stroke();
  gx.font='16px serif';gx.textAlign='center';gx.textBaseline='middle';
  gx.fillText('🦋',WCX,WCY+1);
  // 림 라이트 (천천히 역회전하는 전구 느낌)
  for(let i=0;i<14;i++){
    const a=-angle/3+i*Math.PI*2/14;
    gx.beginPath();gx.arc(WCX+Math.cos(a)*(WR+11),WCY+Math.sin(a)*(WR+11),3.2,0,7);
    gx.fillStyle=i%2?'#F68C1F':'#ffd9ad';gx.fill();
  }
  // 포인터: 위쪽 중앙, 아래(원판)를 향함
  gx.beginPath();
  gx.moveTo(WCX,WCY-WR+16);          // 뾰족한 끝 (원판 안쪽)
  gx.lineTo(WCX-14,WCY-WR-12);
  gx.lineTo(WCX+14,WCY-WR-12);
  gx.closePath();
  gx.fillStyle='#fff';gx.fill();
  gx.strokeStyle='rgba(0,0,0,.35)';gx.lineWidth=2;gx.stroke();
}
function spinWheel(names){
  const n=names.length,step=Math.PI*2/n;
  const T=4200,start=performance.now();
  const final=Math.random()*Math.PI*2+Math.PI*2*(4+Math.random()*2);
  const ease=t=>1-Math.pow(1-t,3);
  const tick=now=>{
    const t=Math.min(1,(now-start)/T);
    const a=final*ease(t);
    drawWheel(names,a);
    if(t<1){gameAnim=requestAnimationFrame(tick);}
    else{
      // 위쪽 중앙 포인터(절대각 -90°)가 가리키는 조각
      const norm=(((-Math.PI/2)-a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      const idx=Math.floor(norm/step)%n;
      gRes.textContent='🎉 '+names[idx]+'!';beep();gGo.disabled=false;
    }
  };
  gameAnim=requestAnimationFrame(tick);
}

/* --- 핀볼: 전원 동시 투하 + 좁은 골목 몸싸움 ---
   좁은 골(40px) 앞에서 문지기 막대와 구슬들이 엉키며 순서가 갈림.
   마지막에 골인한 구슬의 주인이 당첨. (이름*5 = 구슬 5개)
   연출: 골인 이펙트 / 남은 구슬 ≤3 글로우 / 마지막 1개 슬로모션 / 우승 꽃가루 */
const PKW=540,PKH=470,PK_GAP=20;
let pk=null;
function pkInit(names){
  const uniq=[...new Set(names)];
  const order=[...names].sort(()=>Math.random()-.5);
  const balls=order.map((nm,i)=>({
    nm,col:BRAND[uniq.indexOf(nm)%BRAND.length],
    x:60+Math.random()*(PKW-120),y:-20-i*34,
    vx:(Math.random()-.5)*60,vy:0,r:11,done:false,slow:0
  }));
  const pegs=[];
  for(let r=0;r<7;r++){
    const cnt=7+(r%2);
    for(let c=0;c<cnt;c++)pegs.push({x:(PKW/(cnt+1))*(c+1),y:84+r*33,r:6});
  }
  // 큰 범퍼(통통 튕기는 원형 장애물)
  const bumpers=[
    {x:PKW*0.5,y:175,r:17},
    {x:PKW*0.26,y:260,r:14},
    {x:PKW*0.74,y:260,r:14},
  ];
  const paddles=[
    {cx:PKW*0.30,cy:330,len:80,a:Math.random()*6,w:1.9,flash:0},
    {cx:PKW*0.70,cy:330,len:80,a:Math.random()*6,w:-2.2,flash:0},
    {cx:PKW/2,  cy:418,len:88,a:Math.random()*6,w:1.5,flash:0}, // 골 문지기
  ];
  return {balls,pegs,paddles,bumpers,arrived:[],fx:[]};
}
function collideCircle(b,cx,cy,cr,rest){
  let nx=b.x-cx,ny=b.y-cy;const d=Math.hypot(nx,ny),min=b.r+cr;
  if(d===0||d>=min)return false;
  nx/=d;ny/=d;
  b.x+=nx*(min-d);b.y+=ny*(min-d);
  const vn=b.vx*nx+b.vy*ny;
  if(vn<0){b.vx-=(1+rest)*vn*nx;b.vy-=(1+rest)*vn*ny;}
  return true;
}
function collideSeg(b,x1,y1,x2,y2,rest){
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy||1;
  let t=((b.x-x1)*dx+(b.y-y1)*dy)/len2;t=Math.max(0,Math.min(1,t));
  const px=x1+dx*t,py=y1+dy*t;
  let nx=b.x-px,ny=b.y-py;const d=Math.hypot(nx,ny);
  if(d===0||d>=b.r)return false;
  nx/=d;ny/=d;
  b.x+=nx*(b.r-d);b.y+=ny*(b.r-d);
  const vn=b.vx*nx+b.vy*ny;
  if(vn<0){b.vx-=(1+rest)*vn*nx;b.vy-=(1+rest)*vn*ny;}
  return true;
}
function pkFx(type,x,y,col,nm){pk.fx.push({type,x,y,col,nm,life:1,vy:type==='txt'?-46:0});}
function pkStep(dt){
  const G=410,REST=0.66;
  pk.paddles.forEach(p=>{p.a+=p.w*dt;p.flash=Math.max(0,p.flash-dt);});
  pk.bumpers.forEach(p=>{p.flash=Math.max(0,(p.flash||0)-dt);});
  for(const b of pk.balls){
    if(b.done)continue;
    b.vy+=G*dt;
    b.vx*=0.998;b.vy*=0.999;
    const cap=Math.hypot(b.vx,b.vy);
    if(cap>600){b.vx*=600/cap;b.vy*=600/cap;}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*REST;}
    if(b.x>PKW-b.r){b.x=PKW-b.r;b.vx=-Math.abs(b.vx)*REST;}
    for(const p of pk.pegs){
      if(collideCircle(b,p.x,p.y,p.r,0.7)&&Math.hypot(b.vx,b.vy)>220)
        pkFx('spark',p.x,p.y,b.col);
    }
    for(const p of pk.bumpers){
      if(collideCircle(b,p.x,p.y,p.r,1.15)){ // 탄성>1: 튕겨 가속
        b.vx*=1.04;b.vy*=1.04;p.flash=0.16;
        pkFx('ring',p.x,p.y,'#F68C1F');
      }
      if(p.flash===undefined)p.flash=0;
    }
    collideSeg(b,0,362,PKW/2-PK_GAP,440,0.42);
    collideSeg(b,PKW,362,PKW/2+PK_GAP,440,0.42);
    collideSeg(b,PKW/2-PK_GAP,440,PKW/2-PK_GAP,PKH,0.3);
    collideSeg(b,PKW/2+PK_GAP,440,PKW/2+PK_GAP,PKH,0.3);
    for(const p of pk.paddles){
      const hx2=Math.cos(p.a)*p.len/2,hy2=Math.sin(p.a)*p.len/2;
      if(collideSeg(b,p.cx-hx2,p.cy-hy2,p.cx+hx2,p.cy+hy2,0.5)){
        const rx=b.x-p.cx,ry=b.y-p.cy;
        b.vx+=-ry*p.w*0.7;b.vy+=rx*p.w*0.7;
        p.flash=0.14;
      }
    }
    if(b.y>PKH-10){
      b.done=true;pk.arrived.push(b);
      pkFx('ring',PKW/2,PKH-16,b.col);
      pkFx('txt',PKW/2,PKH-40,b.col,b.nm+' 골인!');
    }
    const sp=Math.hypot(b.vx,b.vy);
    if(sp<12&&b.y>0){b.slow+=dt;if(b.slow>1.4){b.vx+=(Math.random()-.5)*180;b.vy-=120;b.slow=0;}}else b.slow=0;
  }
  const bs=pk.balls.filter(b=>!b.done&&b.y>-12);
  for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){
    const a=bs[i],c=bs[j];let dx=c.x-a.x,dy=c.y-a.y;
    const d=Math.hypot(dx,dy),min=a.r+c.r;
    if(d>0&&d<min){
      dx/=d;dy/=d;const pen=(min-d)/2;
      a.x-=dx*pen;a.y-=dy*pen;c.x+=dx*pen;c.y+=dy*pen;
      const rel=(c.vx-a.vx)*dx+(c.vy-a.vy)*dy;
      if(rel<0){a.vx+=rel*dx*.9;a.vy+=rel*dy*.9;c.vx-=rel*dx*.9;c.vy-=rel*dy*.9;}
    }
  }
  // 이펙트 수명
  pk.fx.forEach(f=>{f.life-=dt*(f.type==='txt'?0.8:1.8);if(f.type==='txt')f.y+=f.vy*dt;});
  pk.fx=pk.fx.filter(f=>f.life>0);
}
function pkDraw(){
  const bg=gx.createLinearGradient(0,0,0,PKH);
  bg.addColorStop(0,'#0d1218');bg.addColorStop(1,'#161f2a');
  gx.fillStyle=bg;gx.fillRect(0,0,PKW,PKH);
  // 사이드 레일
  gx.strokeStyle='rgba(246,140,31,.35)';gx.lineWidth=4;
  gx.beginPath();gx.moveTo(2,0);gx.lineTo(2,360);gx.stroke();
  gx.beginPath();gx.moveTo(PKW-2,0);gx.lineTo(PKW-2,360);gx.stroke();
  const alive=pk.balls.filter(b=>!b.done);
  const line=(x1,y1,x2,y2)=>{gx.beginPath();gx.moveTo(x1,y1);gx.lineTo(x2,y2);gx.stroke();};
  // 깔때기
  gx.strokeStyle='#3a4654';gx.lineWidth=5;gx.lineCap='round';
  line(0,362,PKW/2-PK_GAP,440);line(PKW,362,PKW/2+PK_GAP,440);
  line(PKW/2-PK_GAP,440,PKW/2-PK_GAP,PKH-3);line(PKW/2+PK_GAP,440,PKW/2+PK_GAP,PKH-3);
  gx.fillStyle='rgba(246,140,31,.16)';gx.fillRect(PKW/2-PK_GAP+3,442,PK_GAP*2-6,PKH-445);
  gx.fillStyle='#F68C1F';gx.font='bold 10px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
  gx.fillText('GOAL',PKW/2,PKH-14);
  // 핀
  gx.fillStyle='#5b6878';
  pk.pegs.forEach(p=>{gx.beginPath();gx.arc(p.x,p.y,p.r,0,7);gx.fill();});
  // 범퍼
  pk.bumpers.forEach(p=>{
    gx.beginPath();gx.arc(p.x,p.y,p.r,0,7);
    gx.fillStyle=p.flash>0?'#fff':'#D9760F';gx.fill();
    gx.lineWidth=3;gx.strokeStyle='#F68C1F';gx.stroke();
    gx.fillStyle=p.flash>0?'#D9760F':'#ffd9ad';
    gx.beginPath();gx.arc(p.x,p.y,p.r*0.45,0,7);gx.fill();
  });
  // 회전 막대 (맞으면 번쩍)
  pk.paddles.forEach(p=>{
    const hx2=Math.cos(p.a)*p.len/2,hy2=Math.sin(p.a)*p.len/2;
    gx.strokeStyle=p.flash>0?'#ffffff':'#F68C1F';gx.lineWidth=7;gx.lineCap='round';
    gx.beginPath();gx.moveTo(p.cx-hx2,p.cy-hy2);gx.lineTo(p.cx+hx2,p.cy+hy2);gx.stroke();
    gx.fillStyle='#fff';gx.beginPath();gx.arc(p.cx,p.cy,4.5,0,7);gx.fill();
  });
  // 이펙트
  for(const f of pk.fx){
    if(f.type==='spark'){
      gx.globalAlpha=f.life;gx.fillStyle=f.col;
      gx.beginPath();gx.arc(f.x,f.y,3+(1-f.life)*4,0,7);gx.fill();gx.globalAlpha=1;
    }else if(f.type==='ring'){
      gx.globalAlpha=f.life;gx.strokeStyle=f.col;gx.lineWidth=3;
      gx.beginPath();gx.arc(f.x,f.y,8+(1-f.life)*36,0,7);gx.stroke();gx.globalAlpha=1;
    }else if(f.type==='txt'){
      gx.globalAlpha=Math.min(1,f.life*1.4);
      gx.font='bold 14px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
      gx.lineWidth=3;gx.strokeStyle='rgba(0,0,0,.7)';gx.strokeText(f.nm,f.x,f.y);
      gx.fillStyle='#fff';gx.fillText(f.nm,f.x,f.y);gx.globalAlpha=1;
    }else if(f.type==='confetti'){
      gx.globalAlpha=Math.min(1,f.life);gx.fillStyle=f.col;
      gx.fillRect(f.x-3,f.y-3,6,6);gx.globalAlpha=1;
    }
  }
  // 구슬 (남은 ≤3 글로우)
  for(const b of pk.balls){
    if(b.done||b.y<-10)continue;
    if(alive.length<=3){gx.shadowColor=b.col;gx.shadowBlur=16;}
    const grad=gx.createRadialGradient(b.x-3,b.y-3,1,b.x,b.y,b.r);
    grad.addColorStop(0,'#ffffff');grad.addColorStop(.25,b.col);grad.addColorStop(1,b.col);
    gx.beginPath();gx.arc(b.x,b.y,b.r,0,7);gx.fillStyle=grad;gx.fill();
    gx.shadowBlur=0;
    gx.strokeStyle='rgba(0,0,0,.35)';gx.lineWidth=1;gx.stroke();
    gx.font='bold 10px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=2.5;gx.strokeStyle='rgba(0,0,0,.65)';
    gx.strokeText(b.nm.slice(0,2),b.x,b.y);
    gx.fillStyle='#fff';gx.fillText(b.nm.slice(0,2),b.x,b.y);
  }
  // 마지막 1개 — 두근두근 배너
  if(alive.length===1&&pk.arrived.length){
    const pulse=0.7+0.3*Math.sin(performance.now()/120);
    gx.globalAlpha=pulse;
    gx.font='bold 22px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=4;gx.strokeStyle='rgba(0,0,0,.75)';
    gx.strokeText('🔥 마지막 구슬: '+alive[0].nm+' 🔥',PKW/2,42);
    gx.fillStyle='#F68C1F';gx.fillText('🔥 마지막 구슬: '+alive[0].nm+' 🔥',PKW/2,42);
    gx.globalAlpha=1;
  }else{
    gx.fillStyle='#9fb0bf';gx.font='12px "Malgun Gothic"';gx.textAlign='left';gx.textBaseline='alphabetic';
    gx.fillText('남은 구슬 '+alive.length,10,20);
    if(pk.arrived.length){
      gx.textAlign='right';
      gx.fillText('골인: '+pk.arrived.slice(-3).map(b=>b.nm).join(' → '),PKW-10,20);
    }
  }
}
function dropPlinko(){
  pk=pkInit(gameNames);
  let last=performance.now();const t0=last;
  const tick=now=>{
    const alive=pk.balls.filter(b=>!b.done).length;
    const scale=alive===1?0.45:1;          // 마지막 1개 → 슬로모션
    const dt=Math.min(0.032,(now-last)/1000)*scale;last=now;
    pkStep(dt/2);pkStep(dt/2);
    pkDraw();
    if(alive>0&&now-t0<150000){gameAnim=requestAnimationFrame(tick);}
    else{
      let w=pk.arrived.at(-1);
      if(!w){const rem=pk.balls.filter(b=>!b.done);w=rem[rem.length-1];}
      if(w){
        // 꽃가루
        for(let i=0;i<70;i++)pk.fx.push({type:'confetti',x:PKW/2+(Math.random()-.5)*PKW,y:-10-Math.random()*120,col:BRAND[i%BRAND.length],life:2.5,vy:0});
        let fl=performance.now();
        const fin=fn=>{
          const fdt=Math.min(0.032,(fn-fl)/1000);fl=fn;
          pk.fx.forEach(f=>{if(f.type==='confetti'){f.y+=170*fdt;f.x+=Math.sin(f.y/22)*1.4;f.life-=fdt*0.7;}});
          pk.fx=pk.fx.filter(f=>f.life>0);
          pkDraw();
          gx.fillStyle='rgba(22,28,36,.82)';gx.fillRect(0,PKH/2-58,PKW,116);
          gx.fillStyle='#F68C1F';gx.font='bold 36px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
          gx.fillText('🎉 '+w.nm,PKW/2,PKH/2-8);
          gx.fillStyle='#fff';gx.font='14px "Malgun Gothic"';
          gx.fillText('마지막 골인 — 당첨!',PKW/2,PKH/2+30);
          if(pk.fx.length)gameAnim=requestAnimationFrame(fin);
        };
        gameAnim=requestAnimationFrame(fin);
        gRes.textContent='🎉 마지막 골인: '+w.nm+'!';
      }
      beep();gGo.disabled=false;
    }
  };
  gameAnim=requestAnimationFrame(tick);
}

/* ===== QR ===== */
let qrT;
$('qrUrl').addEventListener('input',e=>{clearTimeout(qrT);qrT=setTimeout(()=>genQR(e.target.value.trim()),450);});
function makeQR(el,text){
  el.innerHTML='';
  try{new QRCode(el,{text,width:132,height:132,colorDark:'#1c1d1f',colorLight:'#ffffff'});}catch(e){}
}
function genQR(url){
  const box=$('qrbox');
  if(!url){box.className='empty';box.textContent='URL 입력 시 자동 생성 (오프라인 작동)';$('qrAct').classList.remove('on');return;}
  box.className='';makeQR(box,url);
  $('qrAct').classList.add('on');
}
// QR 이미지 추출 → 저장/복사
function qrDataURL(box){
  const img=box.querySelector('img');
  if(img&&img.src)return img.src;
  const cv=box.querySelector('canvas');
  return cv?cv.toDataURL('image/png'):null;
}
async function saveQRImage(box,filename){
  const d=qrDataURL(box);
  if(!d){toast('QR을 먼저 생성하세요');return;}
  const r=await window.cm.saveImage({dataURL:d,filename});
  if(r.ok)toast('💾 QR 이미지 저장 완료');
}
function copyQRImage(box){
  const d=qrDataURL(box);
  if(!d){toast('QR을 먼저 생성하세요');return;}
  window.cm.copyImage(d);
  toast('📋 QR 복사됨 — 한글/PPT에 Ctrl+V');
}
$('qrSave').addEventListener('click',()=>saveQRImage($('qrbox'),'QR코드.png'));
$('qrCopy').addEventListener('click',()=>copyQRImage($('qrbox')));
$('suQrSave').addEventListener('click',()=>saveQRImage($('suQr'),'QR_'+($('suUrl').textContent.split('/')[1]||'단축주소')+'.png'));
$('suQrCopy').addEventListener('click',()=>copyQRImage($('suQr')));

/* ===== 단축주소 (코코아팹.kr) — 온라인 기능 ===== */
const SU_BASE='코코아팹.kr';
const SU_TOKEN_DEFAULT='kocoafab2026';
let suTtl=604800;
function suKeys(){try{return JSON.parse(localStorage.getItem('su_keys')||'{}');}catch(e){return{};}}
function suKeySave(slug,key){const m=suKeys();m[slug]=key;localStorage.setItem('su_keys',JSON.stringify(m));}
function genKey(){return crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2,10);}
$('suTtl').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  $('suTtl').querySelectorAll('button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');suTtl=+b.dataset.s;
}));

function suSay(msg,good){const m=$('suMsg');m.textContent=msg;m.style.color=good?'#34c759':'var(--amber)';}
$('suGo').addEventListener('click',async()=>{
  let target=$('suTarget').value.trim();
  const slug=$('suSlug').value.trim();
  const token=SU_TOKEN_DEFAULT;
  if(!target){suSay('원본 URL을 입력하세요');return;}
  if(!/^https?:\/\//i.test(target))target='https://'+target;
  if(!slug){suSay('단축 이름을 입력하세요 (예: 수업자료)');return;}
  if(/[\/\s?#]/.test(slug)||slug.toLowerCase()==='api'){suSay('단축 이름에 공백, /, ?, # 은 쓸 수 없어요');return;}
  $('suGo').disabled=true;$('suGo').textContent='만드는 중…';suSay('');
  const key=suKeys()[slug]||genKey();
  const res=await window.cm.shorten({slug,target,ttl:suTtl,token,key});
  $('suGo').disabled=false;$('suGo').textContent='단축주소 만들기';
  if(res.ok){
    suKeySave(slug,key);
    let data={};try{data=JSON.parse(res.message);}catch(e){}
    const short=SU_BASE+'/'+slug;
    const exp=new Date(Date.now()+suTtl*1000);
    $('suUrl').textContent=short;
    $('suExp').textContent='만료: '+exp.getFullYear()+'.'+String(exp.getMonth()+1).padStart(2,'0')+'.'+String(exp.getDate()).padStart(2,'0')+' (이후 자동 삭제)';
    $('suCard').classList.add('on');$('suQr').classList.remove('on');$('suQr').innerHTML='';
    $('suQrAct').classList.remove('on');
    suSay(data.updated?'♻️ 기존 QR·주소 그대로 — 연결만 새 URL로 변경됐어요!':'완성! 복사하거나 QR로 띄워보세요 🎉',true);
  }else if(res.status===409){suSay('"'+slug+'" 는 다른 곳에서 사용 중인 이름이에요 — 다른 이름을 써보세요');}
  else if(res.status===403){suSay('서버 연동 오류 (관리자 문의)');} 
  else if(res.status===0){suSay('인터넷 연결을 확인하세요 (단축주소는 온라인 기능)');}
  else{suSay('오류: '+(res.message||res.status));}
});
$('suCopy').addEventListener('click',()=>{
  window.cm.copyText('https://'+$('suUrl').textContent);
  toast('📋 단축주소 복사됨');
});
$('suQrBtn').addEventListener('click',()=>{
  const box=$('suQr');
  if(box.classList.contains('on')){box.classList.remove('on');$('suQrAct').classList.remove('on');return;}
  box.classList.add('on');$('suQrAct').classList.add('on');
  // QR에는 퓨니코드 형태로 (구형 스캐너 호환), 화면 표시는 한글
  makeQR(box,new URL('https://'+$('suUrl').textContent).href);
});

/* ===== 메모 — v0.4: 부분 글자 크기 (선택한 단어만) ===== */
const MCOLS=['#FFF3A3','#FFB3C6','#B3F0D4','#C7D2FF'];let mCnt=0;
function applyFontSize(ed,dir){
  const sel=getSelection();
  const hasSel=sel.rangeCount&&!sel.isCollapsed&&ed.contains(sel.anchorNode)&&ed.contains(sel.focusNode);
  if(hasSel){
    // 선택된 부분만 정확히 span으로 감싸서 크기 변경 (execCommand의 '옆 글자' 버그 제거)
    const range=sel.getRangeAt(0);
    const node=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer;
    const cur=parseFloat(getComputedStyle(node).fontSize)||14;
    const next=Math.min(56,Math.max(10,cur+dir*4));
    const span=document.createElement('span');span.style.fontSize=next+'px';
    try{range.surroundContents(span);}
    catch(e){span.appendChild(range.extractContents());range.insertNode(span);}
    // 같은 부분을 계속 키우고 줄일 수 있게 재선택
    sel.removeAllRanges();
    const nr=document.createRange();nr.selectNodeContents(span);sel.addRange(nr);
  }else{
    const cur=parseFloat(ed.style.fontSize)||14;
    ed.style.fontSize=Math.min(56,Math.max(10,cur+dir*4))+'px';
  }
}
$('memoBtn').addEventListener('click',()=>{
  mCnt++;const m=document.createElement('div');m.className='memo iv';
  const c=MCOLS[mCnt%4];
  const d=dockDisp();
  m.style.cssText=`left:${d.x+130+Math.random()*200}px;top:${d.y+110+Math.random()*160}px;`;
  m.innerHTML=`<div class="mbar" style="background:${c}cc">
    <span style="display:flex;align-items:center;gap:4px">
      <button class="fbtn" data-f="-1" title="선택한 글자 작게">A-</button><button class="fbtn" data-f="1" title="선택한 글자 크게">A+</button>
      <button class="fbtn" id="mCopy" title="클립보드로 복사">📋</button>
      <button class="fbtn" id="mSave" title="txt 파일로 저장">💾</button>
      <input type="range" min="35" max="100" value="100" title="투명도">
    </span>
    <span><button class="mbtn2">─</button><button class="mbtn2">×</button></span>
  </div><div class="mtext" contenteditable="true" data-ph="메모… (단어 드래그 후 A+/A-)" style="background:${c}"></div><div class="rs2"></div>`;
  document.body.appendChild(m);
  const ed=m.querySelector('.mtext');
  const [minB,xB]=m.querySelectorAll('.mbtn2');
  xB.addEventListener('click',()=>m.remove());
  minB.addEventListener('click',()=>{m.classList.toggle('min');minB.textContent=m.classList.contains('min')?'▢':'─';});
  // 복사 / txt 저장
  m.querySelector('#mCopy').addEventListener('mousedown',e=>e.preventDefault());
  m.querySelector('#mCopy').addEventListener('click',()=>{
    const t=ed.innerText.trim();
    if(!t){toast('메모가 비어있어요');return;}
    window.cm.copyText(t);toast('📋 메모 복사됨');
  });
  m.querySelector('#mSave').addEventListener('mousedown',e=>e.preventDefault());
  m.querySelector('#mSave').addEventListener('click',async()=>{
    const t=ed.innerText.trim();
    if(!t){toast('메모가 비어있어요');return;}
    const now=new Date();
    const fn='메모_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'.txt';
    const r=await window.cm.saveText({text:t,filename:fn});
    if(r&&r.ok)toast('💾 메모 저장 완료');
  });
  m.querySelectorAll('.fbtn').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault()); // 선택 유지
    b.addEventListener('click',()=>applyFontSize(ed,+b.dataset.f));
  });
  m.querySelector('input[type=range]').addEventListener('input',e=>m.style.opacity=e.target.value/100);
  makeDrag(m.querySelector('.mbar'),(e,s)=>{
    if(!s){const r=m.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    m.style.left=(e.clientX-s.dx)+'px';m.style.top=(e.clientY-s.dy)+'px';
  },e=>['BUTTON','INPUT'].includes(e.target.tagName));
  makeDrag(m.querySelector('.rs2'),(e,s)=>{
    if(!s)return{sx:e.clientX,sy:e.clientY,sw:m.offsetWidth,sh:ed.offsetHeight};
    m.style.width=Math.max(150,s.sw+(e.clientX-s.sx))+'px';
    ed.style.minHeight=Math.max(60,s.sh+(e.clientY-s.sy))+'px';
  });
  ed.focus();
});

/* ===== 핀 — v0.4: 핀 위 메모(캡션) + 카메라 ===== */
function addPin(src,label,x,y,w){
  const p=document.createElement('div');p.className='pin iv';
  const d=dockDisp();
  p.style.cssText=`left:${x??(d.x+200+Math.random()*160)}px;top:${y??(d.y+110+Math.random()*120)}px;width:${w??280}px;`;
  p.innerHTML=`<div class="pb"><span class="lbl">📌 ${label||'핀'}</span><span style="display:flex;align-items:center;gap:5px"><button class="cap" title="핀 메모">✎</button><input type="range" min="25" max="100" value="100" title="투명도"><button class="x">×</button></span></div><img src="${src}" draggable="false"><div class="pcap" contenteditable="true"></div><div class="rs"></div>`;
  document.body.appendChild(p);
  p.querySelector('.x').addEventListener('click',()=>p.remove());
  const capBtn=p.querySelector('.cap'),capEl=p.querySelector('.pcap');
  capBtn.addEventListener('click',()=>{
    capEl.classList.toggle('on');capBtn.classList.toggle('on');
    if(capEl.classList.contains('on'))capEl.focus();
  });
  p.querySelector('input[type=range]').addEventListener('input',e=>p.style.opacity=e.target.value/100);
  makeDrag(p.querySelector('.pb'),(e,s)=>{
    if(!s){const r=p.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    p.style.left=(e.clientX-s.dx)+'px';p.style.top=(e.clientY-s.dy)+'px';
  },e=>['BUTTON','INPUT'].includes(e.target.tagName));
  makeDrag(p.querySelector('.rs'),(e,s)=>{
    if(!s)return{sx:e.clientX,sw:p.offsetWidth};
    p.style.width=Math.max(100,s.sw+(e.clientX-s.sx))+'px';
  });
}
document.addEventListener('paste',e=>{
  const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));
  if(it){const r=new FileReader();r.onload=ev=>addPin(ev.target.result,'붙여넣기');r.readAsDataURL(it.getAsFile());}
});

/* --- 카메라 → 핀 --- */
let camStream=null;
async function openCam(){
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280}},audio:false});
    $('camVid').srcObject=camStream;
    $('camWrap').classList.add('on');
    centerOnDockDisplay($('camWrap'));
  }catch(e){toast('📷 카메라를 찾을 수 없거나 권한이 거부되었습니다');}
}
function closeCam(){
  if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}
  $('camWrap').classList.remove('on');
}
$('camBtn').addEventListener('click',openCam);
$('camCancel').addEventListener('click',closeCam);
$('camShot').addEventListener('click',()=>{
  const v=$('camVid');
  if(!v.videoWidth){toast('카메라 준비 중…');return;}
  const cv=document.createElement('canvas');cv.width=v.videoWidth;cv.height=v.videoHeight;
  cv.getContext('2d').drawImage(v,0,0);
  addPin(cv.toDataURL('image/png'),'카메라');
  closeCam();toast('📌 촬영 사진이 핀으로 고정됨 — ✎ 버튼으로 메모 추가');
});

/* ===== 영역 캡처 → 핀 ===== */
let snipOn=false,snipImgData=null,sx0,sy0;
const snipWrap=$('snipWrap'),snipRect=$('snipRect');
let snipB=null;
async function startSnip(){
  if(snipOn)return;
  const res=await window.cm.captureScreen();
  if(!res)return;
  snipImgData=res.dataURL;snipB=res.bounds;
  const im=$('snipImg');
  im.src=res.dataURL;
  im.style.cssText=`left:${snipB.x}px;top:${snipB.y}px;width:${snipB.w}px;height:${snipB.h}px;inset:auto;`;
  const h=$('snipHint');
  h.style.left=(snipB.x+snipB.w/2)+'px';h.style.top=(snipB.y+16)+'px';
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
  const img=new Image();
  img.onload=()=>{
    const lx=x-snipB.x, ly=y-snipB.y;
    const scX=img.naturalWidth/snipB.w, scY=img.naturalHeight/snipB.h;
    const cv=document.createElement('canvas');cv.width=w*scX;cv.height=h*scY;
    cv.getContext('2d').drawImage(img,lx*scX,ly*scY,w*scX,h*scY,0,0,w*scX,h*scY);
    const out=cv.toDataURL('image/png');
    addPin(out,'캡처',x,y,w);
    window.cm.copyImage(out);
    toast('📋 클립보드에 복사됨 — Ctrl+V로 붙여넣기 가능');
    endSnip();
  };
  img.src=snipImgData;
});
$('snipBtn').addEventListener('click',startSnip);

/* ===== 포인터: 링 / 스포트라이트 — v0.4: 모양은 별도 선택, 버튼 혼동 제거 ===== */
const halo=$('halo'),spotEl=$('spot'),spotHole=$('spotHole');
const PS={ring:false,spot:0,size:160};
let spotShape=1; // 1 원 / 2 사각 (스포트라이트 켜기 전 미리 선택)
let hx=innerWidth/2,hy=innerHeight/2,ptrRAF=0;
function syncPtr(){
  $('mRing').classList.toggle('on',PS.ring);
  $('mSpot').classList.toggle('on',PS.spot>0);
  $('shC').classList.toggle('on',spotShape===1);
  $('shR').classList.toggle('on',spotShape===2);
  halo.classList.toggle('on',PS.ring);
  spotEl.classList.toggle('on',PS.spot>0);
  spotHole.className=PS.spot===2?'rect':'circle';
  const st=[];
  if(PS.ring)st.push('링');
  if(PS.spot>0)st.push('스포트라이트('+(PS.spot===2?'사각':'원')+')');
  if(lensOn)st.push('돋보기');
  $('pStat').innerHTML='현재: <b>'+(st.length?st.join(' + '):'꺼짐')+'</b>';
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
  if(!ptrRAF)ptrRAF=requestAnimationFrame(()=>{ptrRAF=0;renderPtr();if(lensOn)renderLens();});
}
document.addEventListener('pointerdown',e=>{
  if(!PS.ring)return;
  const r=document.createElement('div');r.className='ripple';
  r.style.cssText=`left:${e.clientX}px;top:${e.clientY}px;transform:translate(-50%,-50%);`;
  document.body.appendChild(r);setTimeout(()=>r.remove(),520);
});
$('mRing').addEventListener('click',()=>{PS.ring=!PS.ring;syncPtr();});
$('mSpot').addEventListener('click',()=>{PS.spot=PS.spot>0?0:spotShape;syncPtr();});
$('shC').addEventListener('click',()=>{spotShape=1;if(PS.spot>0)PS.spot=1;syncPtr();});
$('shR').addEventListener('click',()=>{spotShape=2;if(PS.spot>0)PS.spot=2;syncPtr();});
$('pSize').addEventListener('input',e=>{PS.size=+e.target.value;renderPtr();});

/* ===== 휠: 주석 모드 → 펜 굵기 / 렌즈 → 배율 / 스팟 → 크기 ===== */
let penHudT;
function showPenHud(){
  const hud=$('penHud');const w=PW[penType];
  hud.querySelector('.dot').style.cssText=`width:${Math.min(40,w)}px;height:${Math.min(40,w)}px;color:${penType==='eraser'?'#fff':penColor}`;
  hud.querySelector('.ptxt').textContent=({pen:'펜',hl:'형광펜',eraser:'지우개',rect:'박스'})[penType]+' 굵기 '+w;
  hud.style.left=(hx+24)+'px';hud.style.top=(hy+24)+'px';
  hud.classList.add('on');
  clearTimeout(penHudT);penHudT=setTimeout(()=>hud.classList.remove('on'),900);
}
document.addEventListener('wheel',e=>{
  if(drawMode&&penType==='text'){
    e.preventDefault();
    txSize=Math.min(96,Math.max(12,txSize+(e.deltaY<0?3:-3)));
    if(txEditor)txEditor.style.fontSize=txSize+'px';
    showTextHud();
  }
  else if(drawMode){
    e.preventDefault();
    const d=e.deltaY<0?2:-2;
    const lim={pen:[2,30],hl:[8,60],eraser:[10,80],rect:[2,16]}[penType];
    PW[penType]=Math.min(lim[1],Math.max(lim[0],PW[penType]+d));
    showPenHud();
  }
  else if(lensOn&&e.ctrlKey){ // Ctrl+휠: 렌즈 원 자체 크기
    e.preventDefault();
    lensSize=Math.min(680,Math.max(140,lensSize+(e.deltaY<0?24:-24)));
    renderLens();
  }
  else if(lensOn){e.preventDefault();lz=Math.min(6,Math.max(1.3,lz+(e.deltaY<0?0.3:-0.3)));renderLens();}
  else if(PS.spot>0){e.preventDefault();PS.size=Math.min(600,Math.max(80,PS.size+(e.deltaY<0?20:-20)));$('pSize').value=PS.size;renderPtr();}
},{passive:false});

/* ===== 부분 렌즈 ===== */
let lensOn=false,lensShape=0,lz=2,lensImgW=0,lensB=null,lensSize=280;
const lens2=$('lens2'),lensImg=$('lensImg'),lensTip=$('lensTip');
async function setLens(shape){
  if(shape>0&&lensShape===0){
    const res=await window.cm.captureScreen();
    if(!res)return;
    lensB=res.bounds;lensImg.src=res.dataURL;
    await new Promise(r=>{lensImg.onload=r;});
    lensImgW=lensImg.naturalWidth;
    lz=2;
  }
  lensShape=shape;lensOn=shape>0;
  lens2.className=(shape===2?'rect':'circle')+(lensOn?' on':'');
  if(lensOn){const d=dispAt(hx,hy);lensTip.style.left=(d.x+d.w/2)+'px';lensTip.style.top=(d.y+16)+'px';}
  lensTip.classList.toggle('on',lensOn);
  $('mLens').classList.toggle('on',lensOn);
  syncPtr();
  if(lensOn)renderLens();
}
function cycleLens(){setLens((lensShape+1)%3);}
function renderLens(){
  if(!lensOn||!lensB)return;
  const S=lensSize;
  const H2=lensShape===2?S*0.62:S;
  lens2.style.left=(hx-S/2)+'px';lens2.style.top=(hy-H2/2)+'px';
  lens2.style.width=S+'px';lens2.style.height=H2+'px';
  const imgScale=lensB.w/lensImgW;
  const sc=imgScale*lz;
  const tx=S/2-(hx-lensB.x)*lz;
  const ty=H2/2-(hy-lensB.y)*lz;
  lensImg.style.transform=`translate(${tx}px,${ty}px) scale(${sc})`;
}
$('mLens').addEventListener('click',cycleLens);

/* ===== 주석 — v0.4: 스트로크 레이어 방식 (형광펜 끊김/얼룩 제거) + 휠 굵기 ===== */
const dc=$('dc'),ctx=dc.getContext('2d');
const dctmp=$('dctmp'),tctx=dctmp.getContext('2d');
let drawMode=false,drawing=false,penColor='#ff3b3b',penType='pen',undoStack=[];
const PW={pen:5,hl:16,eraser:26,rect:4}; // 도구별 굵기 (휠로 조절)
let rectStart=null,rectMode=false;
let stroke=[]; // 현재 스트로크 점들
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
  }else{commitText();$('dtbPill').classList.remove('on');}
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
function setTool(t){
  if(penType==='text'&&t!=='text')commitText();
  penType=t;
  ['penBtn','hlBtn','erBtn','txBtn','rectBtn'].forEach(id=>$(id).classList.remove('on'));
  $({pen:'penBtn',hl:'hlBtn',eraser:'erBtn',text:'txBtn',rect:'rectBtn'}[t]).classList.add('on');
}
$('penBtn').addEventListener('click',()=>setTool('pen'));
$('hlBtn').addEventListener('click',()=>setTool('hl'));
$('erBtn').addEventListener('click',()=>setTool('eraser'));
$('txBtn').addEventListener('click',()=>setTool('text'));
$('rectBtn').addEventListener('click',()=>setTool('rect'));

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
function openTextEditor(x,y){
  const ed=document.createElement('div');
  ed.className='cvtext iv';ed.contentEditable='true';
  ed.style.left=x+'px';ed.style.top=y+'px';
  ed.style.color=penColor;ed.style.fontSize=txSize+'px';
  ed.dataset.x=x;ed.dataset.y=y;
  document.body.appendChild(ed);txEditor=ed;
  setTimeout(()=>ed.focus(),0);
  ed.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitText();}
    else if(e.key==='Escape'){txEditor=null;ed.remove();}
  });
}
function commitText(){
  if(!txEditor)return;
  const ed=txEditor;txEditor=null;
  const txt=ed.innerText.replace(/\n+$/,'');
  const x=+ed.dataset.x,y=+ed.dataset.y;
  const col=ed.style.color,fs=parseFloat(ed.style.fontSize);
  ed.remove();
  if(!txt.trim())return;
  saveSt();
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.fillStyle=col;ctx.font='bold '+fs+'px "Malgun Gothic"';ctx.textBaseline='top';ctx.textAlign='left';
  txt.split('\n').forEach((ln,i)=>ctx.fillText(ln,x+4,y+4+i*fs*1.28));
}
function saveSt(){if(undoStack.length>=20)undoStack.shift();undoStack.push(ctx.getImageData(0,0,dc.width,dc.height));}
function undo(){if(undoStack.length)ctx.putImageData(undoStack.pop(),0,0);}
$('undoBtn').addEventListener('click',undo);
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z')undo();
  if(drawMode&&(e.key==='F5'||e.key==='r'||e.key==='R')){e.preventDefault();setTool('rect');}
  if(e.key==='Escape'){
    if($('noiseGuide').classList.contains('on'))$('noiseGuide').classList.remove('on');
    else if(drawWrap.classList.contains('on'))drawWrap.classList.remove('on');
    else if(shadeWrap.classList.contains('on'))shadeWrap.classList.remove('on');
    else if(gameWrap.classList.contains('on'))closeGame();
    else if($('camWrap').classList.contains('on'))closeCam();
    else if(snipOn)endSnip();else if(lensOn)setLens(0);else allOff();
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
  if(penType==='text'){commitText();openTextEditor(e.clientX,e.clientY);return;}
  saveSt();drawing=true;dc.setPointerCapture(e.pointerId);
  stroke=[{x:e.clientX,y:e.clientY}];
  // Ctrl 누르고 그리면 (펜/형광 중에도) 임시로 박스
  rectMode=(penType==='rect')||((penType==='pen'||penType==='hl')&&e.ctrlKey);
  if(rectMode){rectStart={x:e.clientX,y:e.clientY};return;}
  if(penType==='eraser'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='#000';ctx.fillStyle='#000';
    pathStroke(ctx,stroke,PW.eraser);
  }
});
dc.addEventListener('pointermove',e=>{
  if(!drawing)return;
  if(rectMode){
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
    dctmp.style.opacity=1;
    const x=Math.min(rectStart.x,e.clientX),y=Math.min(rectStart.y,e.clientY);
    const w=Math.abs(e.clientX-rectStart.x),h=Math.abs(e.clientY-rectStart.y);
    tctx.strokeStyle=penColor;tctx.lineWidth=PW.rect;tctx.lineJoin='round';
    tctx.strokeRect(x,y,w,h);
    return;
  }
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  for(const ev of (evs.length?evs:[e]))stroke.push({x:ev.clientX,y:ev.clientY});
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
  if(rectMode){
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    ctx.drawImage(dctmp,0,0);
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
    stroke=[];rectMode=false;return;
  }
  if(penType!=='eraser'&&stroke.length){
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

/* ===== 소음 측정 — v0.4: 폭탄 게이지 (지속 소음 → 충전 → 폭발) ===== */
let nStream=null,nCtx=null,nAn=null,nRAF=0,gauge=0,nLastBeep=0,boomCool=0;
const nBomb=$('nBomb'),bombRing=$('bombRing');
$('nTh').addEventListener('input',e=>$('nThV').textContent=e.target.value);
makeDrag(nBomb,(e,s)=>{
  if(!s){const r=nBomb.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  nBomb.style.left=(e.clientX-s.dx)+'px';nBomb.style.top=(e.clientY-s.dy)+'px';
});
function renderBomb(){
  const p=Math.round(gauge);
  const col=p<55?'#34c759':p<85?'#ffb020':'#e05544';
  bombRing.style.background=`conic-gradient(${col} ${p}%, #2c3744 ${p}%)`;
  $('bombPct').textContent=p+'%';
  $('bombPct').style.color=col;
  nBomb.classList.toggle('shake',p>=80);
  $('noiseAlert').classList.toggle('on',p>=70);
}
function explode(){
  const d=dockDisp();
  $('boomFlash').classList.remove('on');void $('boomFlash').offsetWidth;
  $('boomFlash').classList.add('on');
  const be=$('boomEmoji');
  be.style.left=(d.x+d.w/2)+'px';be.style.top=(d.y+d.h/2)+'px';
  be.classList.remove('on');void be.offsetWidth;be.classList.add('on');
  beep(3);
  toast('💥 펑! 너무 시끄러웠어요 — 조용히 하면 다시 시작 🤫');
  gauge=0;boomCool=Date.now()+2500; // 폭발 직후 2.5초 충전 유예
  setTimeout(()=>{$('boomFlash').classList.remove('on');be.classList.remove('on');},1500);
}
function showNoiseGuide(){
  const g=$('noiseGuide');g.classList.add('on');centerOnDockDisplay(g);
}
$('ngStart').addEventListener('click',()=>{
  localStorage.setItem('noise_guide_seen','1');
  $('noiseGuide').classList.remove('on');startNoise();
});
$('ngClose').addEventListener('click',()=>$('noiseGuide').classList.remove('on'));
$('nHelp').addEventListener('click',showNoiseGuide);
$('nStart').addEventListener('click',()=>{
  if(!localStorage.getItem('noise_guide_seen')){showNoiseGuide();return;}
  startNoise();
});
async function startNoise(){
  if(nStream)return;
  try{
    nStream=await navigator.mediaDevices.getUserMedia({audio:true});
    nCtx=new AudioContext();
    const srcN=nCtx.createMediaStreamSource(nStream);
    nAn=nCtx.createAnalyser();nAn.fftSize=512;srcN.connect(nAn);
    const buf=new Uint8Array(nAn.fftSize);
    gauge=0;
    // 폭탄 위젯을 독 모니터 우상단에
    nBomb.classList.add('on');
    const d=dockDisp();
    nBomb.style.left=(d.x+d.w-nBomb.offsetWidth-26)+'px';
    nBomb.style.top=(d.y+120)+'px';
    renderBomb();
    const loop=()=>{
      if(!nAn)return;
      nAn.getByteTimeDomainData(buf);
      let sum=0;for(let i=0;i<buf.length;i++){const v=(buf[i]-128)/128;sum+=v*v;}
      const rms=Math.sqrt(sum/buf.length);
      const lvl=Math.min(100,Math.round(rms*300));
      $('nFill').style.width=lvl+'%';
      const th=+$('nTh').value;
      $('nVal').textContent='현재 '+lvl+' / 기준 '+th;
      // 게이지: 기준 초과 지속 → 차오름 (약 3~4초 지속 시 만충), 조용 → 감소
      if(Date.now()>boomCool){
        if(lvl>th)gauge=Math.min(100,gauge+0.55);
        else gauge=Math.max(0,gauge-0.4);
      }
      renderBomb();
      if(gauge>=100)explode();
      if(gauge>=70&&Date.now()-nLastBeep>3000){beep();nLastBeep=Date.now();}
      nRAF=requestAnimationFrame(loop);
    };
    loop();
  }catch(e){$('nVal').textContent='마이크 권한이 거부되었습니다';}
}
$('nStop').addEventListener('click',()=>{
  cancelAnimationFrame(nRAF);
  if(nStream){nStream.getTracks().forEach(t=>t.stop());nStream=null;}
  if(nCtx){nCtx.close();nCtx=null;}nAn=null;gauge=0;
  $('nFill').style.width='0%';$('nVal').textContent='대기 중';
  $('noiseAlert').classList.remove('on');
  nBomb.classList.remove('on','shake');
});

/* ===== 전체 끄기 & 전역 단축키 ===== */
function allOff(){commitText();PS.ring=false;PS.spot=0;syncPtr();toggleDraw(false);if(lensOn)setLens(0);if(snipOn)endSnip();$('nStop').click();closeGame();closeCam();}
window.cm.onHotkey(ch=>{
  switch(ch){
    case 'hk-ring': PS.ring=!PS.ring;syncPtr();break;
    case 'hk-spot': PS.spot=PS.spot>0?0:spotShape;syncPtr();break; // v0.4: 켜기/끄기 (모양은 패널에서)
    case 'hk-lens': cycleLens();break;
    case 'hk-draw': toggleDraw();break;
    case 'hk-snip': startSnip();break;
    case 'hk-dock': dock.classList.contains('hide')?expandDock():collapseDock();break;
    case 'hk-escape': allOff();break;
  }
});
syncPtr();
