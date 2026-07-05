/* ===== 메모 — v0.4: 부분 글자 크기 (선택한 단어만) ===== */
const MCOLS=['#FFF3A3','#FFB3C6','#B3F0D4','#C7D2FF'];let mCnt=0;
// 모서리에 접어둔 메모들을 세로로 쌓기 위한 화면별 스택 (edge: 'l'|'r')
const memoFoldStacks={l:[],r:[]};
const MFOLD_H=120, MFOLD_GAP=8;
function restackFold(edge){
  const d=dockDisp();
  memoFoldStacks[edge].forEach((m,i)=>{
    m.style.top=(d.y+16+i*(MFOLD_H+MFOLD_GAP))+'px';
  });
}
function foldMemo(m,edge,ed){
  if(m.classList.contains('folded'))return;
  const r=m.getBoundingClientRect();
  m.dataset.restoreLeft=m.style.left;m.dataset.restoreTop=m.style.top;
  m.dataset.restoreWidth=r.width+'px';
  m.classList.add('folded','fold-'+edge);
  const d=dispAt(r.left+r.width/2,r.top+r.height/2);
  m.style.width='36px';m.style.height=MFOLD_H+'px';
  m.style.left=(edge==='l'?d.x+8:d.x+d.w-36-8)+'px';
  const tab=m.querySelector('.mfoldtab');
  if(tab){const t=(ed&&ed.innerText.trim())||'메모';tab.textContent=(t.length>10?t.slice(0,10)+'…':t);}
  memoFoldStacks[edge].push(m);
  restackFold(edge);
}
function unfoldMemo(m){
  if(!m.classList.contains('folded'))return;
  const edge=m.classList.contains('fold-l')?'l':'r';
  memoFoldStacks[edge]=memoFoldStacks[edge].filter(x=>x!==m);
  restackFold(edge);
  m.classList.remove('folded','fold-l','fold-r');
  m.style.left=m.dataset.restoreLeft||m.style.left;
  m.style.top=m.dataset.restoreTop||m.style.top;
  m.style.width=m.dataset.restoreWidth||'';
  m.style.height='';
}
// 드래그로 화면 가장자리 가까이 놓으면 책갈피처럼 자동으로 접힘
const MFOLD_EDGE=28;
function maybeAutoFold(m,ed){
  if(m.classList.contains('folded'))return;
  const r=m.getBoundingClientRect();
  const d=dispAt(r.left+r.width/2,r.top+r.height/2);
  if(r.left-d.x<=MFOLD_EDGE)foldMemo(m,'l',ed);
  else if(d.x+d.w-r.right<=MFOLD_EDGE)foldMemo(m,'r',ed);
}
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
// 녹음된 오디오를 메모 안에 재생 플레이어 + 저장 버튼으로 삽입
function addAudioToMemo(m,ed,blob){
  const url=URL.createObjectURL(blob);
  const box=document.createElement('div');box.className='maudio';
  const audio=document.createElement('audio');audio.controls=true;audio.src=url;
  const save=document.createElement('button');save.className='masave';save.textContent='💾';save.title='음성 파일 저장';
  const del=document.createElement('button');del.className='madel';del.textContent='✕';del.title='녹음 삭제';
  box.appendChild(audio);box.appendChild(save);box.appendChild(del);
  m.insertBefore(box,m.querySelector('.rs2'));
  save.addEventListener('click',async()=>{
    const buf=await blob.arrayBuffer();
    const now=new Date();
    const fn='음성_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0')+'.webm';
    const r=await ipc.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:fn});
    if(r&&r.ok)toast('💾 음성 파일 저장 완료');
  });
  del.addEventListener('click',()=>{URL.revokeObjectURL(url);box.remove();});
}
$('memoBtn').addEventListener('click',()=>{
  mCnt++;const m=document.createElement('div');m.className='memo iv';
  const c=MCOLS[mCnt%4];
  const d=dockDisp();
  m.style.cssText=`left:${d.x+130+Math.random()*200}px;top:${d.y+110+Math.random()*160}px;`;
  m.innerHTML=`<div class="mbar" style="background:${c}cc">
    <span style="display:flex;align-items:center;gap:4px">
      <button class="fbtn" data-f="-1" title="선택한 글자 작게">A-</button><button class="fbtn" data-f="1" title="선택한 글자 크게">A+</button>
      <button class="fbtn" id="mFont" title="글꼴 바꾸기">가</button>
      <button class="fbtn" id="mCopy" title="클립보드로 복사">📋</button>
      <button class="fbtn" id="mSave" title="txt 파일로 저장">💾</button>
      <button class="fbtn" id="mMic" title="음성 녹음">🎤</button>
      <input type="range" min="35" max="100" value="100" title="투명도">
    </span>
    <span><button class="mbtn2">─</button><button class="mbtn2">×</button></span>
    <span class="mfoldtab">📝</span>
  </div><div class="mtext" contenteditable="true" data-ph="메모… (단어 드래그 후 A+/A-)" style="background:${c}"></div><div class="rn"></div><div class="rs"></div><div class="re"></div><div class="rw"></div><div class="rs2"></div>`;
  document.body.appendChild(m);
  const ed=m.querySelector('.mtext');
  const [minB,xB]=m.querySelectorAll('.mbtn2');
  xB.addEventListener('click',()=>{unfoldMemo(m);m.remove();});
  minB.addEventListener('click',()=>{m.classList.toggle('min');minB.textContent=m.classList.contains('min')?'▢':'─';});
  // 접힌 상태에서 바를 클릭하면 다시 펼침
  m.querySelector('.mbar').addEventListener('click',()=>{ if(m.classList.contains('folded'))unfoldMemo(m); });
  // 복사 / txt 저장
  m.querySelector('#mCopy').addEventListener('mousedown',e=>e.preventDefault());
  m.querySelector('#mCopy').addEventListener('click',()=>{
    const t=ed.innerText.trim();
    if(!t){toast('메모가 비어있어요');return;}
    ipc.copyText(t);toast('📋 메모 복사됨');
  });
  m.querySelector('#mSave').addEventListener('mousedown',e=>e.preventDefault());
  m.querySelector('#mSave').addEventListener('click',async()=>{
    const t=ed.innerText.trim();
    if(!t){toast('메모가 비어있어요');return;}
    const now=new Date();
    const fn='메모_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'.txt';
    const r=await ipc.saveText({text:t,filename:fn});
    if(r&&r.ok)toast('💾 메모 저장 완료');
  });
  // 음성 녹음 (MediaRecorder — getUserMedia만 사용해 Electron에서 안정적)
  const micBtn=m.querySelector('#mMic');
  let mediaRec=null,recOn=false,recChunks=[],recStream=null,recTimer=null,recSec=0;
  function stopRec(){
    if(mediaRec&&mediaRec.state!=='inactive')mediaRec.stop();
  }
  micBtn.addEventListener('mousedown',e=>e.preventDefault());
  micBtn.addEventListener('click',async()=>{
    if(recOn){stopRec();return;}
    try{
      recStream=await navigator.mediaDevices.getUserMedia({audio:true});
    }catch(e){toast('🎤 마이크를 사용할 수 없어요 (권한 확인)');return;}
    recChunks=[];
    try{mediaRec=new MediaRecorder(recStream);}
    catch(e){toast('이 환경에서는 녹음을 지원하지 않아요');recStream.getTracks().forEach(t=>t.stop());return;}
    mediaRec.ondataavailable=ev=>{if(ev.data.size)recChunks.push(ev.data);};
    mediaRec.onstop=()=>{
      clearInterval(recTimer);recTimer=null;
      recStream.getTracks().forEach(t=>t.stop());
      recOn=false;micBtn.classList.remove('on');micBtn.textContent='🎤';
      const blob=new Blob(recChunks,{type:'audio/webm'});
      addAudioToMemo(m,ed,blob);
    };
    mediaRec.start();
    recOn=true;recSec=0;micBtn.classList.add('on');micBtn.textContent='⏹';
    toast('🎤 녹음 중… (다시 누르면 정지)');
    recTimer=setInterval(()=>{recSec++;micBtn.textContent='⏹'+Math.floor(recSec/60)+':'+String(recSec%60).padStart(2,'0');},1000);
  });
  m.querySelectorAll('.fbtn').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault()); // 선택 유지
    b.addEventListener('click',()=>applyFontSize(ed,+b.dataset.f));
  });
  m.querySelector('input[type=range]').addEventListener('input',e=>m.style.opacity=e.target.value/100);
  // 글꼴 바꾸기 (Windows 기본 한글 글꼴 순환)
  const MFONTS=[['맑은 고딕','"Malgun Gothic",sans-serif'],['바탕','"Batang",serif'],['굴림','"Gulim",sans-serif'],['궁서','"Gungsuh",serif']];
  let mFi=0;
  m.querySelector('#mFont').addEventListener('mousedown',e=>e.preventDefault());
  m.querySelector('#mFont').addEventListener('click',()=>{
    mFi=(mFi+1)%MFONTS.length;ed.style.fontFamily=MFONTS[mFi][1];
    toast('🔤 글꼴: '+MFONTS[mFi][0]);
  });
  const mbar=m.querySelector('.mbar');
  let mDragMoved=false;
  makeDrag(mbar,(e,s)=>{
    if(!s){mDragMoved=false;const r=m.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top,sx:e.clientX,sy:e.clientY};}
    if(Math.abs(e.clientX-s.sx)+Math.abs(e.clientY-s.sy)>4)mDragMoved=true;
    m.style.left=(e.clientX-s.dx)+'px';m.style.top=(e.clientY-s.dy)+'px';
  },e=>['BUTTON','INPUT'].includes(e.target.tagName)||m.classList.contains('folded'));
  // 드래그를 화면 가장자리 가까이서 놓으면 책갈피처럼 자동으로 접어둠
  mbar.addEventListener('pointerup',()=>{ if(mDragMoved)maybeAutoFold(m,ed); });
  // 4방향 + 모서리 리사이즈 (화면 끝 스냅)
  const SNAP=14, barH=()=>m.querySelector('.mbar').offsetHeight;
  function memoResize(sel,dir){
    const h=m.querySelector(sel); if(!h)return;
    makeDrag(h,(e,s)=>{
      if(!s){const r=m.getBoundingClientRect();return{sx:e.clientX,sy:e.clientY,L:r.left,T:r.top,W:r.width,H:ed.offsetHeight};}
      const d=(typeof dispAt==='function'?dispAt(e.clientX,e.clientY):null)||dockDisp();
      const dx=e.clientX-s.sx, dy=e.clientY-s.sy;
      if(dir.includes('e')){ let nw=s.W+dx; if(s.L+nw>=d.x+d.w-SNAP)nw=d.x+d.w-s.L; m.style.width=Math.max(170,nw)+'px'; }
      if(dir.includes('w')){ let nl=s.L+dx; if(nl<=d.x+SNAP)nl=d.x; const nw=s.W+(s.L-nl); if(nw>=170){m.style.left=nl+'px';m.style.width=nw+'px';} }
      if(dir.includes('s')){ let nh=s.H+dy; if(s.T+barH()+nh>=d.y+d.h-SNAP)nh=(d.y+d.h)-(s.T+barH()); ed.style.height=Math.max(60,nh)+'px'; }
      if(dir.includes('n')){ let nt=s.T+dy; if(nt<=d.y+SNAP)nt=d.y; const nh=s.H+(s.T-nt); if(nh>=60){m.style.top=nt+'px';ed.style.height=nh+'px';} }
    });
  }
  memoResize('.re','e');memoResize('.rw','w');memoResize('.rs','s');memoResize('.rn','n');memoResize('.rs2','se');
  ed.focus();
});
