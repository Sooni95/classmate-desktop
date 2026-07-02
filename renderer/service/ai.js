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

