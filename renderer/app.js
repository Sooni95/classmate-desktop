/* ClassMate Desktop renderer — 버전은 package.json(version) 단일 출처로 관리.
   독 버전칩/필 표시는 main.js의 app.getVersion()을 그대로 읽음. */
const $ = id => document.getElementById(id);

/* ===== 공통 헬퍼 ===== */
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
  delete panels[id].dataset.moved; // 새로 열 때는 자동배치로 복귀
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
  Object.values(panels).forEach(p=>{
    if(p.dataset.moved)return; // 사용자가 직접 옮긴 패널은 자동배치 건너뜀
    p.style.transform='translateX(-50%)';
    p.style.left=cx+'px';
    const ph=p.offsetHeight||340;
    const spaceAbove=r.top-d.y;
    if(spaceAbove < ph+24){ // 위 공간이 부족하면(=독이 화면 위쪽) 패널을 독 아래로
      p.style.top=(r.bottom+12)+'px'; p.style.bottom='auto';
    } else {               // 평소엔 독 위로
      p.style.bottom=(innerHeight-r.top+12)+'px'; p.style.top='auto';
    }
  });
}
// 패널 헤더(.ph)를 잡아 자유 이동
Object.values(panels).forEach(p=>{
  const head=p.querySelector('.ph'); if(!head)return;
  head.style.cursor='grab';
  makeDrag(head,(e,s)=>{
    if(!s){const r=p.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    p.dataset.moved='1';
    p.style.transform='none';p.style.bottom='auto';
    p.style.left=(e.clientX-s.dx)+'px';p.style.top=(e.clientY-s.dy)+'px';
  });
});
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
},e=>e.target.closest('#eggLogo')); // 로고 클릭 시 드래그 안 함 (이스터에그용)
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
    const info=await ipc.getAppInfo();
    const ver='v'+info.version;
    $('dockVer').textContent=ver;
    $('dockVer').title='ClassMate '+ver+(info.buildDate&&info.buildDate!=='개발 빌드'?(' (빌드: '+info.buildDate+')'):'');
    $('pillVer').textContent=ver;
    checkForUpdate(info.buildDate);
  }catch(e){}
})();
// 업데이트 확인 — GitHub 'latest' 릴리스 게시일이 내 빌드일보다 나중이면 조용히 안내
async function checkForUpdate(buildDate){
  try{
    if(!buildDate||!/^\d{4}\.\d{2}\.\d{2}$/.test(buildDate))return; // 개발 빌드 등은 건너뜀
    const r=await ipc.checkUpdate();
    if(!r||!r.ok||!r.publishedAt)return;
    const bn=+buildDate.replace(/\./g,'');                 // 20260619
    const p=new Date(r.publishedAt);
    const pn=p.getFullYear()*10000+(p.getMonth()+1)*100+p.getDate();
    if(pn<=bn)return;                                       // 최신이거나 같음
    // 버전칩에 점 표시 + 클릭 시 릴리스 페이지
    const chip=$('dockVer');
    if(chip){chip.textContent='⬆ 업데이트';chip.style.cursor='pointer';
      chip.title='새 버전이 있어요 — 클릭하면 다운로드 페이지가 열립니다';
      chip.addEventListener('click',()=>ipc.openExternal(r.url));}
    setTimeout(()=>toast('⬆ 새 버전이 나왔어요 — 버전 칩을 누르면 받을 수 있어요'),1500);
  }catch(e){}
}
// 🦋 이스터에그 1: 로고 7번 연타 → 크레딧 모달 (조용히)
(()=>{
  let cnt=0,last=0;
  const lo=$('eggLogo');
  if(!lo)return;
  lo.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    const now=Date.now();
    cnt=(now-last<450)?cnt+1:1;last=now; // 빠르게 연타할 때만 (천천히 누르면 리셋)
    if(cnt>=7){
      cnt=0;
      const eg=$('eggCredit');
      eg.classList.add('on');
      centerOnDockDisplay(eg.querySelector('.egg-card')); // 독 모니터 중앙
      setTimeout(()=>eg.classList.remove('on'),4500);
    }
  });
  $('eggCredit').addEventListener('click',()=>$('eggCredit').classList.remove('on'));
})();
// 🦋 이스터에그 2: 콘솔 크레딧 (F12로 발견)
try{
  console.log('%c🦋 ClassMate','color:#F68C1F;font-size:26px;font-weight:800;');
  console.log('%c네패스 코코아팹 — 교사를 위한 올인원 수업 보조 도구','color:#9fb0bf;font-size:12px;');
  console.log('%c기획·개발  김수훈 · 김수관','color:#F68C1F;font-size:13px;font-weight:700;');
  console.log('%c   ∧,,,∧\n  (  ̳• · • ̳)\n  /    づ♥  함께 만들어요','color:#D9760F;font-size:12px;');
}catch(e){}
// 모니터 연결/해제 시: 독이 화면 밖에 있으면 주 모니터로 복귀
ipc.onBoundsChanged(async()=>{
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
$('quitBtn').addEventListener('click',()=>ipc.hideToTray());
let toastT;
function toast(msg){
  const t=$('toast');const d=dockDisp();
  t.style.left=(d.x+d.w/2)+'px';
  t.style.bottom=(innerHeight-(d.y+d.h)+96)+'px';
  t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1800);
}

/* ===== 입력 모달 (Electron prompt 대체) ===== */
let _askCb=null;
function askInput(label,initial,cb){
  $('imLabel').textContent=label;
  $('imInput').value=initial||'';
  _askCb=cb;
  $('inputModal').classList.add('on');
  centerOnDockDisplay($('inputModal').querySelector('.im-card')); // 멀티모니터 중간 걸침 방지
  setTimeout(()=>{$('imInput').focus();$('imInput').select();},50);
}
$('imOk').addEventListener('click',()=>{
  const v=$('imInput').value.trim();
  $('inputModal').classList.remove('on');
  if(_askCb)_askCb(v);_askCb=null;
});
$('imCancel').addEventListener('click',()=>{$('inputModal').classList.remove('on');_askCb=null;});
$('imInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();$('imOk').click();}
  else if(e.key==='Escape'){e.preventDefault();$('imCancel').click();}
});

/* ===== 사다리타기 — 재작성: 입력칸 편집 + 줄별 추적, 전용 애니메이션 프레임 ===== */
/* 🪜 사다리타기: renderer/ladder.js 로 분리됨 (app.js 이후 로드, window.openLadder 진입) */

/* ===== 휠: 주석 모드 → 펜 굵기 / 렌즈 → 배율 / 스팟 → 크기 ===== */
let penHudT;
function showPenHud(){
  const hud=$('penHud');const w=PW[penType];
  hud.querySelector('.dot').style.cssText=`width:${Math.min(40,w)}px;height:${Math.min(40,w)}px;color:${penType==='eraser'?'#fff':penColor}`;
  hud.querySelector('.ptxt').textContent=({pen:'펜',hl:'형광펜',eraser:'지우개',rect:'박스',circle:'원'})[penType]+' 굵기 '+w;
  hud.style.left=(hx+24)+'px';hud.style.top=(hy+24)+'px';
  hud.classList.add('on');
  clearTimeout(penHudT);penHudT=setTimeout(()=>hud.classList.remove('on'),900);
}
function showStampHud(){
  const hud=$('penHud');
  hud.querySelector('.dot').style.cssText='width:0;height:0';
  hud.querySelector('.ptxt').textContent=penStamp+' 스탬프 크기 '+stampSize+' (휠로 조절)';
  hud.style.left=(hx+24)+'px';hud.style.top=(hy+24)+'px';
  hud.classList.add('on');
  clearTimeout(penHudT);penHudT=setTimeout(()=>hud.classList.remove('on'),900);
}
document.addEventListener('wheel',e=>{
  if(drawMode&&penType==='stamp'){
    e.preventDefault();
    stampSize=Math.min(160,Math.max(20,stampSize+(e.deltaY<0?6:-6)));
    showStampHud();
  }
  else if(drawMode&&penType==='text'){
    e.preventDefault();
    txSize=Math.min(96,Math.max(12,txSize+(e.deltaY<0?3:-3)));
    if(txEditor)txEditor.style.fontSize=txSize+'px';
    showTextHud();
  }
  else if(drawMode){
    e.preventDefault();
    const d=e.deltaY<0?2:-2;
    const lim={pen:[2,30],hl:[8,60],eraser:[10,80],rect:[2,16],circle:[2,16]}[penType];
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

/* ===== 전체 끄기 & 전역 단축키 ===== */
function allOff(){
  commitText();
  PS.ring=false;PS.spot=0;
  if(lensOn)setLens(0);
  syncPtr();
  toggleDraw(false);
  if(snipOn)endSnip();
  $('nStop').click();closeGame();closeCam();
  if(drawWrap)drawWrap.classList.remove('on');
  if(shadeWrap)shadeWrap.classList.remove('on');
  if($('boardWrap')){$('boardWrap').classList.remove('on');}
  setIgnore(true); // 클릭 통과 복구
}
ipc.onHotkey(ch=>{
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

