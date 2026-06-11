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
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1800);}

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
function rT(){
  const cls=(tLeft===0?' done':(tLeft<=10?' warn':''));
  tDisp.textContent=fmtT(tLeft);tDisp.className='tdisp'+cls;
  const tf=$('tfTime');tf.textContent=fmtT(tLeft);tf.className='tf'+cls;
}
function stopT(){clearInterval(tInt);tInt=null;tRun=false;$('tStart').textContent='시작';}
function beep(n){try{const ac=new AudioContext();const ds=n===3?[0,.2,.4]:[0,.2,.4];ds.forEach(d=>{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=880;o.start(ac.currentTime+d);g.gain.setValueAtTime(.15,ac.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d+.18);o.stop(ac.currentTime+d+.2);});}catch(e){}}
document.querySelectorAll('.presets button').forEach(b=>b.addEventListener('click',()=>{tTotal=tLeft=+b.dataset.m*60;stopT();rT();}));
$('setC').addEventListener('click',()=>{tTotal=tLeft=(parseInt($('cMin').value)||0)*60+(parseInt($('cSec').value)||0);stopT();rT();});
$('tStart').addEventListener('click',function(){
  if(tRun){stopT();return;}
  if(tLeft<=0)tLeft=tTotal;
  tRun=true;this.textContent='일시정지';
  const tf=$('tFloat');
  if(!tf.classList.contains('on')){ // 처음 띄울 때 독 모니터 우상단에
    tf.classList.add('on');
    const d=dockDisp();
    tf.style.right='auto';
    tf.style.left=(d.x+d.w-tf.offsetWidth-30)+'px';tf.style.top=(d.y+26)+'px';
  }
  tInt=setInterval(()=>{tLeft--;rT();if(tLeft<=0){stopT();beep();}},1000);
});
$('tReset').addEventListener('click',()=>{stopT();tLeft=tTotal;rT();});
rT();
$('tfClose').addEventListener('click',e=>{e.stopPropagation();$('tFloat').classList.remove('on');});
$('tfPause').addEventListener('click',e=>{e.stopPropagation();$('tStart').click();$('tfPause').textContent=tRun?'⏸':'▶';});
$('tfReset').addEventListener('click',e=>{e.stopPropagation();$('tReset').click();$('tfPause').textContent='▶';});
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
let gameMode=null,gameAnim=0;
const BRAND=['#F68C1F','#FFB45E','#D9760F','#2c3744','#ffd9ad'];
function openGame(mode){
  const src=candidates();
  if(src.length<2){toast('[이름] 탭에 명단을 2명 이상 입력하세요');return;}
  gameMode=mode;gRes.textContent='';gGo.disabled=false;
  $('gameTitle').textContent=mode==='wheel'?'🎡 돌림판':'🎢 핀볼 (Plinko)';
  gGo.textContent=mode==='wheel'?'돌리기!':'공 떨어뜨리기!';
  gameWrap.classList.add('on');
  centerOnDockDisplay(gameWrap);
  if(mode==='wheel')drawWheel(src,0);else drawPlinko(src,null,null,-1);
}
function closeGame(){cancelAnimationFrame(gameAnim);gameWrap.classList.remove('on');gameMode=null;}
$('gameClose').addEventListener('click',closeGame);
$('wheelOpen').addEventListener('click',()=>openGame('wheel'));
$('plinkoOpen').addEventListener('click',()=>openGame('plinko'));
makeDrag($('gameHead'),(e,s)=>{
  if(!s){const r=gameWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  gameWrap.style.left=(e.clientX-s.dx)+'px';gameWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='gameClose');
gGo.addEventListener('click',()=>{
  const src=candidates();
  if(src.length<1){gRes.textContent='남은 명단이 없습니다';return;}
  if(src.length===1){gRes.textContent='🎉 '+src[0]+' (마지막 1명)';recordWin(src[0]);gGo.disabled=true;return;}
  gGo.disabled=true;gRes.textContent='';
  if(gameMode==='wheel')spinWheel(src);else dropPlinko(src);
});

/* --- 돌림판 --- */
const W=540,H=430,WCX=W/2,WCY=H/2+6,WR=185;
function drawWheel(names,angle){
  gx.clearRect(0,0,W,H);
  const n=names.length,step=Math.PI*2/n;
  for(let i=0;i<n;i++){
    const a0=angle+i*step,a1=a0+step;
    gx.beginPath();gx.moveTo(WCX,WCY);gx.arc(WCX,WCY,WR,a0,a1);gx.closePath();
    gx.fillStyle=BRAND[i%BRAND.length];gx.fill();
    gx.strokeStyle='rgba(0,0,0,.25)';gx.lineWidth=1;gx.stroke();
    // 이름
    gx.save();gx.translate(WCX,WCY);gx.rotate(a0+step/2);
    gx.fillStyle=(i%BRAND.length===3)?'#fff':'#3a2200';
    gx.font='bold '+(n>20?11:n>12?13:16)+'px "Malgun Gothic"';
    gx.textAlign='right';gx.textBaseline='middle';
    const label=names[i].length>6?names[i].slice(0,6)+'…':names[i];
    gx.fillText(label,WR-12,0);gx.restore();
  }
  // 중심 + 포인터(우측)
  gx.beginPath();gx.arc(WCX,WCY,26,0,7);gx.fillStyle='#161c24';gx.fill();
  gx.strokeStyle='#F68C1F';gx.lineWidth=4;gx.stroke();
  gx.fillStyle='#F68C1F';gx.font='16px serif';gx.textAlign='center';gx.textBaseline='middle';
  gx.fillText('🦋',WCX,WCY+1);
  gx.beginPath();gx.moveTo(WCX+WR+18,WCY);gx.lineTo(WCX+WR-8,WCY-12);gx.lineTo(WCX+WR-8,WCY+12);gx.closePath();
  gx.fillStyle='#fff';gx.fill();
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
      // 포인터(각도 0, 우측)가 가리키는 조각
      const norm=((-a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      const idx=Math.floor(norm/step)%n;
      const wnr=names[idx];
      gRes.textContent='🎉 '+wnr+'!';beep();recordWin(wnr);gGo.disabled=false;
    }
  };
  gameAnim=requestAnimationFrame(tick);
}

/* --- 핀볼 (Plinko) ---
   당첨자는 균등 추첨으로 먼저 정하고, 공의 좌우 경로가 그 칸에 도착하도록 구성.
   (실제 Plinko는 가운데 칸 확률이 높아 불공정 → 공정성 유지용 설계) */
let PK=null;
function plinkoLayout(src){
  const K=Math.min(src.length,7);
  const winner=src[Math.random()*src.length|0];
  let slots=[winner,...src.filter(x=>x!==winner).sort(()=>Math.random()-.5).slice(0,K-1)];
  slots=slots.sort(()=>Math.random()-.5);
  const target=slots.indexOf(winner);
  const rows=8,slotW=W/K;
  return {K,winner,slots,target,rows,slotW,top:64,bottom:H-46};
}
function drawPlinko(src,layout,ball,litSlot){
  const L=layout||plinkoLayout(src);
  gx.clearRect(0,0,W,H);
  // 핀
  gx.fillStyle='#5b6878';
  const rowH=(L.bottom-L.top)/L.rows;
  for(let r=0;r<L.rows;r++){
    const cnt=6+(r%2),off=(r%2)?L.slotW*0.5:0;
    for(let c=0;c<=cnt;c++){
      const x=(W/(cnt+1))*(c+0.5)+((r%2)?14:-14);
      const y=L.top+r*rowH;
      gx.beginPath();gx.arc(x,y,4,0,7);gx.fill();
    }
  }
  // 슬롯
  for(let i=0;i<L.K;i++){
    const x=i*L.slotW;
    gx.fillStyle=i===litSlot?'#F68C1F':'#212a36';
    gx.beginPath();gx.roundRect(x+3,L.bottom,L.slotW-6,34,8);gx.fill();
    gx.fillStyle=i===litSlot?'#fff':'#9fb0bf';
    gx.font='bold '+(L.K>5?11:13)+'px "Malgun Gothic"';
    gx.textAlign='center';gx.textBaseline='middle';
    const label=L.slots[i].length>5?L.slots[i].slice(0,5)+'…':L.slots[i];
    gx.fillText(label,x+L.slotW/2,L.bottom+17);
    gx.strokeStyle='rgba(255,255,255,.12)';
    gx.beginPath();gx.moveTo(x,L.top-20);gx.lineTo(x,L.bottom);gx.stroke();
  }
  // 공
  if(ball){
    gx.beginPath();gx.arc(ball.x,ball.y,9,0,7);
    const grad=gx.createRadialGradient(ball.x-3,ball.y-3,1,ball.x,ball.y,9);
    grad.addColorStop(0,'#FFD9AD');grad.addColorStop(1,'#F68C1F');
    gx.fillStyle=grad;gx.fill();
    gx.strokeStyle='rgba(0,0,0,.3)';gx.stroke();
  }
  return L;
}
function dropPlinko(src){
  const L=plinkoLayout(src);PK=L;
  // 좌우 이동 경로: target 칸 중앙에 도착하도록 스텝 구성
  const startX=W/2, endX=L.target*L.slotW+L.slotW/2;
  const steps=L.rows;
  const xs=[startX];
  for(let i=1;i<=steps;i++){
    const t=i/steps;
    // 목표 지점으로 수렴하되 매 행 랜덤 흔들림 (실제 튕김 느낌)
    const base=startX+(endX-startX)*t;
    const wig=(Math.random()-.5)*L.slotW*(1-t)*1.6;
    xs.push(Math.min(W-14,Math.max(14,base+wig)));
  }
  xs[steps]=endX;
  const rowH=(L.bottom-L.top)/L.rows;
  const start=performance.now(),per=300,total=per*steps+500;
  const tick=now=>{
    const el=now-start;
    let ball;
    if(el<per*steps){
      const i=Math.floor(el/per),t=(el%per)/per;
      const y0=i===0?20:L.top+(i-1)*rowH, y1=L.top+i*rowH;
      // 행 사이 낙하: 가속 + 핀에 닿을 때 살짝 바운스
      const yy=y0+(y1-y0)*(t*t);
      const xx=xs[i]+(xs[i+1]-xs[i])*t;
      const bounce=Math.sin(t*Math.PI)* -4;
      ball={x:xx,y:yy+bounce};
      drawPlinko(src,L,ball,-1);
      gameAnim=requestAnimationFrame(tick);
    }else if(el<total){
      const t=(el-per*steps)/500;
      ball={x:endX,y:L.top+(L.rows-1)*rowH+(L.bottom+10-(L.top+(L.rows-1)*rowH))*Math.min(1,t*1.3)};
      drawPlinko(src,L,ball,t>0.5?L.target:-1);
      gameAnim=requestAnimationFrame(tick);
    }else{
      drawPlinko(src,L,{x:endX,y:L.bottom+8},L.target);
      gRes.textContent='🎉 '+L.winner+'!';beep();recordWin(L.winner);gGo.disabled=false;
    }
  };
  gameAnim=requestAnimationFrame(tick);
}

/* ===== QR ===== */
let qrT;
$('qrUrl').addEventListener('input',e=>{clearTimeout(qrT);qrT=setTimeout(()=>genQR(e.target.value.trim()),450);});
function genQR(url){
  const box=$('qrbox');
  if(!url){box.className='empty';box.textContent='URL 입력 시 자동 생성 (오프라인 작동)';return;}
  box.className='';box.innerHTML='';
  try{new QRCode(box,{text:url,width:132,height:132,colorDark:'#1c1d1f',colorLight:'#ffffff'});}catch(e){}
}

/* ===== 단축주소 (코코아팹.kr) — 온라인 기능 ===== */
const SU_BASE='코코아팹.kr';
let suTtl=604800;
$('suTtl').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  $('suTtl').querySelectorAll('button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');suTtl=+b.dataset.s;
}));
// 연동 토큰 (BYO Key와 동일하게 로컬 저장)
$('suToken').value=localStorage.getItem('su_token')||'';
$('suGear').addEventListener('click',()=>$('suTokenRow').classList.toggle('on'));
$('suTokenSave').addEventListener('click',()=>{
  localStorage.setItem('su_token',$('suToken').value.trim());
  $('suTokenRow').classList.remove('on');toast('🔑 연동 토큰 저장됨');
});
function suSay(msg,good){const m=$('suMsg');m.textContent=msg;m.style.color=good?'#34c759':'var(--amber)';}
$('suGo').addEventListener('click',async()=>{
  let target=$('suTarget').value.trim();
  const slug=$('suSlug').value.trim();
  const token=localStorage.getItem('su_token')||'';
  if(!target){suSay('원본 URL을 입력하세요');return;}
  if(!/^https?:\/\//i.test(target))target='https://'+target;
  if(!slug){suSay('단축 이름을 입력하세요 (예: 수업자료)');return;}
  if(/[\/\s?#]/.test(slug)||slug.toLowerCase()==='api'){suSay('단축 이름에 공백, /, ?, # 은 쓸 수 없어요');return;}
  if(!token){suSay('⚙ 연동 설정에서 토큰을 먼저 저장하세요');$('suTokenRow').classList.add('on');return;}
  $('suGo').disabled=true;$('suGo').textContent='만드는 중…';suSay('');
  const res=await window.cm.shorten({slug,target,ttl:suTtl,token});
  $('suGo').disabled=false;$('suGo').textContent='단축주소 만들기';
  if(res.ok){
    const short=SU_BASE+'/'+slug;
    const exp=new Date(Date.now()+suTtl*1000);
    $('suUrl').textContent=short;
    $('suExp').textContent='만료: '+exp.getFullYear()+'.'+String(exp.getMonth()+1).padStart(2,'0')+'.'+String(exp.getDate()).padStart(2,'0')+' (이후 자동 삭제)';
    $('suCard').classList.add('on');$('suQr').classList.remove('on');$('suQr').innerHTML='';
    suSay('완성! 복사하거나 QR로 띄워보세요 🎉',true);
  }else if(res.status===409){suSay('"'+slug+'" 는 이미 사용 중이에요 — 다른 이름을 써보세요');}
  else if(res.status===403){suSay('토큰이 올바르지 않아요 — ⚙ 연동 설정 확인');$('suTokenRow').classList.add('on');}
  else if(res.status===0){suSay('인터넷 연결을 확인하세요 (단축주소는 온라인 기능)');}
  else{suSay('오류: '+(res.message||res.status));}
});
$('suCopy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText('https://'+$('suUrl').textContent);toast('📋 단축주소 복사됨');}catch(e){}
});
$('suQrBtn').addEventListener('click',()=>{
  const box=$('suQr');
  if(box.classList.contains('on')){box.classList.remove('on');return;}
  box.innerHTML='';box.classList.add('on');
  // QR에는 퓨니코드 형태로 (구형 스캐너 호환), 화면 표시는 한글
  const puny=new URL('https://'+$('suUrl').textContent).href;
  try{new QRCode(box,{text:puny,width:132,height:132,colorDark:'#1c1d1f',colorLight:'#ffffff'});}catch(e){}
});

/* ===== 메모 — v0.4: 부분 글자 크기 (선택한 단어만) ===== */
const MCOLS=['#FFF3A3','#FFB3C6','#B3F0D4','#C7D2FF'];let mCnt=0;
function applyFontSize(ed,dir){
  const sel=getSelection();
  const hasSel=sel.rangeCount&&!sel.isCollapsed&&ed.contains(sel.anchorNode);
  if(hasSel){
    // 선택 부분만: 현재 크기 기준 ±4px
    const node=sel.anchorNode.nodeType===3?sel.anchorNode.parentElement:sel.anchorNode;
    const cur=parseFloat(getComputedStyle(node).fontSize)||14;
    const next=Math.min(56,Math.max(10,cur+dir*4));
    document.execCommand('styleWithCSS',false,true);
    document.execCommand('fontSize',false,'7');
    ed.querySelectorAll('font[size="7"],span[style*="xxx-large"]').forEach(n=>{
      const sp=document.createElement('span');sp.style.fontSize=next+'px';sp.innerHTML=n.innerHTML;n.replaceWith(sp);
    });
  }else{
    // 선택 없으면 전체 기본 크기
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
      <input type="range" min="35" max="100" value="100" title="투명도">
    </span>
    <span><button class="mbtn2">─</button><button class="mbtn2">×</button></span>
  </div><div class="mtext" contenteditable="true" data-ph="메모… (단어 드래그 후 A+/A-)" style="background:${c}"></div><div class="rs2"></div>`;
  document.body.appendChild(m);
  const ed=m.querySelector('.mtext');
  const [minB,xB]=m.querySelectorAll('.mbtn2');
  xB.addEventListener('click',()=>m.remove());
  minB.addEventListener('click',()=>{m.classList.toggle('min');minB.textContent=m.classList.contains('min')?'▢':'─';});
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
$('pSize').addEventListener('input',e=>{PS.size=+e.target.value;renderPtr();if(lensOn)renderLens();});

/* ===== 휠: 주석 모드 → 펜 굵기 / 렌즈 → 배율 / 스팟 → 크기 ===== */
let penHudT;
function showPenHud(){
  const hud=$('penHud');const w=PW[penType];
  hud.querySelector('.dot').style.cssText=`width:${Math.min(40,w)}px;height:${Math.min(40,w)}px;color:${penType==='eraser'?'#fff':penColor}`;
  hud.querySelector('.ptxt').textContent=({pen:'펜',hl:'형광펜',eraser:'지우개'})[penType]+' 굵기 '+w;
  hud.style.left=(hx+24)+'px';hud.style.top=(hy+24)+'px';
  hud.classList.add('on');
  clearTimeout(penHudT);penHudT=setTimeout(()=>hud.classList.remove('on'),900);
}
document.addEventListener('wheel',e=>{
  if(drawMode){
    e.preventDefault();
    const d=e.deltaY<0?2:-2;
    const lim={pen:[2,30],hl:[8,60],eraser:[10,80]}[penType];
    PW[penType]=Math.min(lim[1],Math.max(lim[0],PW[penType]+d));
    showPenHud();
  }
  else if(lensOn){e.preventDefault();lz=Math.min(6,Math.max(1.3,lz+(e.deltaY<0?0.3:-0.3)));renderLens();}
  else if(PS.spot>0){e.preventDefault();PS.size=Math.min(600,Math.max(80,PS.size+(e.deltaY<0?20:-20)));$('pSize').value=PS.size;renderPtr();}
},{passive:false});

/* ===== 부분 렌즈 ===== */
let lensOn=false,lensShape=0,lz=2,lensImgW=0,lensImgH=0,lensB=null;
const lens2=$('lens2'),lensImg=$('lensImg'),lensTip=$('lensTip');
async function setLens(shape){
  if(shape>0&&lensShape===0){
    const res=await window.cm.captureScreen();
    if(!res)return;
    lensB=res.bounds;lensImg.src=res.dataURL;
    await new Promise(r=>{lensImg.onload=r;});
    lensImgW=lensImg.naturalWidth;lensImgH=lensImg.naturalHeight;
    lz=2;
  }
  lensShape=shape;lensOn=shape>0;
  lens2.className=(shape===2?'rect':'circle')+(lensOn?' on':'');
  lensTip.classList.toggle('on',lensOn);
  $('mLens').classList.toggle('on',lensOn);
  syncPtr();
  if(lensOn)renderLens();
}
function cycleLens(){setLens((lensShape+1)%3);}
function renderLens(){
  if(!lensOn||!lensB)return;
  const S=Math.max(180,PS.size*1.4);
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
const PW={pen:5,hl:16,eraser:26}; // 도구별 굵기 (휠로 조절)
let stroke=[]; // 현재 스트로크 점들
function fitC(){dc.width=innerWidth;dc.height=innerHeight;dctmp.width=innerWidth;dctmp.height=innerHeight;}
addEventListener('resize',fitC);fitC();
function toggleDraw(force){
  drawMode=force!==undefined?force:!drawMode;
  dc.classList.toggle('on',drawMode);
  dctmp.classList.toggle('on',drawMode);
  $('dtb').classList.toggle('on',drawMode);
  $('drawBtn').classList.toggle('on',drawMode);
  // 주석 중에는 캔버스를 핀/메모 위로 → 핀 위에도 필기 가능
  const z=drawMode?56:40;
  dc.style.zIndex=z;dctmp.style.zIndex=z+1;
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
  if(e.key==='Escape'){
    if(gameWrap.classList.contains('on'))closeGame();
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
  if(!drawMode)return;saveSt();drawing=true;dc.setPointerCapture(e.pointerId);
  stroke=[{x:e.clientX,y:e.clientY}];
  if(penType==='eraser'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='#000';ctx.fillStyle='#000';
    pathStroke(ctx,stroke,PW.eraser);
  }
});
dc.addEventListener('pointermove',e=>{
  if(!drawing)return;
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
$('nStart').addEventListener('click',async()=>{
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
});
$('nStop').addEventListener('click',()=>{
  cancelAnimationFrame(nRAF);
  if(nStream){nStream.getTracks().forEach(t=>t.stop());nStream=null;}
  if(nCtx){nCtx.close();nCtx=null;}nAn=null;gauge=0;
  $('nFill').style.width='0%';$('nVal').textContent='대기 중';
  $('noiseAlert').classList.remove('on');
  nBomb.classList.remove('on','shake');
});

/* ===== 전체 끄기 & 전역 단축키 ===== */
function allOff(){PS.ring=false;PS.spot=0;syncPtr();toggleDraw(false);if(lensOn)setLens(0);if(snipOn)endSnip();$('nStop').click();closeGame();closeCam();}
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
