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

/* ===== 수업 기록 내보내기 ===== */
const expWrap=$('expWrap');let expFmt='png';
function collectClassData(){
  // 메모
  const memos=[...document.querySelectorAll('.memo')].map(m=>{
    const t=m.querySelector('.mtext');return t?t.innerText.trim():'';
  }).filter(Boolean);
  // 핀 캡션
  const pins=[...document.querySelectorAll('.pin')].map(p=>{
    const c=p.querySelector('.pcap');const cap=c?c.innerText.trim():'';
    const isVid=p.dataset.video==='1';
    return {cap,isVid,img:isVid?null:(p.querySelector('img')?.src||null)};
  });
  // 모둠 점수
  const scores=[...document.querySelectorAll('#scoreRows .srow2')].map(r=>({
    name:r.querySelector('.nm2')?.value||'',score:+r.dataset.score||0
  }));
  // 필기(펜) — 캔버스에 그린 내용이 있으면 포함
  let drawImg=null;
  try{
    const dcv=$('dc');
    if(dcv&&dcv.width&&dcv.height){
      // 빈 캔버스인지 검사 (성능 위해 샘플링)
      const tmp=document.createElement('canvas');tmp.width=dcv.width;tmp.height=dcv.height;
      tmp.getContext('2d').drawImage(dcv,0,0);
      const dt=tmp.getContext('2d').getImageData(0,0,tmp.width,tmp.height).data;
      let hasInk=false;
      for(let i=3;i<dt.length;i+=400){if(dt[i]>10){hasInk=true;break;}}
      if(hasInk)drawImg=dcv.toDataURL('image/png');
    }
  }catch(e){}
  return {memos,pins,scores,drawImg};
}
function expPreview(){
  const d=collectClassData();
  const parts=[];
  if(d.memos.length)parts.push('<b>메모</b> '+d.memos.length+'개');
  const pinImg=d.pins.filter(p=>!p.isVid).length, pinVid=d.pins.filter(p=>p.isVid).length;
  if(pinImg)parts.push('<b>핀(사진)</b> '+pinImg+'개');
  if(pinVid)parts.push('<b>핀(영상)</b> '+pinVid+'개 — 이미지엔 표지만');
  if(d.scores.length)parts.push('<b>모둠점수</b> '+d.scores.length+'팀');
  if(d.drawImg)parts.push('<b>필기</b> 포함');
  $('expPrev').innerHTML=parts.length?('담길 내용: '+parts.join(' · ')):'담을 내용이 없어요. 메모·핀·점수·필기를 먼저 화면에 띄워주세요.';
  return d;
}
$('expBtn').addEventListener('click',()=>{ expPreview(); expWrap.classList.add('on'); centerOnDockDisplay(expWrap); });
$('expClose').addEventListener('click',()=>expWrap.classList.remove('on'));
makeDrag($('expHead'),(e,s)=>{
  if(!s){const r=expWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  expWrap.style.left=(e.clientX-s.dx)+'px';expWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='expClose');
document.querySelectorAll('.exp-fb').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.exp-fb').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');expFmt=b.dataset.f;
}));
// 기록을 캔버스에 합성 (제목 + 메모 + 점수 + 핀 썸네일)
async function renderClassCanvas(title){
  const d=collectClassData();
  const W=1240,M=50;let y=M;
  // 높이 추정용 임시 측정
  const cv=document.createElement('canvas');const c=cv.getContext('2d');
  // 핀 이미지 먼저 로드
  const pinImgs=await Promise.all(d.pins.filter(p=>!p.isVid&&p.img).map(p=>new Promise(res=>{
    const im=new Image();im.onload=()=>res({im,cap:p.cap});im.onerror=()=>res(null);im.src=p.img;
  })));
  const goodPins=pinImgs.filter(Boolean);
  // 필기 이미지 로드
  let drawImage=null;
  if(d.drawImg){
    drawImage=await new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=d.drawImg;});
  }
  // 대략적 높이 계산
  let h=M+70; // 제목
  if(d.memos.length){h+=40;d.memos.forEach(m=>{h+=Math.ceil(m.length/40)*26+18;});}
  if(d.scores.length){h+=40+d.scores.length*34;}
  if(drawImage){h+=40+Math.min(500,(W-M*2)*drawImage.naturalHeight/drawImage.naturalWidth);}
  if(goodPins.length){h+=40;goodPins.forEach(p=>{h+=300+(p.cap?40:0);});}
  h+=M;
  cv.width=W;cv.height=Math.max(h,400);
  // 배경
  c.fillStyle='#ffffff';c.fillRect(0,0,W,cv.height);
  // 헤더 바
  c.fillStyle='#F68C1F';c.fillRect(0,0,W,8);
  c.fillStyle='#1a1f27';c.font='bold 30px "Malgun Gothic"';c.textBaseline='top';
  c.fillText(title||'수업 기록',M,y);y+=42;
  c.fillStyle='#888';c.font='14px "Malgun Gothic"';
  const now=new Date();
  c.fillText('ClassMate · 네패스 코코아팹 · '+now.getFullYear()+'.'+String(now.getMonth()+1).padStart(2,'0')+'.'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),M,y);
  y+=40;
  const wrapText=(text,x,yy,maxW,lh)=>{
    const words=text.split('');let line='';
    for(const ch of words){
      if(c.measureText(line+ch).width>maxW){c.fillText(line,x,yy);line=ch;yy+=lh;}
      else line+=ch;
    }
    c.fillText(line,x,yy);return yy+lh;
  };
  // 모둠 점수
  if(d.scores.length){
    c.fillStyle='#F68C1F';c.font='bold 20px "Malgun Gothic"';c.fillText('🏆 모둠 점수',M,y);y+=34;
    const mx=[...d.scores].sort((a,b)=>b.score-a.score);
    mx.forEach((s,i)=>{
      c.fillStyle=i===0?'#fff3e0':'#f6f8fa';c.fillRect(M,y,W-M*2,30);
      c.fillStyle='#1a1f27';c.font='16px "Malgun Gothic"';
      c.fillText((i===0?'👑 ':'   ')+(s.name||('모둠'+(i+1))),M+12,y+6);
      c.fillStyle='#F68C1F';c.font='bold 16px "Malgun Gothic"';c.textAlign='right';
      c.fillText(s.score+'점',W-M-12,y+6);c.textAlign='left';
      y+=34;
    });
    y+=14;
  }
  // 메모
  if(d.memos.length){
    c.fillStyle='#F68C1F';c.font='bold 20px "Malgun Gothic"';c.fillText('📝 메모',M,y);y+=34;
    d.memos.forEach(m=>{
      c.fillStyle='#fff7ec';
      const lines=Math.max(1,Math.ceil(c.measureText(m).width/(W-M*2-24)));
      const bh=lines*26+16;
      c.fillRect(M,y,W-M*2,bh);c.fillStyle='#F68C1F';c.fillRect(M,y,4,bh);
      c.fillStyle='#3a2a10';c.font='16px "Malgun Gothic"';
      wrapText(m,M+16,y+8,W-M*2-30,26);
      y+=bh+12;
    });
    y+=8;
  }
  // 필기(펜)
  if(drawImage){
    c.fillStyle='#F68C1F';c.font='bold 20px "Malgun Gothic"';c.fillText('✏️ 필기',M,y);y+=34;
    const iw=W-M*2, ih=iw*drawImage.naturalHeight/drawImage.naturalWidth, ihc=Math.min(ih,500), iwc=ihc*drawImage.naturalWidth/drawImage.naturalHeight;
    // 필기는 투명 배경이라 연한 배경 깔고
    c.fillStyle='#f6f8fa';c.fillRect(M,y,iwc,ihc);
    c.drawImage(drawImage,M,y,iwc,ihc);
    y+=ihc+18;
  }
  // 핀 사진
  if(goodPins.length){
    c.fillStyle='#F68C1F';c.font='bold 20px "Malgun Gothic"';c.fillText('📌 핀 (캡처·사진)',M,y);y+=34;
    for(const p of goodPins){
      const iw=p.im.naturalWidth,ih=p.im.naturalHeight;
      const dw=Math.min(W-M*2,iw),dh=dw*ih/iw,dhc=Math.min(dh,280),dwc=dhc*iw/ih;
      c.drawImage(p.im,M,y,dwc,dhc);
      if(p.cap){c.fillStyle='#555';c.font='14px "Malgun Gothic"';c.fillText('✎ '+p.cap,M+dwc+16,y+8);}
      y+=dhc+18;
    }
  }
  return cv;
}
$('expGo').addEventListener('click',async()=>{
  const d=collectClassData();
  if(!d.memos.length&&!d.pins.length&&!d.scores.length&&!d.drawImg){$('expMsg').textContent='담을 내용이 없어요';return;}
  $('expGo').disabled=true;$('expGo').textContent='만드는 중…';$('expMsg').textContent='';
  try{
    const title=$('expTitle').value.trim();
    const cv=await renderClassCanvas(title);
    const now=new Date();
    const stamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
    const base=(title?title.replace(/[\\\\/:*?"<>|]/g,'_'):'수업기록')+'_'+stamp;
    if(expFmt==='png'){
      const r=await ipc.saveImage({dataURL:cv.toDataURL('image/png'),filename:base+'.png'});
      if(r&&r.ok)$('expMsg').textContent='✅ 이미지 저장 완료';
    }else{
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'portrait',unit:'pt',format:'a4'});
      const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();
      const img=cv.toDataURL('image/jpeg',0.92);
      const ratio=cv.width/cv.height;
      let iw=pw-40,ih=iw/ratio,yy=20;
      if(ih<=ph-40){pdf.addImage(img,'JPEG',20,yy,iw,ih);}
      else{
        // 길면 여러 페이지로 분할
        const pageImgH=(ph-40)*cv.width/(pw-40);
        let sy=0,page=0;
        while(sy<cv.height){
          const slice=document.createElement('canvas');
          slice.width=cv.width;slice.height=Math.min(pageImgH,cv.height-sy);
          slice.getContext('2d').drawImage(cv,0,sy,cv.width,slice.height,0,0,cv.width,slice.height);
          if(page>0)pdf.addPage();
          pdf.addImage(slice.toDataURL('image/jpeg',0.92),'JPEG',20,20,iw,iw*slice.height/cv.width);
          sy+=pageImgH;page++;
        }
      }
      const buf=pdf.output('arraybuffer');
      const r=await ipc.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:base+'.pdf',ext:'pdf'});
      if(r&&r.ok)$('expMsg').textContent='✅ PDF 저장 완료';
    }
  }catch(e){$('expMsg').textContent='오류: '+e.message;}
  $('expGo').disabled=false;$('expGo').textContent='내보내기';
});

/* ===== Pro 잠금 시스템 ===== */
// Pro 해제 여부 (지금은 항상 잠김 — 추후 라이선스 연동 지점)
function isPro(){ return localStorage.getItem('cm_pro')==='1'; }
function setProUI(){
  const on=isPro();
  document.querySelectorAll('.pro-badge').forEach(b=>b.style.display=on?'none':'');
  $('proBtn').classList.toggle('prolock',!on);
  // Pro면 개인 키 설정 UI 숨김 (회사 키 자동 사용)
  ['aiGear','trGear'].forEach(id=>{const el=$(id);if(el)el.style.display=on?'none':'';});
  if(on){
    const aiKeyRow=$('aiKeyRow'),trKeyRow=$('trKeyRow');
    if(aiKeyRow)aiKeyRow.classList.remove('on');
    if(trKeyRow)trKeyRow.classList.remove('on');
  }
}
// Pro 키 인증 (Cloudflare 서버 검증)
$('proKeyGo').addEventListener('click',async()=>{
  const key=$('proKeyIn').value.trim().toUpperCase();
  const msg=$('proKeyMsg');
  if(!key){msg.className='pro-key-msg err';msg.textContent='키를 입력하세요';return;}
  $('proKeyGo').disabled=true;msg.className='pro-key-msg';msg.textContent='확인 중…';
  const r=await ipc.verifyPro({key});
  $('proKeyGo').disabled=false;
  if(r.ok){
    localStorage.setItem('cm_pro','1');
    localStorage.setItem('cm_pro_key',key);
    msg.className='pro-key-msg ok';msg.textContent='✅ 인증 완료! Pro 기능이 열렸어요';
    setProUI();
    setTimeout(()=>{proWrap.classList.remove('on');toast('🧡 ClassMate Pro 활성화됨');},1200);
  }else if(r.status===404||r.valid===false){
    msg.className='pro-key-msg err';msg.textContent='유효하지 않은 키예요';
  }else if(r.status===410){
    msg.className='pro-key-msg err';msg.textContent='만료되었거나 정지된 키예요';
  }else{
    msg.className='pro-key-msg err';msg.textContent=(r.message&&r.message.startsWith('NET:'))?('서버 연결 실패: '+r.message.slice(4)):'확인 실패 — 인터넷 연결을 확인하세요';
  }
});
const proWrap=$('proWrap');
function openPro(){ proWrap.classList.add('on'); centerOnDockDisplay(proWrap); }
$('proClose').addEventListener('click',()=>proWrap.classList.remove('on'));
makeDrag($('proHead'),(e,s)=>{
  if(!s){const r=proWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  proWrap.style.left=(e.clientX-s.dx)+'px';proWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='proClose');

// 독 Pro 버튼 → Pro 안내 모달 (해제 시 다문화번역 패널 바로 열기)
$('proBtn').addEventListener('click',()=>{
  if(!isPro()){openPro();return;}
  // Pro 인증됨 → 기능 메뉴 표시 (Pro 버튼 위에)
  const menu=$('proMenu');
  if(menu.classList.contains('on')){menu.classList.remove('on');return;}
  const r=$('proBtn').getBoundingClientRect();
  menu.classList.add('on');
  menu.style.left=Math.max(8,r.left+r.width/2-90)+'px';
  menu.style.top=(r.top-menu.offsetHeight-8)+'px';
});
$('proMenu').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  $('proMenu').classList.remove('on');
  const act=b.dataset.act;
  if(act==='trans')setPanel('p-trans');
  else if(act==='ai')setPanel('p-ai');
  else if(act==='roster')openRosterModal();
}));
// 메뉴 바깥 클릭 시 닫기
document.addEventListener('click',e=>{
  if($('proMenu').classList.contains('on')&&!e.target.closest('#proMenu')&&e.target.id!=='proBtn'&&!e.target.closest('#proBtn'))
    $('proMenu').classList.remove('on');
});
// Pro 모달 안의 기능 항목 클릭 → 해제 상태면 해당 패널로
const PRO_PANEL={'다문화 번역':'p-trans','AI 교수 보조':'p-ai'};
document.querySelectorAll('#proWrap .pro-item').forEach(it=>{
  it.style.cursor='pointer';
  it.addEventListener('click',()=>{
    if(!isPro())return;
    const t=it.querySelector('.pi-t')?.textContent||'';
    const pid=PRO_PANEL[t];
    if(pid){proWrap.classList.remove('on');setPanel(pid);}
  });
});
// 명단 저장(roster) 잠금 버튼
document.querySelectorAll('[data-pro]').forEach(el=>{
  el.addEventListener('click',e=>{ if(!isPro()){e.preventDefault();e.stopPropagation();openPro();} });
});

// 명단 저장·불러오기 (Pro) — localStorage 'cm_rosters'
$('rosterBtn').addEventListener('click',()=>{
  if(!isPro())return; // 잠금은 위 핸들러가 처리
  openRosterModal();
});
let activeRoster=null; // 현재 게임에 불러온 명단 이름 (삭제 시 게임에서도 비우기 위함)
function getRosters(){try{return JSON.parse(localStorage.getItem('cm_rosters')||'{}');}catch(e){return {};}}
function saveRosters(r){localStorage.setItem('cm_rosters',JSON.stringify(r));}
function openRosterModal(){
  $('rosterModal').classList.add('on');
  $('rmName').value='';
  renderRosterList();
  centerOnDockDisplay($('rosterModal').querySelector('.rm-card')); // 독 있는 모니터에 배치
}
function renderRosterList(){
  const rosters=getRosters();const names=Object.keys(rosters);
  const list=$('rmList');list.innerHTML='';
  if(!names.length){list.innerHTML='<div class="rm-empty">저장된 명단이 없어요.<br>위에서 현재 명단을 저장해보세요.</div>';return;}
  names.forEach(nm=>{
    const cnt=rosters[nm].split('\n').filter(s=>s.trim()).length;
    const row=document.createElement('div');row.className='rm-item';
    row.innerHTML='<span class="rm-nm"></span><span class="rm-cnt">'+cnt+'명</span><button class="rm-load">불러오기</button><button class="rm-del">삭제</button>';
    row.querySelector('.rm-nm').textContent=nm;
    row.querySelector('.rm-load').addEventListener('click',()=>{
      $('nameList').value=rosters[nm];loadN();
      // 다른 게임에도 반영
      const names=splitNames(rosters[nm]);
      if($('wheelNames'))$('wheelNames').value=names.join('\n');
      if($('pkNames'))$('pkNames').value=names.join('\n');
      if($('tNames'))$('tNames').value=names.join('\n');
      activeRoster=nm;
      $('rosterModal').classList.remove('on');toast('📂 "'+nm+'" 불러옴 (모든 게임에 반영)');
    });
    row.querySelector('.rm-del').addEventListener('click',()=>{
      const r=getRosters();delete r[nm];saveRosters(r);
      // 게임에 불러와 있던 명단이면 게임 입력칸도 비움
      if(activeRoster===nm){
        ['nameList','wheelNames','pkNames','tNames'].forEach(id=>{if($(id))$(id).value='';});
        loadN();activeRoster=null;
        renderRosterList();toast('🗑 "'+nm+'" 삭제 — 게임 명단에서도 제외됨');return;
      }
      renderRosterList();toast('🗑 "'+nm+'" 삭제됨');
    });
    list.appendChild(row);
  });
}
$('rmSave').addEventListener('click',()=>{
  const nm=$('rmName').value.trim();
  const cur=$('nameList').value.trim();
  if(!nm){toast('명단 이름을 입력하세요');return;}
  if(!cur){toast('저장할 명단이 비어있어요 (이름 목록을 먼저 입력)');return;}
  const r=getRosters();r[nm]=cur;saveRosters(r);
  $('rmName').value='';renderRosterList();toast('💾 "'+nm+'" 저장됨');
});
$('rmClose').addEventListener('click',()=>$('rosterModal').classList.remove('on'));
// 카드 헤더 드래그로 이동
makeDrag($('rosterModal').querySelector('.rm-head'),(e,s)=>{
  const card=$('rosterModal').querySelector('.rm-card');
  if(!s){const r=card.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  card.style.left=(e.clientX-s.dx)+'px';card.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='rmClose');
// 배경 클릭 시 닫기 (카드 바깥)
$('rosterModal').addEventListener('click',e=>{if(e.target.id==='rosterModal')$('rosterModal').classList.remove('on');});

// ── 엑셀 명단 가져오기 (드래그앤드롭 + 파일선택) ──
$('rmTemplate').addEventListener('click',async()=>{
  const r=await ipc.saveTemplate();
  if(r&&r.ok)toast('📥 양식을 저장했어요');
});
const rmDrop=$('rmDrop');
function b64ToU8(b64){const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8;}
async function pickRoster(){
  try{const r=await ipc.pickRosterFile();if(r)parseRosterData(r.name,b64ToU8(r.b64));}
  catch(e){toast('파일 선택 창을 열지 못했어요');}
}
$('rmPick').addEventListener('click',e=>{e.stopPropagation();pickRoster();});
rmDrop.addEventListener('click',()=>pickRoster());
$('rmFile').addEventListener('change',e=>{if(e.target.files[0])parseRosterFile(e.target.files[0]);});
['dragenter','dragover'].forEach(ev=>rmDrop.addEventListener(ev,e=>{e.preventDefault();rmDrop.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>rmDrop.addEventListener(ev,e=>{e.preventDefault();rmDrop.classList.remove('drag');}));
rmDrop.addEventListener('drop',async e=>{
  e.preventDefault();rmDrop.classList.remove('drag');
  const f=e.dataTransfer.files[0];if(!f)return;
  if(f.path){const r=await ipc.readPath(f.path);if(r){parseRosterData(r.name,b64ToU8(r.b64));return;}}
  parseRosterFile(f); // 경로를 못 얻으면 브라우저 방식으로
});
// 창 전체에 파일을 떨어뜨려도 페이지가 파일로 이동하지 않도록 차단
['dragover','drop'].forEach(ev=>window.addEventListener(ev,e=>e.preventDefault(),false));
function parseRosterFile(file){
  const reader=new FileReader();
  reader.onload=e=>parseRosterData(file.name,new Uint8Array(e.target.result));
  reader.readAsArrayBuffer(file);
}
function parseRosterData(fname,u8){
  const name=(fname||'').toLowerCase();
  if(!/\.(xlsx|xls|csv)$/.test(name)){toast('xlsx 또는 csv 파일을 올려주세요');return;}
  try{
      const wb=XLSX.read(u8,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      if(!rows.length){toast('빈 파일이에요');return;}
      // 헤더 찾기 (이름 열 위치)
      let head=rows[0].map(x=>String(x).trim());
      const colName=head.findIndex(h=>/이름|성명|name/i.test(h));
      const colNo=head.findIndex(h=>/번호|no|번/i.test(h));
      const colTeam=head.findIndex(h=>/모둠|조|팀|team|group/i.test(h));
      const colW=head.findIndex(h=>/가중치|개수|weight|count/i.test(h));
      const ni=colName>=0?colName:0; // 이름 못 찾으면 첫 열
      const data=rows.slice(colName>=0?1:0).filter(r=>String(r[ni]||'').trim());
      if(!data.length){toast('이름 데이터가 없어요');return;}
      // 발표자 명단(nameList)에 이름 채우기
      const names=data.map(r=>String(r[ni]).trim());
      $('nameList').value=names.join('\n');loadN();
      // 핀볼: 가중치 반영 (이름*N)
      if(colW>=0){
        const pk=data.map(r=>{const w=parseInt(r[colW])||1;return w>1?String(r[ni]).trim()+'*'+Math.min(10,w):String(r[ni]).trim();});
        if($('pkNames'))$('pkNames').value=pk.join('\n');
      }else if($('pkNames'))$('pkNames').value=names.join('\n');
      // 돌림판도 채우기
      if($('wheelNames'))$('wheelNames').value=names.join('\n');
      // 모둠 정보가 있으면 안내
      let msg='📂 '+names.length+'명 불러옴';
      if(colTeam>=0)msg+=' (모둠 정보 포함)';
      toast(msg);
      // 저장 이름 자동 추천
      if(!$('rmName').value)$('rmName').value=(fname||'명단').replace(/\.(xlsx|xls|csv)$/i,'');
    }catch(err){toast('파일을 읽지 못했어요: '+err.message);}
}

// 구독 안내 받기 → Google Forms (기본 브라우저에서 열기)
const PRO_FORM_URL='https://forms.gle/ZK8hxnx65injpK3R8';
$('proCta').addEventListener('click',()=>{
  proWrap.classList.remove('on');
  ipc.openExternal(PRO_FORM_URL);
  toast('📋 구독 신청 폼을 브라우저에서 열었어요');
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

/* ===== 게임 모달 공통 ===== */
const gameWrap=$('gameWrap'),gCv=$('gameCv'),gx=gCv.getContext('2d'),gRes=$('gameRes'),gGo=$('gameGo');
let gameMode=null,gameAnim=0,gameNames=[];
const BRAND=['#F68C1F','#FFB45E','#D9760F','#5b8def','#34c759','#e05544','#a78bfa','#ffd166'];
// "이름*5" → 구슬 5개 (withCount=true일 때)
function parseNames(txt,withCount){
  const out=[];
  splitNames(txt).forEach(line=>{
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
  gameWrap.classList.toggle('plinko',mode==='plinko');
  _pkRankN=-1;if($('pkrList'))$('pkrList').innerHTML='';
  gameWrap.classList.add('on');
  centerOnDockDisplay(gameWrap);
  if(mode==='wheel')drawWheel(src,0);else{pk=pkInit(src);pkDraw();}
}
function closeGame(){cancelAnimationFrame(gameAnim);gameWrap.classList.remove('on');gameMode=null;}
$('gameClose').addEventListener('click',closeGame);
// ── 핀볼 실시간 결과 패널 ──
let _pkRankN=-1;
function escH(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function pkRankHTML(final){
  const total=pk?pk.arrived.length:0;
  if(!total)return '<div class="pkr-i" style="color:#6b7884">떨어지는 중…</div>';
  return pk.arrived.map((b,i)=>{
    const win=final&&i===total-1;
    return '<div class="pkr-i'+(win?' win':'')+'"><span class="rk">'+(i+1)+'</span><span>'+(win?'🎉 ':'')+escH(b.nm)+'</span></div>';
  }).join('');
}
function renderPkRank(final){
  if(gameMode!=='plinko'||!pk)return;
  const list=$('pkrList');if(!list)return;
  if(!final&&pk.arrived.length===_pkRankN)return;
  _pkRankN=pk.arrived.length;
  list.innerHTML=pkRankHTML(final);
  list.scrollTop=list.scrollHeight;
}
$('pkrAll')&&$('pkrAll').addEventListener('click',()=>{
  if(!pk){toast('아직 기록이 없어요');return;}
  $('pkLogBody').innerHTML=pkRankHTML(true)+'<div style="color:#6b7884;font-size:11px;margin-top:8px">※ 마지막 골인(맨 아래)이 당첨</div>';
  $('pkLog').classList.add('on');
  centerOnDockDisplay($('pkLog').querySelector('.pkl-card'));
});
$('pkLogClose')&&$('pkLogClose').addEventListener('click',()=>$('pkLog').classList.remove('on'));
$('pkLog')&&$('pkLog').addEventListener('click',e=>{if(e.target.id==='pkLog')$('pkLog').classList.remove('on');});
/* ===== 게이미피케이션 런처 ===== */
function gShowCfg(id){
  ['cfgPick','cfgDraw','cfgWheel','cfgPk'].forEach(c=>$(c)&&$(c).classList.remove('on'));
  ['gcPick','gcDraw','gcWheel','gcPk','gcScore','gcDice','gcLotto','gcLight','gcShade','gcSymbol','gcLadder','gcBoard'].forEach(c=>$(c)&&$(c).classList.remove('on'));
  if(id)$(id).classList.add('on');
}
$('gcPick').addEventListener('click',()=>{gShowCfg('gcPick');$('cfgPick').classList.add('on');});
$('gcDraw').addEventListener('click',()=>{gShowCfg('gcDraw');$('cfgDraw').classList.add('on');});
$('gcWheel').addEventListener('click',()=>{gShowCfg('gcWheel');$('cfgWheel').classList.add('on');});
$('gcPk').addEventListener('click',()=>{gShowCfg('gcPk');$('cfgPk').classList.add('on');});
$('gcScore').addEventListener('click',()=>{gShowCfg();openWidget('scoreW');});
$('gcDice').addEventListener('click',()=>{gShowCfg();openWidget('diceW');});
$('gcLight').addEventListener('click',()=>{gShowCfg();openWidget('lightW');});
$('gcShade')&&$('gcShade').addEventListener('click',()=>{gShowCfg();openShade();});
$('gcSymbol')&&$('gcSymbol').addEventListener('click',()=>{gShowCfg();openWidget('symbolW');});
$('gcSeats')&&$('gcSeats').addEventListener('click',()=>{ipc.openExternal('https://ksk0903.github.io/table_setting/');toast('🪑 자리 배치를 브라우저에서 열었어요');});
$('gcPdf')&&$('gcPdf').addEventListener('click',()=>{ipc.openExternal('https://ksk0903.github.io/pdf_editor/');toast('📄 PDF 편집을 브라우저에서 열었어요');});
$('gcLadder').addEventListener('click',()=>{gShowCfg();if(window.openLadder)window.openLadder();});

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
/* --- 제비뽑기 (번호 표시) --- */
const drawWrap=$('drawWrap');let drawData=[],drawWinLeft=0;
makeDrag($('drawHead'),(e,s)=>{
  if(!s){const r=drawWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  drawWrap.style.left=(e.clientX-s.dx)+'px';drawWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='drawClose');
$('drawClose').addEventListener('click',()=>drawWrap.classList.remove('on'));
$('drawOpen').addEventListener('click',()=>{
  const cnt=Math.min(60,Math.max(2,parseInt($('drawCnt').value)||30));
  const winN=Math.min(cnt,Math.max(1,parseInt($('drawWin').value)||1));
  // 당첨 위치 무작위 (번호는 1..cnt 고정 표시, 당첨 여부만 숨김)
  const winIdx=new Set();while(winIdx.size<winN)winIdx.add(Math.floor(Math.random()*cnt));
  drawData=Array.from({length:cnt},(_,i)=>({no:i+1,win:winIdx.has(i),open:false}));
  drawWinLeft=winN;
  renderDraw();
  drawWrap.classList.add('on');centerOnDockDisplay(drawWrap);
});
function renderDraw(){
  $('drawCount').textContent='제비 '+drawData.length+'개 · 당첨 '+drawWinLeft+'개 남음';
  $('drawResult').textContent='학생이 번호를 부르면 그 제비를 클릭하세요';
  const g=$('drawGrid');g.innerHTML='';
  drawData.forEach((d,i)=>{
    const t=document.createElement('div');t.className='ticket';
    t.innerHTML='<span class="tk-no">'+d.no+'</span><span class="tk-win">👑</span><span class="tk-txt"></span>';
    if(!d.open)t.addEventListener('click',()=>openTicket(i,t));
    g.appendChild(t);
  });
}
function openTicket(i,el){
  if(drawData[i].open)return;
  drawData[i].open=true;
  el.classList.add('open');
  const txt=el.querySelector('.tk-txt');
  if(drawData[i].win){
    el.classList.add('win');txt.classList.add('hit');
    txt.innerHTML='<span class="tk-emo">🎉</span><span class="tk-lbl">당첨</span>';
    if(drawWinLeft>0)drawWinLeft--;beep();
    $('drawResult').innerHTML='🎉 <b style="color:#F68C1F">'+drawData[i].no+'번 당첨!</b>';
  }else{
    txt.classList.add('lose');
    txt.innerHTML='<span class="tk-emo">💧</span><span class="tk-lbl">꽝</span>';
    $('drawResult').textContent=drawData[i].no+'번 — 꽝!';
  }
  $('drawCount').textContent='제비 '+drawData.length+'개 · 당첨 '+drawWinLeft+'개 남음';
}

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
let diceRolling=false;
$('diceRoll').addEventListener('click',()=>{
  if(diceRolling)return;diceRolling=true;
  $('diceRoll').disabled=true;$('diceTotal').textContent='';
  let n=0;const total=13;
  const iv=setInterval(()=>{
    const vals=Array.from({length:diceCount},()=>1+Math.floor(Math.random()*6));
    diceRender(diceCount,vals);
    $('diceFaces').querySelectorAll('.die').forEach(d=>d.classList.add('rolling'));
    if(++n>=total){
      clearInterval(iv);
      const fin=Array.from({length:diceCount},()=>1+Math.floor(Math.random()*6));
      diceRender(diceCount,fin);
      // 착지 연출
      $('diceFaces').querySelectorAll('.die').forEach(d=>{d.classList.remove('rolling');d.classList.add('landed');});
      const sum=fin.reduce((a,b)=>a+b,0);
      $('diceTotal').innerHTML=diceCount>1?('합계 <b>'+sum+'</b>'):('<b>'+sum+'</b>');
      beep();
      setTimeout(()=>{$('diceFaces').querySelectorAll('.die').forEach(d=>d.classList.remove('landed'));},320);
      diceRolling=false;$('diceRoll').disabled=false;
    }
  },90);
});

/* --- 🎱 행운 번호 뽑기 (로또식 추첨) --- */
(function(){
  const cv=$('lottoCv'); if(!cv)return;
  const cx=cv.getContext('2d'),W=cv.width,H=cv.height,CX=W/2,CY=H/2,R=Math.min(W,H)/2-6;
  const LC=['#F68C1F','#5b8def','#37c871','#e84d3d','#a78bfa','#ffc02e','#4dd0e1','#ff8a65','#ba68c8','#26c6da'];
  let balls=[],raf=0,spinning=false;
  function makeBalls(){
    balls=[];
    for(let i=0;i<26;i++){
      const a=Math.random()*6.2832,r=Math.random()*(R-18);
      balls.push({x:CX+Math.cos(a)*r,y:CY+Math.sin(a)*r,vx:(Math.random()-.5)*140,vy:(Math.random()-.5)*140,n:1+Math.floor(Math.random()*99),col:LC[i%LC.length]});
    }
  }
  function step(){
    if(!$('lottoW').classList.contains('on')){raf=0;return;} // 닫히면 정지
    cx.clearRect(0,0,W,H);
    cx.beginPath();cx.arc(CX,CY,R,0,6.2832);cx.strokeStyle='#46586b';cx.lineWidth=6;cx.stroke();
    const dt=0.016,ag=spinning?2.6:1;
    balls.forEach(b=>{
      if(spinning){b.vx+=(Math.random()-.5)*70;b.vy+=(Math.random()-.5)*70;}
      b.x+=b.vx*dt*ag;b.y+=b.vy*dt*ag;
      const dx=b.x-CX,dy=b.y-CY,d=Math.hypot(dx,dy),mx=R-11;
      if(d>mx){const nx=dx/d,ny=dy/d;b.x=CX+nx*mx;b.y=CY+ny*mx;const vn=b.vx*nx+b.vy*ny;b.vx-=2*vn*nx;b.vy-=2*vn*ny;b.vx*=.9;b.vy*=.9;}
      b.vx*=.994;b.vy*=.994;
      const g=cx.createRadialGradient(b.x-3,b.y-3,1,b.x,b.y,11);g.addColorStop(0,'#fff');g.addColorStop(.25,b.col);g.addColorStop(1,b.col);
      cx.beginPath();cx.arc(b.x,b.y,11,0,6.2832);cx.fillStyle=g;cx.fill();
      cx.fillStyle='#fff';cx.font='bold 10px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(b.n,b.x,b.y);
    });
    raf=requestAnimationFrame(step);
  }
  function startDrum(){makeBalls();if(!raf)raf=requestAnimationFrame(step);}
  window.lottoStart=()=>{$('lottoResult').innerHTML='';startDrum();};
  $('lottoDraw').addEventListener('click',()=>{
    let mn=parseInt($('lottoMin').value),mx=parseInt($('lottoMax').value),cnt=parseInt($('lottoCnt').value);
    mn=Math.max(0,Math.min(999,isNaN(mn)?0:mn));mx=Math.max(0,Math.min(999,isNaN(mx)?0:mx));
    if(mn>mx){const t=mn;mn=mx;mx=t;$('lottoMin').value=mn;$('lottoMax').value=mx;}
    const pool=mx-mn+1;cnt=Math.max(1,Math.min(20,Math.min(isNaN(cnt)?1:cnt,pool)));
    $('lottoResult').innerHTML='';spinning=true;startDrum();beep(1);
    setTimeout(()=>{
      spinning=false;
      const set=new Set();while(set.size<cnt)set.add(mn+Math.floor(Math.random()*pool));
      const wins=[...set].sort((a,b)=>a-b),res=$('lottoResult');
      wins.forEach((n,i)=>setTimeout(()=>{
        const s=document.createElement('span');s.className='lotto-ball';s.textContent=n;s.style.background=LC[i%LC.length];
        res.appendChild(s);beep(1);
      },i*240));
    },1700);
  });
})();
$('gcLotto')&&$('gcLotto').addEventListener('click',()=>{gShowCfg();openWidget('lottoW');if(window.lottoStart)lottoStart();});

/* --- 신호등 --- */
let lightScale=1;
document.querySelectorAll('#lightW .fw-sz').forEach(b=>b.addEventListener('click',e=>{
  e.stopPropagation();
  lightScale=Math.min(2.4,Math.max(0.7,lightScale+(+b.dataset.d>0?0.15:-0.15)));
  const w=$('lightW');w.style.transformOrigin='top left';w.style.transform='scale('+lightScale+')';
}));
$('lightW')&&$('lightW').querySelectorAll('.tl button').forEach(b=>b.addEventListener('click',()=>{
  $('lightW').querySelectorAll('.tl button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');$('lightLabel').textContent=b.dataset.m;
}));

/* --- 활동 상징 (조용히·짝·모둠 등을 화면에 크게) --- */
(function(){
  const pick=$('symPick'); if(!pick)return;
  const SYMS=[
    {e:'🤫',t:'조용히'},{e:'👂',t:'잘 듣기'},{e:'👥',t:'짝 활동'},
    {e:'👨‍👩‍👧‍👦',t:'모둠 활동'},{e:'🙋',t:'발표·질문'},{e:'🚶',t:'이동·자유'},
  ];
  SYMS.forEach(s=>{
    const b=document.createElement('button');b.className='sym-b';
    b.innerHTML='<span class="se">'+s.e+'</span><span class="st">'+s.t+'</span>';
    b.addEventListener('click',()=>{
      pick.querySelectorAll('.sym-b').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      $('symBig').textContent=s.e;$('symLabel').textContent=s.t;
    });
    pick.appendChild(b);
  });
})();

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
  gx.setTransform(1,0,0,1,0,0);
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
    // 글자: 조각 중간 각도에 '수평'으로 배치 (가독성 ↑)
    const mid=a0+step/2, rTxt=WR*0.62;
    const tx=WCX+Math.cos(mid)*rTxt, ty=WCY+Math.sin(mid)*rTxt;
    gx.fillStyle='#fff';
    gx.font='bold '+(n>20?11:n>12?13:16)+'px "Malgun Gothic"';
    gx.shadowColor='rgba(0,0,0,.5)';gx.shadowBlur=3;
    gx.textAlign='center';gx.textBaseline='middle';
    const label=names[i].length>6?names[i].slice(0,6)+'…':names[i];
    gx.fillText(label,tx,ty);gx.shadowBlur=0;
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
const PKW=540,PKH=470,PK_GAP=26;
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
  for(let r=0;r<5;r++){              // 핀 줄여서 범퍼가 주인공
    const cnt=6+(r%2);
    for(let c=0;c<cnt;c++)pegs.push({x:(PKW/(cnt+1))*(c+1),y:96+r*40,r:5});
  }
  // 큰 범퍼(통통 강하게 튕기는 원형 장애물)
  const bumpers=[
    {x:PKW*0.5, y:158,r:21},
    {x:PKW*0.26,y:252,r:18},
    {x:PKW*0.74,y:252,r:18},
  ];
  const paddles=[
    {cx:PKW*0.30,cy:330,len:80,a:Math.random()*6,w:1.9,flash:0},
    {cx:PKW*0.70,cy:330,len:80,a:Math.random()*6,w:-2.2,flash:0},
    {cx:PKW/2,  cy:414,len:84,a:Math.random()*6,w:1.5,flash:0}, // 골 문지기
  ];
  return {balls,pegs,paddles,bumpers,arrived:[],fx:[],popTimer:2};
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
    b.vx*=0.997;b.vy*=0.998;
    const cap=Math.hypot(b.vx,b.vy);
    if(cap>620){b.vx*=620/cap;b.vy*=620/cap;}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*REST;}
    if(b.x>PKW-b.r){b.x=PKW-b.r;b.vx=-Math.abs(b.vx)*REST;}
    for(const p of pk.pegs){
      if(collideCircle(b,p.x,p.y,p.r,0.7)&&Math.hypot(b.vx,b.vy)>220)
        pkFx('spark',p.x,p.y,b.col);
    }
    for(const p of pk.bumpers){
      if(p.flash===undefined)p.flash=0;
      let nx=b.x-p.x,ny=b.y-p.y;const d=Math.hypot(nx,ny),min=b.r+p.r;
      if(d>0&&d<min){
        nx/=d;ny/=d;b.x=p.x+nx*min;b.y=p.y+ny*min;
        const vn=b.vx*nx+b.vy*ny;
        if(vn<0){
          b.vx-=2.1*vn*nx;b.vy-=2.1*vn*ny;   // 탄성↑ 시원하게 튕김
          // 범퍼는 펑! 하고 차내는 느낌 — 법선 방향으로 추가 가속
          b.vx+=nx*90;b.vy+=ny*90;
        }
        p.flash=0.18;
        pkFx('ring',p.x,p.y,'#F68C1F');pkFx('spark',b.x,b.y,b.col);
      }
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
    if(sp<12&&b.y>0){b.slow+=dt;if(b.slow>1.2){b.vx+=(Math.random()-.5)*200;b.vy-=140;b.slow=0;}}else b.slow=0;
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
  // 🎢 반전요소: 2초마다 바닥 근처 공 하나를 위로 "팡" 쏘아올림 → 순위 뒤집힘
  pk.popTimer-=dt;
  if(pk.popTimer<=0){
    pk.popTimer=2;
    const cand=pk.balls.filter(b=>!b.done&&b.y>405);
    if(cand.length){
      const b=cand[Math.floor(Math.random()*cand.length)];
      b.vy=-(360+Math.random()*180); b.vx+=(Math.random()-.5)*240;
      pkFx('ring',b.x,b.y,'#F68C1F'); pkFx('txt',b.x,b.y-20,b.col,'팡!');
      beep(1);
    }
  }
}
// 핀볼 카메라 (줌/팬) — 두근두근 연출
let pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0};
function pkCamUpdate(dt){
  const alive=pk.balls.filter(b=>!b.done);
  let tz=1,fx=PKW/2,fy=PKH/2;
  if(alive.length===1){
    // 마지막 1구슬: 강하게 줌인 추적
    tz=2.1;fx=alive[0].x;fy=alive[0].y;
  }else if(alive.length>=1){
    // 골 근처(아래쪽)에 구슬이 모이면 살짝 줌인
    const low=alive.filter(b=>b.y>300);
    if(low.length){tz=1.35;fx=low.reduce((a,b)=>a+b.x,0)/low.length;fy=360;}
  }
  pkCam.tz=tz;
  // 목표 중심 → 변환 오프셋 (화면 중앙에 fx,fy 오게)
  pkCam.ttx=PKW/2-fx*tz;pkCam.tty=PKH/2-fy*tz;
  // 부드럽게 보간
  const k=Math.min(1,dt*4.5);
  pkCam.zoom+=(pkCam.tz-pkCam.zoom)*k;
  pkCam.tx+=(pkCam.ttx-pkCam.tx)*k;
  pkCam.ty+=(pkCam.tty-pkCam.ty)*k;
  // 경계 클램프 (줌인 시 화면 밖 빈공간 방지)
  const z=pkCam.zoom;
  pkCam.tx=Math.min(0,Math.max(PKW-PKW*z,pkCam.tx));
  pkCam.ty=Math.min(0,Math.max(PKH-PKH*z,pkCam.ty));
}
function pkDraw(){
  gx.setTransform(1,0,0,1,0,0);
  gx.clearRect(0,0,PKW,PKH);
  // 카메라 변환 적용
  gx.setTransform(pkCam.zoom,0,0,pkCam.zoom,pkCam.tx,pkCam.ty);
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
    const lbl=b.nm, fsz=lbl.length>=4?7:(lbl.length===3?8.5:10);
    gx.font='bold '+fsz+'px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=2.5;gx.strokeStyle='rgba(0,0,0,.7)';
    gx.strokeText(lbl,b.x,b.y);
    gx.fillStyle='#fff';gx.fillText(lbl,b.x,b.y);
  }
  // ===== 여기부터 화면 고정 UI (카메라 변환 해제) =====
  gx.setTransform(1,0,0,1,0,0);
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
  pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0}; // 카메라 초기화
  let last=performance.now();const t0=last;let first=true;
  const tick=now=>{
    const alive=pk.balls.filter(b=>!b.done).length;
    // 첫 프레임은 dt를 표준값으로 고정 (시작 시 느려지는 현상 방지)
    let dt=first?0.016:(now-last)/1000;first=false;
    dt=Math.min(0.032,dt);last=now;
    pkStep(dt/2);pkStep(dt/2);
    pkCamUpdate(dt);
    pkDraw();renderPkRank();
    // 마지막 1명이 남으면 질질 끌지 않고 종료 (그 1명이 당첨)
    if(alive>1&&now-t0<150000){gameAnim=requestAnimationFrame(tick);}
    else{
      const rem=pk.balls.filter(b=>!b.done);
      let w;
      if(rem.length===1){rem[0].done=true;pk.arrived.push(rem[0]);w=rem[0];}
      else{w=pk.arrived.at(-1)||(rem.length?rem[rem.length-1]:null);}
      renderPkRank(true);
      if(w){
        // 꽃가루
        for(let i=0;i<70;i++)pk.fx.push({type:'confetti',x:PKW/2+(Math.random()-.5)*PKW,y:-10-Math.random()*120,col:BRAND[i%BRAND.length],life:2.5,vy:0});
        let fl=performance.now();
        const fin=fn=>{
          const fdt=Math.min(0.032,(fn-fl)/1000);fl=fn;
          // 당첨 후 부드럽게 줌아웃
          pkCam.zoom+=(1-pkCam.zoom)*Math.min(1,fdt*4);
          pkCam.tx+=(0-pkCam.tx)*Math.min(1,fdt*4);
          pkCam.ty+=(0-pkCam.ty)*Math.min(1,fdt*4);
          pk.fx.forEach(f=>{if(f.type==='confetti'){f.y+=170*fdt;f.x+=Math.sin(f.y/22)*1.4;f.life-=fdt*0.7;}});
          pk.fx=pk.fx.filter(f=>f.life>0);
          pkDraw();
          gx.setTransform(1,0,0,1,0,0);
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

/* ===== ⚙ 설정 메뉴 + 🌗 테마 + ✉️ 의견 보내기 + 🧩 독 편집 ===== */
(function(){
  const dockEl=$('dock'), setBtn=$('setBtn'), setMenu=$('setMenu');
  if(!setBtn||!setMenu)return;

  /* --- 메뉴 토글 --- */
  function closeSet(){setMenu.classList.remove('on');}
  setBtn.addEventListener('click',e=>{
    e.stopPropagation();
    if(setMenu.classList.contains('on')){closeSet();return;}
    setMenu.classList.add('on');
    const r=setBtn.getBoundingClientRect(),mw=setMenu.offsetWidth,mh=setMenu.offsetHeight;
    let lx=r.right-mw; if(lx<8)lx=8;
    let ty=r.top-mh-8; if(ty<8)ty=r.bottom+8;
    setMenu.style.left=lx+'px'; setMenu.style.top=ty+'px';
  });
  document.addEventListener('click',e=>{
    if(setMenu.classList.contains('on')&&!setMenu.contains(e.target)&&!setBtn.contains(e.target))closeSet();
  });

  /* --- 🌗 테마 (독 중심) --- */
  function applyAlpha(a){ // a: 5~100 (100=불투명)
    document.documentElement.style.setProperty('--glass-alpha',(a/100).toFixed(2));
    document.body.classList.toggle('translucent',a<100);
    const gr=$('glassRange'); if(gr)gr.value=a;
  }
  function applyTheme(t){
    document.body.classList.toggle('light',t==='light');
    applyAlpha(parseInt(localStorage.getItem('cm_glass_alpha')||'100'));
  }
  applyTheme(localStorage.getItem('cm_theme')||'dark');
  function toggleTheme(){
    const next=document.body.classList.contains('light')?'dark':'light';
    localStorage.setItem('cm_theme',next);applyTheme(next);
    toast(next==='light'?'🌞 라이트 모드':'🌙 다크 모드');
  }
  if($('glassRange'))$('glassRange').addEventListener('input',e=>{
    const a=parseInt(e.target.value);
    localStorage.setItem('cm_glass_alpha',String(a));
    applyAlpha(a);
  });

  /* --- ✉️ 의견 보내기 --- */
  const fbModal=$('feedbackModal'),fbMsg=$('fbMsg'),fbContact=$('fbContact'),fbSend=$('fbSend'),fbStatus=$('fbStatus');
  const fbCard=fbModal.querySelector('.fb-card'),fbHead=fbModal.querySelector('.fb-head');
  const FEEDBACK_TO='ksh0502@nepes.co.kr'; // 메일 앱 폴백 수신처 (NEPES 회사메일; 차단 시 ksh0502@kocoa.or.kr 로 변경)
  function openFeedback(){
    fbStatus.textContent='';fbStatus.className='fb-status';fbSend.disabled=false;
    fbModal.classList.add('on');setIgnore(false);ipc.grabFocus&&ipc.grabFocus();
    // 독이 있는 모니터 중앙에 (멀티모니터 중간 걸침 방지)
    centerOnDockDisplay(fbCard);
    setTimeout(()=>fbMsg.focus(),60);
  }
  function closeFeedback(){fbModal.classList.remove('on');}
  $('fbClose').addEventListener('click',closeFeedback);
  $('fbCancel').addEventListener('click',closeFeedback);
  // 카드 어디를 잡아도 이동 (단, 입력칸·버튼 누를 땐 드래그 안 함 → 타이핑/클릭 정상)
  makeDrag(fbCard,(e,s)=>{
    if(!s){const r=fbCard.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    fbCard.style.left=(e.clientX-s.dx)+'px';fbCard.style.top=(e.clientY-s.dy)+'px';
  },e=>{const t=e.target;return t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='BUTTON'||t.id==='fbClose';});
  fbSend.addEventListener('click',async()=>{
    const message=fbMsg.value.trim();
    if(!message){fbStatus.className='fb-status err';fbStatus.textContent='내용을 입력해 주세요.';return;}
    const contact=fbContact.value.trim();
    fbSend.disabled=true;fbStatus.className='fb-status';fbStatus.textContent='보내는 중…';
    let meta='';try{const i=await ipc.getAppInfo();meta='v'+((i&&i.version)||'?');}catch(e){}
    let r=null;try{r=await ipc.feedback({message,contact,meta});}catch(e){r=null;}
    if(r&&r.ok){
      fbStatus.className='fb-status ok';fbStatus.textContent='접수되었습니다. 감사합니다! 🧡';
      fbMsg.value='';fbContact.value='';setTimeout(closeFeedback,1400);return;
    }
    // 서버 전송 실패 (오프라인 또는 워커 라우트 미배포)
    if(r&&r.status===0)fbStatus.textContent='인터넷 연결을 확인한 뒤 다시 보내 주세요.';
    else fbStatus.textContent='전송에 실패했어요. 잠시 후 다시 시도해 주세요.';
    fbStatus.className='fb-status err';fbSend.disabled=false;
  });

  /* --- 🧩 독 편집 (도구 표시/숨김 + 순서) --- */
  const TOOL_META={timer:'⏱ 타이머',game:'🎲 뽑기·게임',qr:'🔗 URL',pin:'📌 핀',memo:'📝 메모',ptr:'🎯 포인터',noise:'📢 소음',tools:'🧰 도구',draw:'✏️ 펜',exp:'📋 기록저장',pro:'🧡 Pro'};
  const ALL_IDS=Object.keys(TOOL_META);
  const drawer=$('dockDrawer'),hiddenBox=$('dockHidden');
  const toolBtn=id=>dockEl.querySelector('.tool[data-id="'+id+'"]');
  function loadCfg(){
    let order=[],hidden=[];
    try{order=JSON.parse(localStorage.getItem('cm_dock_order')||'[]');}catch(e){}
    try{hidden=JSON.parse(localStorage.getItem('cm_dock_hidden')||'[]');}catch(e){}
    if(!Array.isArray(order))order=[]; if(!Array.isArray(hidden))hidden=[];
    ALL_IDS.forEach(id=>{if(!order.includes(id))order.push(id);});
    return {order:order.filter(id=>ALL_IDS.includes(id)),hidden:hidden.filter(id=>ALL_IDS.includes(id))};
  }
  const saveCfg=(order,hidden)=>{localStorage.setItem('cm_dock_order',JSON.stringify(order));localStorage.setItem('cm_dock_hidden',JSON.stringify(hidden));};
  const currentOrder=()=>[...dockEl.querySelectorAll('.tool[data-id]')].map(b=>b.dataset.id);
  const currentHidden=()=>ALL_IDS.filter(id=>{const b=toolBtn(id);return b&&b.style.display==='none';});
  function applyCfg(){
    const {order,hidden}=loadCfg();
    order.forEach(id=>{const b=toolBtn(id);if(b)dockEl.insertBefore(b,setBtn);});
    ALL_IDS.forEach(id=>{const b=toolBtn(id);if(b)b.style.display=(id!=='pro'&&hidden.includes(id))?'none':'';}); // Pro는 항상 표시
  }
  function renderDrawer(){
    hiddenBox.innerHTML='';
    currentHidden().forEach(id=>{
      const m=TOOL_META[id],it=document.createElement('div');it.className='dd-item';
      it.innerHTML='<span class="em">'+m.split(' ')[0]+'</span>'+m.split(' ').slice(1).join(' ');
      it.addEventListener('click',()=>{const b=toolBtn(id);if(b)b.style.display='';saveCfg(currentOrder(),currentHidden());renderDrawer();});
      hiddenBox.appendChild(it);
    });
  }
  function addDx(){
    dockEl.querySelectorAll('.tool[data-id]').forEach(b=>{
      if(b.dataset.id==='pro')return; // Pro는 제거 불가
      if(b.querySelector('.dx'))return;
      const x=document.createElement('span');x.className='dx';x.textContent='×';
      x.addEventListener('click',ev=>{ev.stopPropagation();b.style.display='none';saveCfg(currentOrder(),currentHidden());renderDrawer();});
      b.appendChild(x);
    });
  }
  const removeDx=()=>dockEl.querySelectorAll('.tool .dx').forEach(x=>x.remove());
  let editing=false;
  function enterEdit(){
    if(typeof setPanel==='function')setPanel(null);
    editing=true;dockEditing=true;dockEl.classList.add('editing');addDx();renderDrawer();
    const r=dockEl.getBoundingClientRect();
    drawer.classList.add('on');
    drawer.style.left=Math.max(8,Math.min(r.left,innerWidth-drawer.offsetWidth-8))+'px';
    drawer.style.top=(r.bottom+10)+'px';
    setIgnore(false);
  }
  function exitEdit(){
    editing=false;dockEditing=false;dockEl.classList.remove('editing');removeDx();drawer.classList.remove('on');
    saveCfg(currentOrder(),currentHidden());toast('🧩 독 편집을 저장했어요');
  }
  $('dockDone').addEventListener('click',exitEdit);
  // 편집 중 도구 클릭은 원래 동작(패널 열기) 대신 무시
  dockEl.addEventListener('click',e=>{
    if(!editing)return;
    const t=e.target.closest('.tool[data-id]');
    if(t&&!e.target.classList.contains('dx')){e.stopPropagation();e.preventDefault();}
  },true);
  // 드래그로 순서 변경 — document 리스너 + FLIP (캡처/커서-지오메트리 의존 제거)
  let dragEl=null,dragMove=null,dragUp=null;
  function reorderAt(clientX){
    if(!dragEl)return;
    const sibs=[...dockEl.querySelectorAll('.tool[data-id]')].filter(b=>b!==dragEl&&b.style.display!=='none');
    let target=setBtn;
    for(const b of sibs){const r=b.getBoundingClientRect();if(clientX<r.left+r.width/2){target=b;break;}}
    if(dragEl.nextElementSibling===target)return; // 위치 변화 없음 (요소 기준 — 공백 텍스트노드 무시)
    // FLIP: 이동하는 형제들을 부드럽게 슬라이드
    const others=[...dockEl.querySelectorAll('.tool[data-id]')].filter(b=>b!==dragEl);
    const firsts=new Map(others.map(b=>[b,b.getBoundingClientRect().left]));
    dockEl.insertBefore(dragEl,target);
    others.forEach(b=>{
      const dx=firsts.get(b)-b.getBoundingClientRect().left;
      if(dx){b.style.transition='none';b.style.transform='translateX('+dx+'px)';
        requestAnimationFrame(()=>{b.style.transition='transform .22s cubic-bezier(.2,.8,.2,1)';b.style.transform='';});}
    });
  }
  dockEl.addEventListener('pointerdown',e=>{
    if(!editing)return;
    const t=e.target.closest('.tool[data-id]');
    if(!t||e.target.classList.contains('dx'))return;
    e.preventDefault();
    dragEl=t;t.classList.add('dragging');
    dragMove=ev=>reorderAt(ev.clientX);
    dragUp=()=>{
      document.removeEventListener('pointermove',dragMove);
      document.removeEventListener('pointerup',dragUp);
      document.removeEventListener('pointercancel',dragUp);
      if(dragEl){
        dragEl.classList.remove('dragging');
        dockEl.querySelectorAll('.tool[data-id]').forEach(b=>{b.style.transition='';b.style.transform='';});
        saveCfg(currentOrder(),currentHidden());renderDrawer();dragEl=null;
      }
    };
    document.addEventListener('pointermove',dragMove);
    document.addEventListener('pointerup',dragUp);
    document.addEventListener('pointercancel',dragUp);
  });

  /* --- 💾 설정·명단 백업 (내보내기/가져오기) --- */
  const BK_KEYS=['cm_rosters','cm_dock_order','cm_dock_hidden','cm_theme','cm_glass_alpha','cm_shortcuts','su_keys','noise_guide_seen'];
  const bkModal=$('backupModal'),bkCard=bkModal?bkModal.querySelector('.bk-card'):null;
  function bkSay(msg,good){const s=$('bkStatus');if(!s)return;s.textContent=msg||'';s.className='bk-status'+(good===true?' ok':good===false?' err':'');}
  function openBackup(){if(!bkModal)return;bkSay('');bkModal.classList.add('on');setIgnore(false);centerOnDockDisplay(bkCard);}
  function closeBackup(){if(bkModal)bkModal.classList.remove('on');}
  if(bkModal){
    $('bkClose').addEventListener('click',closeBackup);
    makeDrag(bkModal.querySelector('.bk-head'),(e,s)=>{
      if(!s){const r=bkCard.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      bkCard.style.left=(e.clientX-s.dx)+'px';bkCard.style.top=(e.clientY-s.dy)+'px';
    },e=>e.target.id==='bkClose');
    $('bkExport').addEventListener('click',async()=>{
      const out={app:'ClassMate',type:'backup',v:1,date:new Date().toISOString(),data:{}};
      BK_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!=null)out.data[k]=v;});
      const json=JSON.stringify(out,null,2);
      const bytes=Array.from(new TextEncoder().encode(json));
      const now=new Date();
      const fn='ClassMate_백업_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'.json';
      const r=await ipc.saveBinary({bytes,filename:fn,ext:'json'});
      if(r&&r.ok)bkSay('내보내기 완료 — 안전한 곳에 보관하세요.',true);
      else if(r&&r.canceled)bkSay('');
      else bkSay('저장에 실패했어요.',false);
    });
    $('bkImport').addEventListener('click',async()=>{
      const f=await ipc.pickBackup();
      if(!f)return;
      let obj=null;
      try{obj=JSON.parse(f.text.replace(/^\uFEFF/,''));}catch(e){bkSay('백업 파일을 읽을 수 없어요(형식 오류).',false);return;}
      if(!obj||obj.app!=='ClassMate'||!obj.data){bkSay('ClassMate 백업 파일이 아니에요.',false);return;}
      let n=0;
      BK_KEYS.forEach(k=>{if(typeof obj.data[k]==='string'){localStorage.setItem(k,obj.data[k]);n++;}});
      try{applyTheme(localStorage.getItem('cm_theme')||'dark');}catch(e){} // 테마 즉시 반영
      try{applyCfg();}catch(e){}                                          // 독 구성 즉시 반영
      bkSay('복원 완료 — '+n+'개 항목을 불러왔어요. 🧡',true);
      toast('💾 백업을 복원했어요');
    });
  }

  /* --- ⌨️ 단축키 설정 --- */
  const SC_DEFS=[
    ['hk-draw','✏️ 펜','Control+Alt+P'],
    ['hk-ring','🎯 링 포인터','Control+Alt+R'],
    ['hk-spot','🔦 스포트라이트','Control+Alt+O'],
    ['hk-lens','🔍 돋보기','Control+Alt+L'],
    ['hk-snip','📷 영역 캡처','Control+Alt+S'],
    ['hk-dock','📌 툴바 표시/숨김','Control+Alt+`'],
    ['hk-escape','⛔ 모두 끄기','Control+Alt+0'],
  ];
  const scModal=$('scModal'),scCard=scModal?scModal.querySelector('.sc-card'):null;
  let scCustom=JSON.parse(localStorage.getItem('cm_shortcuts')||'{}');
  const scEff=ch=>scCustom[ch]||(SC_DEFS.find(d=>d[0]===ch)||[])[2]||'';
  const scPretty=a=>a.replace('Control','Ctrl').replace('Super','Win').replace(/\+/g,' + ');
  function scApply(){try{ipc.setShortcuts(scCustom);}catch(e){}}
  scApply(); // 로드 시 저장된 사용자 단축키 적용
  let scCapturing=null;
  function scRender(){
    const list=$('scList'); if(!list)return; list.innerHTML='';
    SC_DEFS.forEach(([ch,lab])=>{
      const row=document.createElement('div');row.className='sc-item';
      row.innerHTML='<span class="sc-lab">'+lab+'</span><span class="sc-key">'+scPretty(scEff(ch))+'</span><button class="sc-chg">변경</button>';
      const keyEl=row.querySelector('.sc-key'),btn=row.querySelector('.sc-chg');
      btn.addEventListener('click',()=>scCapture(ch,keyEl,btn));
      list.appendChild(row);
    });
  }
  function scCapture(ch,keyEl,btn){
    if(scCapturing)scCapturing.cancel();
    keyEl.classList.add('capturing');keyEl.textContent='키 입력…';btn.textContent='취소';
    const onKey=e=>{
      e.preventDefault();e.stopPropagation();
      if(e.key==='Escape'){done();return;}
      if(['Control','Alt','Shift','Meta'].includes(e.key))return; // 보조키 단독 무시
      const mods=[];if(e.ctrlKey)mods.push('Control');if(e.altKey)mods.push('Alt');if(e.shiftKey)mods.push('Shift');if(e.metaKey)mods.push('Super');
      let k=e.key;
      if(k===' ')k='Space';else if(/^[a-z]$/i.test(k))k=k.toUpperCase();else if(k.startsWith('Arrow'))k=k.replace('Arrow','');
      const isF=/^F\d{1,2}$/.test(k);
      if(!isF&&mods.length===0){keyEl.textContent='보조키 필요(Ctrl/Alt…)';return;}
      const acc=[...mods,k].join('+');
      scCustom[ch]=acc;localStorage.setItem('cm_shortcuts',JSON.stringify(scCustom));scApply();
      done();scRender();toast('⌨️ 저장됨: '+scPretty(acc));
    };
    function done(){document.removeEventListener('keydown',onKey,true);keyEl.classList.remove('capturing');keyEl.textContent=scPretty(scEff(ch));btn.textContent='변경';scCapturing=null;}
    scCapturing={cancel:done};
    document.addEventListener('keydown',onKey,true);
  }
  function openShortcuts(){if(!scModal)return;scRender();scModal.classList.add('on');setIgnore(false);centerOnDockDisplay(scCard);}
  function closeShortcuts(){if(scCapturing)scCapturing.cancel();if(scModal)scModal.classList.remove('on');}
  if(scModal){
    $('scClose').addEventListener('click',closeShortcuts);
    makeDrag(scModal.querySelector('.bk-head'),(e,s)=>{
      if(!s){const r=scCard.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      scCard.style.left=(e.clientX-s.dx)+'px';scCard.style.top=(e.clientY-s.dy)+'px';
    },e=>e.target.id==='scClose');
    $('scReset').addEventListener('click',()=>{scCustom={};localStorage.removeItem('cm_shortcuts');scApply();scRender();toast('⌨️ 기본값으로 되돌렸어요');});
  }

  /* --- 메뉴 액션 --- */
  setMenu.addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    closeSet();
    if(b.dataset.act==='theme')toggleTheme();
    else if(b.dataset.act==='dockedit')enterEdit();
    else if(b.dataset.act==='shortcuts')openShortcuts();
    else if(b.dataset.act==='backup')openBackup();
    else if(b.dataset.act==='feedback')openFeedback();
  });

  /* --- Esc 로 닫기 --- */
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(scModal&&scModal.classList.contains('on')){closeShortcuts();}
    else if(bkModal&&bkModal.classList.contains('on')){closeBackup();}
    else if(fbModal.classList.contains('on')){closeFeedback();}
    else if(setMenu.classList.contains('on')){closeSet();}
    else if(editing){exitEdit();}
  });

  applyCfg();
})();
