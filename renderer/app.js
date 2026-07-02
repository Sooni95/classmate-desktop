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

/* ===== AI 교수 보조 (Claude BYO Key) ===== */
$('aiKey').value=localStorage.getItem('ai_key')||'';
$('aiGear').addEventListener('click',()=>$('aiKeyRow').classList.toggle('on'));
$('aiKeySave').addEventListener('click',()=>{
  localStorage.setItem('ai_key',$('aiKey').value.trim());
  $('aiKeyRow').classList.remove('on');toast('🔑 API 키 저장됨');
});
document.querySelectorAll('.ai-quick button').forEach(b=>b.addEventListener('click',()=>{
  $('aiIn').value=b.dataset.q;$('aiIn').focus();
}));
// 통합 AI 호출: Pro 인증 시 회사 키(프록시), 아니면 개인 키
async function callAI({prompt,system,max_tokens}){
  if(isPro()){
    const proKey=localStorage.getItem('cm_pro_key')||'';
    if(proKey){
      const r=await ipc.aiProxy({prompt,system,proKey,max_tokens});
      if(r.ok)return r;
      // 프록시 실패 시 개인키로 폴백 (있으면)
    }
  }
  const key=localStorage.getItem('ai_key')||'';
  if(!key)return {ok:false,message:'NO_KEY'};
  return await ipc.aiChat({prompt,system,apiKey:key});
}

/* ===== 음성 실시간 자막 (Whisper 서버 방식) ===== */
const capBox=$('capBox');
let vcOn=false,vcRecorder=null,vcStream=null,vcChunks=[],vcLoop=null;
// 자막 박스 이동
makeDrag($('capBoxBar'),(e,s)=>{
  if(!s){const r=capBox.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  capBox.style.left=(e.clientX-s.dx)+'px';capBox.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='capBoxClose');
// 자막 박스 크기조절
makeDrag(capBox.querySelector('.cb-rs'),(e,s)=>{
  if(!s){const r=capBox.getBoundingClientRect();return{x:e.clientX,y:e.clientY,w:r.width,h:r.height};}
  capBox.style.width=Math.max(280,s.w+(e.clientX-s.x))+'px';
  capBox.style.height=Math.max(110,s.h+(e.clientY-s.y))+'px';
});
$('capBoxClose').addEventListener('click',()=>{stopVC();});
function vcLangsSel(){return [...$('vcLangs').querySelectorAll('input:checked')].map(c=>({v:c.value,label:c.parentElement.textContent.trim()}));}
function applyCapStyle(){
  const size=$('vcSize').value+'px';capBox.style.fontSize=size;
  const bgOn=$('vcBgOn').checked,bg=$('vcBg').value,fg=$('vcFg').value;
  const shadow=bgOn?'none':'0 2px 6px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.95)';
  $('capOrig').style.color=fg;$('capOrig').style.background=bgOn?bg:'transparent';$('capOrig').style.textShadow=shadow;
  capBox.querySelectorAll('.cap-line').forEach(el=>{el.style.color=fg;el.style.background=bgOn?bg:'transparent';el.style.textShadow=shadow;});
}
['vcSize','vcBg','vcFg','vcBgOn'].forEach(id=>$(id).addEventListener('input',applyCapStyle));
// 인식된 한국어 → 원문 표시 + 선택 언어들로 번역
async function vcProcess(koText){
  if(!koText)return;
  const koOnly=$('vcKoOnly')&&$('vcKoOnly').checked;
  capBox.classList.toggle('ko-only',!!koOnly);
  if(koOnly){ // 한국어 자막만 — 번역 생략
    $('capOrig').textContent=koText;
    $('capTransList').innerHTML='';
    applyCapStyle();
    return;
  }
  $('capOrig').textContent='🇰🇷 '+koText;
  const langs=vcLangsSel();
  const list=$('capTransList');list.innerHTML='';
  // 각 언어 줄 미리 만들기
  const rows={};
  langs.forEach(l=>{
    const d=document.createElement('div');d.className='cap-line';d.innerHTML='<span class="cap-flag">'+l.label.split(' ')[0]+'</span>…';
    list.appendChild(d);rows[l.v]=d;
  });
  applyCapStyle();
  // 병렬 번역
  await Promise.all(langs.map(async l=>{
    const sys='Translate the Korean text into '+l.v+'. Output ONLY the translation, no notes. Simple and natural.';
    const r=await callAI({prompt:koText,system:sys,max_tokens:400});
    if(rows[l.v])rows[l.v].innerHTML='<span class="cap-flag">'+l.label.split(' ')[0]+'</span>'+(r.ok?r.text:'(번역 실패)');
    applyCapStyle();
  }));
}
// 녹음 사이클: 4초씩 녹음 → Whisper → 처리 → 반복
async function vcCycle(){
  if(!vcOn)return;
  vcChunks=[];
  try{vcRecorder=new MediaRecorder(vcStream,{mimeType:'audio/webm'});}
  catch(e){try{vcRecorder=new MediaRecorder(vcStream);}catch(e2){$('vcMsg').textContent='녹음 미지원 환경';stopVC();return;}}
  vcRecorder.ondataavailable=ev=>{if(ev.data.size)vcChunks.push(ev.data);};
  vcRecorder.onstop=async()=>{
    if(!vcOn)return;
    const blob=new Blob(vcChunks,{type:'audio/webm'});
    if(blob.size>2000){ // 무음 제외
      const buf=await blob.arrayBuffer();
      const proKey=localStorage.getItem('cm_pro_key')||'';
      const r=await ipc.sttProxy({bytes:Array.from(new Uint8Array(buf)),proKey});
      if(r.ok&&r.text)vcProcess(r.text);
      else if(r.message&&r.message.includes('OPENAI'))$('vcMsg').textContent='서버에 음성인식 키 설정 필요';
    }
    if(vcOn)vcCycle(); // 다음 사이클
  };
  vcRecorder.start();
  vcLoop=setTimeout(()=>{if(vcRecorder&&vcRecorder.state!=='inactive')vcRecorder.stop();},4000);
}
async function startVC(){
  if(!isPro()){$('vcMsg').textContent='음성 자막은 Pro 기능이에요';return;}
  try{vcStream=await navigator.mediaDevices.getUserMedia({audio:true});}
  catch(e){$('vcMsg').textContent='마이크 권한이 필요해요';return;}
  vcOn=true;capBox.classList.add('on');
  if(!capBox.style.width){capBox.style.width='560px';capBox.style.height='200px';}
  if(!capBox.style.left){const d=dockDisp();capBox.style.left=(d.x+(d.w-560)/2)+'px';capBox.style.top=(d.y+d.h*0.62)+'px';}
  applyCapStyle();
  $('capOrig').textContent='🎤 듣고 있어요…';$('capTransList').innerHTML='';
  $('vcToggle').textContent='⏹ 자막 정지';$('vcToggle').classList.add('rec');$('vcMsg').textContent='';
  vcCycle();
}
function stopVC(){
  vcOn=false;
  if(vcLoop)clearTimeout(vcLoop);
  if(vcRecorder&&vcRecorder.state!=='inactive')try{vcRecorder.stop();}catch(e){}
  if(vcStream)vcStream.getTracks().forEach(t=>t.stop());
  capBox.classList.remove('on');
  $('vcToggle').textContent='🎤 자막 시작';$('vcToggle').classList.remove('rec');
}
$('vcToggle').addEventListener('click',()=>vcOn?stopVC():startVC());
$('aiGo').addEventListener('click',async()=>{
  const prompt=$('aiIn').value.trim();
  if(!prompt){$('aiMsg').textContent='질문을 입력하세요';return;}
  $('aiGo').disabled=true;$('aiGo').textContent='생각 중…';$('aiMsg').textContent='';
  const r=await callAI({prompt});
  $('aiGo').disabled=false;$('aiGo').textContent='물어보기';
  if(r.ok){
    $('aiOut').textContent=r.text;$('aiOut').classList.add('on');$('aiActions').classList.add('on');
  }else if(r.message==='NO_KEY'){$('aiMsg').textContent='⚙ Pro 인증을 하거나 API 키를 설정하세요';$('aiKeyRow').classList.add('on');}
  else if(r.status===401){$('aiMsg').textContent='API 키가 올바르지 않아요';$('aiKeyRow').classList.add('on');}
  else{$('aiMsg').textContent='오류: '+(r.message||'연결 확인');}
});
$('aiCopy').addEventListener('click',()=>{ipc.copyText($('aiOut').textContent);toast('📋 복사됨');});
$('aiSave').addEventListener('click',async()=>{
  const q=$('aiIn').value.trim();
  const a=$('aiOut').textContent;
  if(!a){toast('저장할 답변이 없어요');return;}
  const content='[질문]\n'+q+'\n\n[AI 답변]\n'+a+'\n\n— ClassMate AI 교수보조';
  const now=new Date();
  const stamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
  const r=await ipc.saveText({text:content,filename:'AI보조_'+stamp+'.txt'});
  if(r&&r.ok)toast('💾 저장 완료');
});
$('aiMemo').addEventListener('click',()=>{
  $('memoBtn').click();
  setTimeout(()=>{const m=[...document.querySelectorAll('.memo')].pop();if(m){m.querySelector('.mtext').innerText=$('aiOut').textContent;}},50);
});

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
setProUI();
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

/* ===== 다문화 번역 (Anthropic API, BYO Key) ===== */
// 텍스트 번역: 복수 언어 토글
$('trLangs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  b.classList.toggle('on'); // 복수 선택
}));
function trSelLangs(){
  const sel=[...$('trLangs').querySelectorAll('button.on')].map(b=>({v:b.dataset.l,flag:b.dataset.n}));
  return sel.length?sel:[{v:'Vietnamese',flag:'🇻🇳'}];
}
// API 키 (기존 AI 기능과 공유: 'ai_key')
$('trKey').value=localStorage.getItem('ai_key')||'';
$('trGear').addEventListener('click',()=>$('trKeyRow').classList.toggle('on'));
$('trKeySave').addEventListener('click',()=>{
  localStorage.setItem('ai_key',$('trKey').value.trim());
  $('trKeyRow').classList.remove('on');toast('🔑 API 키 저장됨');
});
function trSay(msg){$('trMsg').textContent=msg;}
$('trGo').addEventListener('click',async()=>{
  const text=$('trIn').value.trim();
  if(!text){trSay('번역할 문장을 입력하세요');return;}
  const langs=trSelLangs();
  const toCap=$('trToCap').checked;
  $('trGo').disabled=true;$('trGo').textContent='번역 중…';trSay('');
  // 자막 박스 모드
  if(toCap){
    if(!isPro()&&!(localStorage.getItem('ai_key'))){trSay('⚙ Pro 인증 또는 API 키 필요');$('trGo').disabled=false;$('trGo').textContent='번역하기';return;}
    capBox.classList.add('on');
    if(!capBox.style.width){capBox.style.width='560px';capBox.style.height='200px';}
    if(!capBox.style.left){const d=dockDisp();capBox.style.left=(d.x+(d.w-560)/2)+'px';capBox.style.top=(d.y+d.h*0.6)+'px';}
    $('capOrig').textContent='🇰🇷 '+text;
    const list=$('capTransList');list.innerHTML='';
    const rows={};
    langs.forEach(l=>{const d=document.createElement('div');d.className='cap-line';d.innerHTML='<span class="cap-flag">'+l.flag+'</span>…';list.appendChild(d);rows[l.v]=d;});
    applyCapStyle();
  }
  // 결과 카드용
  $('trOrig').textContent='🇰🇷 '+text;
  const outParts=[];
  await Promise.all(langs.map(async l=>{
    const sys='Translate the Korean text into '+l.v+'. Output ONLY the translation, no explanations, no quotes. Natural and simple for a child.';
    const res=await callAI({prompt:text,system:sys,max_tokens:1024});
    const t=res.ok?res.text:'(번역 실패)';
    outParts.push(l.flag+' '+t);
    if(toCap){const r=$('capTransList').querySelector('.cap-line');} // noop
    if(toCap&&capBox.classList.contains('on')){
      const list=$('capTransList');
      // 해당 언어 줄 갱신
      [...list.querySelectorAll('.cap-line')].forEach(()=>{});
    }
    if(toCap){
      const rowsAll=$('capTransList').querySelectorAll('.cap-line');
      // flag로 매칭
      rowsAll.forEach(rw=>{if(rw.querySelector('.cap-flag').textContent===l.flag)rw.innerHTML='<span class="cap-flag">'+l.flag+'</span>'+t;});
      applyCapStyle();
    }
    if(res.message==='NO_KEY'){trSay('⚙ Pro 인증을 하거나 API 키를 설정하세요');$('trKeyRow').classList.add('on');}
  }));
  $('trGo').disabled=false;$('trGo').textContent='번역하기';
  if(outParts.length){
    $('trOut').innerHTML=outParts.map(p=>'<div style="margin:4px 0">'+p+'</div>').join('');
    $('trCard').classList.add('on');trSay('');
  }
});
$('trCopy').addEventListener('click',()=>{ipc.copyText($('trOut').innerText);toast('📋 복사됨');});

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
syncPtr();

