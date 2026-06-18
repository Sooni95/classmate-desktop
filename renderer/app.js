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
  const place=()=>{
    const d = dockDisp();
    el.style.left = Math.max(d.x + 8, d.x + (d.w - el.offsetWidth) / 2) + 'px';
    el.style.top = Math.max(d.y + 8, d.y + (d.h - el.offsetHeight) / 2) + 'px';
  };
  place();
  requestAnimationFrame(place); // 렌더 후 크기 확정되면 재배치 (모니터 사이 걸침 방지)
}

/* ===== 클릭 통과(click-through) 관리 ===== */
let ignoring = true;
function setIgnore(v){ if(ignoring!==v){ ignoring=v; window.cm.setIgnore(v); } }
document.addEventListener('mousemove', e => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const overUI = !!(el && el.closest('.iv'));
  // 포인터(링/스포트/렌즈)·펜 모드일 때 독·툴바 위에서는 커스텀 포인터를 숨겨 시스템 커서가 보이게
  document.body.classList.toggle('ptr-over-ui', overUI && (PS.ring || PS.spot>0 || lensOn || drawMode));
  if (drawMode || lensOn || snipOn || PS.spot>0 || PS.ring) { setIgnore(false); trackPtr(e); return; }
  setIgnore(!overUI);
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
      const r=await window.cm.aiProxy({prompt,system,proKey,max_tokens});
      if(r.ok)return r;
      // 프록시 실패 시 개인키로 폴백 (있으면)
    }
  }
  const key=localStorage.getItem('ai_key')||'';
  if(!key)return {ok:false,message:'NO_KEY'};
  return await window.cm.aiChat({prompt,system,apiKey:key});
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
      const r=await window.cm.sttProxy({bytes:Array.from(new Uint8Array(buf)),proKey});
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
$('aiCopy').addEventListener('click',()=>{window.cm.copyText($('aiOut').textContent);toast('📋 복사됨');});
$('aiSave').addEventListener('click',async()=>{
  const q=$('aiIn').value.trim();
  const a=$('aiOut').textContent;
  if(!a){toast('저장할 답변이 없어요');return;}
  const content='[질문]\n'+q+'\n\n[AI 답변]\n'+a+'\n\n— ClassMate AI 교수보조';
  const now=new Date();
  const stamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
  const r=await window.cm.saveText({text:content,filename:'AI보조_'+stamp+'.txt'});
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
      const r=await window.cm.saveImage({dataURL:cv.toDataURL('image/png'),filename:base+'.png'});
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
      const r=await window.cm.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:base+'.pdf',ext:'pdf'});
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
  const r=await window.cm.verifyPro({key});
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
  const r=await window.cm.saveTemplate();
  if(r&&r.ok)toast('📥 양식을 저장했어요');
});
const rmDrop=$('rmDrop');
$('rmPick').addEventListener('click',e=>{e.stopPropagation();$('rmFile').click();});
rmDrop.addEventListener('click',()=>$('rmFile').click());
$('rmFile').addEventListener('change',e=>{if(e.target.files[0])parseRosterFile(e.target.files[0]);});
['dragenter','dragover'].forEach(ev=>rmDrop.addEventListener(ev,e=>{e.preventDefault();rmDrop.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>rmDrop.addEventListener(ev,e=>{e.preventDefault();rmDrop.classList.remove('drag');}));
rmDrop.addEventListener('drop',e=>{
  const f=e.dataTransfer.files[0];
  if(f)parseRosterFile(f);
});
function parseRosterFile(file){
  const name=file.name.toLowerCase();
  if(!/\.(xlsx|xls|csv)$/.test(name)){toast('xlsx 또는 csv 파일을 올려주세요');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
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
      if(!$('rmName').value)$('rmName').value=file.name.replace(/\\.(xlsx|xls|csv)$/i,'');
    }catch(err){toast('파일을 읽지 못했어요: '+err.message);}
  };
  reader.readAsArrayBuffer(file);
}

// 구독 안내 받기 → Google Forms (기본 브라우저에서 열기)
const PRO_FORM_URL='https://forms.gle/ZK8hxnx65injpK3R8';
$('proCta').addEventListener('click',()=>{
  proWrap.classList.remove('on');
  window.cm.openExternal(PRO_FORM_URL);
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
    const info=await window.cm.getAppInfo();
    const ver='v'+info.version;
    $('dockVer').textContent=ver;
    $('dockVer').title='ClassMate '+ver+(info.buildDate&&info.buildDate!=='개발 빌드'?(' (빌드: '+info.buildDate+')'):'');
    $('pillVer').textContent=ver;
  }catch(e){}
})();
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
$('quitBtn').addEventListener('click',()=>window.cm.hideToTray());
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
// 이름 분리: 줄바꿈 + 콤마(,， 둘 다) 인식
function splitNames(str){return (str||'').split(/[\n,，]/).map(s=>s.trim()).filter(Boolean);}
function loadN(){orig=splitNames($('nameList').value);pool=[...orig];}
function candidates(){loadIfStale();return $('noRep').checked?pool:orig;}
function loadIfStale(){ // textarea 변경분 반영하되 pool 유지
  const cur=splitNames($('nameList').value);
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
  const names=splitNames($('tNames').value);
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
  gameWrap.classList.add('on');
  centerOnDockDisplay(gameWrap);
  if(mode==='wheel')drawWheel(src,0);else{pk=pkInit(src);pkDraw();}
}
function closeGame(){cancelAnimationFrame(gameAnim);gameWrap.classList.remove('on');gameMode=null;}
$('gameClose').addEventListener('click',closeGame);
/* ===== 게이미피케이션 런처 ===== */
function gShowCfg(id){
  ['cfgPick','cfgDraw','cfgWheel','cfgPk','cfgLadder'].forEach(c=>$(c).classList.remove('on'));
  ['gcPick','gcDraw','gcWheel','gcPk','gcScore','gcDice','gcLight','gcShade','gcLadder'].forEach(c=>$(c)&&$(c).classList.remove('on'));
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
$('gcLadder').addEventListener('click',()=>{gShowCfg('gcLadder');$('cfgLadder').classList.add('on');});

/* ===== 입력 모달 (Electron prompt 대체) ===== */
let _askCb=null;
function askInput(label,initial,cb){
  $('imLabel').textContent=label;
  $('imInput').value=initial||'';
  _askCb=cb;
  $('inputModal').classList.add('on');
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

/* ===== 사다리타기 ===== */
const ladderWrap=$('ladderWrap'),lcv=$('ladderCv'),lx=lcv.getContext('2d');
let ladder=null,ladderBusy=false,ladderEditMode=false;
const LCOL=['#F68C1F','#5b8def','#37c871','#e84d3d','#a78bfa','#ffc02e','#4dd0e1','#ff8a65','#ba68c8','#aed581'];
makeDrag($('ladderHead'),(e,s)=>{
  if(!s){const r=ladderWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  ladderWrap.style.left=(e.clientX-s.dx)+'px';ladderWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='ladderClose');
$('ladderClose').addEventListener('click',()=>{ladderWrap.classList.remove('on');cancelAnimationFrame(gameAnim);ladderBusy=false;});
$('ladderReset').addEventListener('click',()=>buildLadder(true)); // 사다리 새로 (이름/결과 유지)
$('ladderStart').addEventListener('click',()=>runLadderAll());
$('ladderEdit').addEventListener('click',()=>{
  ladderEditMode=!ladderEditMode;
  $('ladderEdit').classList.toggle('on',ladderEditMode);
  $('ladderEdit').textContent=ladderEditMode?'✏️ 편집중':'✏️ 편집';
  $('ladderResult').textContent=ladderEditMode
    ?'편집 모드 — 칸을 클릭해 이름·결과 입력 (Enter 확정)'
    :'이름이나 결과를 클릭하면 그 줄만 따라가요 · [사다리 시작]은 전체';
});
$('ladderOpen').addEventListener('click',()=>{
  ladderWrap.classList.add('on');centerOnDockDisplay(ladderWrap);buildLadder(false);
});
function buildLadder(keep){
  cancelAnimationFrame(gameAnim);ladderBusy=false;$('ladderStart').disabled=false; // ★ 멈춤 상태 초기화 (재시작 안 되던 버그)
  const useRoster=$('ladderUseRoster')&&$('ladderUseRoster').checked;
  let rosterNames=[];
  if(useRoster){rosterNames=splitNames($('nameList').value);}
  const n=useRoster&&rosterNames.length?Math.min(10,rosterNames.length):Math.min(10,Math.max(2,parseInt($('ladderCnt').value)||4));
  const auto=$('ladderAuto').checked;
  let tops,bottoms;
  if(keep&&ladder&&ladder.n===n){tops=ladder.tops.slice();bottoms=ladder.bottoms.slice();}
  else{
    tops=useRoster&&rosterNames.length?rosterNames.slice(0,n):Array.from({length:n},()=>'');
    while(tops.length<n)tops.push('');
    bottoms=auto?makeAutoResults(n):Array.from({length:n},()=>'');
  }
  // 사다리 가로줄 무작위 (매번 새로)
  const ROWS=Math.max(8,n+5);
  const rungs=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<n-1;c++){
    if(Math.random()<0.36&&!rungs.some(x=>x.row===r&&(x.col===c-1||x.col===c+1)))rungs.push({row:r,col:c});
  }
  lcv.width=Math.min(680,Math.max(420,n*96));lcv.height=480;
  ladder={tops,bottoms,n,ROWS,rungs,auto,results:null,revealed:false};
  $('ladderInfo').textContent=n+'명';
  $('ladderResult').textContent=ladderEditMode
    ?'편집 모드 — 칸을 클릭해 이름·결과 입력 (Enter 확정)'
    :'이름이나 결과를 클릭하면 그 줄만 따라가요 · [사다리 시작]은 전체';
  drawLadder();
}
function makeAutoResults(n){return Array.from({length:n},(_,i)=>i===0?'🎉당첨':'꽝').sort(()=>Math.random()-.5);}
function ladderX(c){return lcv.width/(ladder.n+1)*(c+1);}
function ladderTopY(){return 98;}
function ladderBotY(){return lcv.height-98;}
function ladderY(r){return ladderTopY()+r*(ladderBotY()-ladderTopY())/(ladder.ROWS-1);}
function rrect(x,y,w,h,r){lx.beginPath();lx.moveTo(x+r,y);lx.arcTo(x+w,y,x+w,y+h,r);lx.arcTo(x+w,y+h,x,y+h,r);lx.arcTo(x,y+h,x,y,r);lx.arcTo(x,y,x+w,y,r);lx.closePath();}
function drawChip(x,yc,text,o){
  o=o||{};const w=80,h=33;
  rrect(x-w/2,yc-h/2,w,h,10);lx.fillStyle=o.fill||'#1e2935';lx.fill();
  lx.setLineDash(o.dash?[4,3]:[]);
  lx.lineWidth=o.focus?3:2;lx.strokeStyle=o.stroke||'#39485a';lx.stroke();lx.setLineDash([]);
  lx.fillStyle=o.text||'#e7edf3';
  lx.font='bold 12.5px "Malgun Gothic"';lx.textAlign='center';lx.textBaseline='middle';
  lx.fillText(text,x,yc+0.5);
}
// focus={start:Set, end:Set} 가 있으면 그 줄만 또렷하게, 나머지는 흐리게
function drawLadder(highlights,focus){
  const W=lcv.width,H=lcv.height,{n,rungs,tops,bottoms}=ladder;
  const bg=lx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#141b22');bg.addColorStop(1,'#0e1318');
  lx.fillStyle=bg;lx.fillRect(0,0,W,H);
  const dim=!!focus;
  lx.lineCap='round';
  // 세로 레일
  for(let c=0;c<n;c++){
    const active=focus&&(focus.start.has(c)||focus.end.has(c));
    lx.globalAlpha=dim&&!active?0.16:1;
    lx.strokeStyle='#46586b';lx.lineWidth=4;
    lx.beginPath();lx.moveTo(ladderX(c),ladderTopY());lx.lineTo(ladderX(c),ladderBotY());lx.stroke();
  }
  // 가로 막대 (시작/추적 전에는 숨김 — 미리 경로가 보이면 재미 없음)
  if(ladder.revealed){
    lx.globalAlpha=dim?0.16:1;lx.strokeStyle='#46586b';lx.lineWidth=4;
    rungs.forEach(rg=>{lx.beginPath();lx.moveTo(ladderX(rg.col),ladderY(rg.row));lx.lineTo(ladderX(rg.col+1),ladderY(rg.row));lx.stroke();});
    lx.globalAlpha=1;
  }
  // 강조 경로 (은은한 글로우)
  if(highlights)highlights.forEach(hl=>{
    lx.save();
    lx.strokeStyle=hl.col;lx.lineWidth=5;lx.lineCap='round';lx.lineJoin='round';
    lx.shadowColor=hl.col;lx.shadowBlur=12;
    lx.beginPath();hl.path.forEach((p,i)=>{const px=ladderX(p.col);if(i===0)lx.moveTo(px,p.y);else lx.lineTo(px,p.y);});lx.stroke();
    lx.restore();
  });
  // 상단 이름 칩
  for(let c=0;c<n;c++){
    const empty=!tops[c],active=!focus||focus.start.has(c);
    lx.globalAlpha=dim&&!active?0.3:1;
    drawChip(ladderX(c),ladderTopY()-34,tops[c]||'이름?',empty
      ?{fill:'#241a10',stroke:'#F68C1F',text:'#F68C1F',dash:true}
      :{fill:'#1e2935',stroke:'#39485a',text:'#e7edf3',focus:focus&&focus.start.has(c)});
  }
  // 하단 결과 칩
  for(let c=0;c<n;c++){
    const empty=!bottoms[c],active=!focus||focus.end.has(c);
    const isHit=(bottoms[c]||'').includes('당첨')||(bottoms[c]||'').includes('🎉');
    const lit=isHit||(focus&&focus.end.has(c));
    lx.globalAlpha=dim&&!active?0.3:1;
    drawChip(ladderX(c),ladderBotY()+34,bottoms[c]||'결과?',empty
      ?{fill:'#241a10',stroke:'#F68C1F',text:'#F68C1F',dash:true}
      :(lit?{fill:'#F68C1F',stroke:'#F68C1F',text:'#fff',focus:focus&&focus.end.has(c)}
           :{fill:'#1e2935',stroke:'#39485a',text:'#e7edf3'}));
  }
  lx.globalAlpha=1;
}
// 경로 계산 (위 c → 아래)
function pathFor(startCol){
  const{ROWS,rungs}=ladder;let col=startCol;
  const path=[{col,y:ladderTopY()-17}];
  path.push({col,y:ladderTopY()});
  for(let r=0;r<ROWS;r++){
    const y=ladderY(r);
    const left=rungs.find(x=>x.row===r&&x.col===col-1);
    const right=rungs.find(x=>x.row===r&&x.col===col);
    if(right){path.push({col,y});col++;path.push({col,y});}
    else if(left){path.push({col,y});col--;path.push({col,y});}
  }
  path.push({col,y:ladderBotY()});
  path.push({col,y:ladderBotY()+17});
  return {endCol:col,path};
}
// 칸 클릭: 위/아래 입력
function ladderEditAt(c,kind){
  const rect=lcv.getBoundingClientRect();
  const sx=rect.left+ladderX(c)*(rect.width/lcv.width);
  const sy=rect.top+(kind==='top'?(ladderTopY()-34):(ladderBotY()+34))*(rect.height/lcv.height);
  const inp=document.createElement('input');
  inp.type='text';inp.maxLength=6;inp.className='ladder-edit iv';
  inp.value=(kind==='top'?ladder.tops[c]:ladder.bottoms[c])||'';
  inp.style.cssText=`position:fixed;left:${sx-40}px;top:${sy-16}px;width:80px;height:32px;z-index:200;text-align:center;font-weight:700;border:2px solid #F68C1F;border-radius:9px;background:#fff;color:#222;font-family:inherit;font-size:13px;`;
  document.body.appendChild(inp);
  inp.focus();inp.select();
  const commit=()=>{
    const v=inp.value.trim().slice(0,6);
    if(kind==='top')ladder.tops[c]=v;else ladder.bottoms[c]=v;
    ladder.results=null;drawLadder();
    if(inp.parentNode)inp.remove();
  };
  inp.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ev.preventDefault();commit();}
    else if(ev.key==='Escape'){ev.preventDefault();inp.remove();}
  });
  inp.addEventListener('blur',commit);
}
function ladderHit(e){
  const rect=lcv.getBoundingClientRect();
  const cx=(e.clientX-rect.left)*(lcv.width/rect.width);
  const cy=(e.clientY-rect.top)*(lcv.height/rect.height);
  for(let c=0;c<ladder.n;c++){
    if(Math.abs(cx-ladderX(c))<46){
      if(cy<ladderTopY())return {c,kind:'top'};
      if(cy>ladderBotY())return {c,kind:'bottom'};
    }
  }
  return null;
}
lcv.addEventListener('click',e=>{
  if(!ladder||ladderBusy)return;
  const hit=ladderHit(e);if(!hit)return;
  // [편집] 켜져 있으면 입력, 아니면 클릭한 블록의 줄만 색을 따라 이동
  if(ladderEditMode){ladderEditAt(hit.c,hit.kind);return;}
  traceOne(hit.c,hit.kind);
});
// 한 줄만 추적 (이름 클릭=아래로, 결과 클릭=위로)
function traceOne(col,kind){
  if(ladderBusy)return;
  if(ladder.auto&&ladder.bottoms.every(b=>!b))ladder.bottoms=makeAutoResults(ladder.n);
  let startCol,endCol,path;
  if(kind==='top'){startCol=col;const r=pathFor(col);endCol=r.endCol;path=r.path;}
  else{ // 결과에서 위로 거슬러: 이 결과로 도착하는 출발칸 찾기
    let s=col;for(let c=0;c<ladder.n;c++){if(pathFor(c).endCol===col){s=c;break;}}
    startCol=s;const r=pathFor(s);endCol=r.endCol;path=r.path.slice().reverse();
  }
  animatePaths([{startCol,endCol,path,col:LCOL[startCol%LCOL.length]}],true);
}
// 공통 애니메이션 (single=true면 그 줄만 또렷)
function animatePaths(paths,single){
  cancelAnimationFrame(gameAnim);
  ladder.revealed=true; // 이제 가로줄도 보이게
  ladderBusy=true;$('ladderStart').disabled=true;
  const focus=single?{start:new Set(paths.map(p=>p.startCol)),end:new Set(paths.map(p=>p.endCol))}:null;
  let prog=0;const SPEED=single?1.4:0.9;let last=performance.now();
  const step=now=>{
    const dt=Math.min(0.05,(now-last)/1000);last=now;prog+=dt*SPEED;
    const hls=paths.map(pp=>{
      const total=pp.path.length-1,upto=Math.min(total,prog*total);
      const seg=Math.floor(upto),frac=upto-seg;
      const drawn=pp.path.slice(0,seg+1).map(p=>({col:p.col,y:p.y}));
      if(seg<total){const a=pp.path[seg],b=pp.path[seg+1];drawn.push({col:a.col+(b.col-a.col)*frac,y:a.y+(b.y-a.y)*frac});}
      return {col:pp.col,path:drawn};
    });
    drawLadder(hls,focus);
    if(prog<1){gameAnim=requestAnimationFrame(step);}
    else{
      ladderBusy=false;$('ladderStart').disabled=false;
      drawLadder(paths.map(pp=>({col:pp.col,path:pp.path})),focus);
      const res=paths.map(pp=>'<span style="display:inline-block;margin:2px 7px;white-space:nowrap"><b>'+(ladder.tops[pp.startCol]||('참가'+(pp.startCol+1)))+'</b> → <b style="color:#F68C1F">'+(ladder.bottoms[pp.endCol]||'?')+'</b></span>');
      $('ladderResult').innerHTML=res.join('');
      beep();
    }
  };
  gameAnim=requestAnimationFrame(step);
}
// 시작: 전원 동시에
function runLadderAll(){
  if(!ladder||ladderBusy)return;
  if(ladder.auto&&ladder.bottoms.every(b=>!b))ladder.bottoms=makeAutoResults(ladder.n);
  const paths=[];for(let c=0;c<ladder.n;c++){const{endCol,path}=pathFor(c);paths.push({startCol:c,endCol,path,col:LCOL[c%LCOL.length]});}
  animatePaths(paths,false);
}

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

/* --- 가리개 (커튼형) --- */
const shadeWrap=$('shadeWrap'),shadePanel=$('shadePanel');
function openShade(){
  setPanel(null);
  shadeWrap.classList.add('on');setIgnore(false);
}
$('shadeClose').addEventListener('click',()=>shadeWrap.classList.remove('on'));
// 바(상단)로 이동
makeDrag($('shadeBar'),(e,s)=>{
  if(!s){const r=shadePanel.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  shadePanel.style.left=(e.clientX-s.dx)+'px';shadePanel.style.top=(e.clientY-s.dy)+'px';
  shadePanel.style.right='auto';shadePanel.style.bottom='auto';
},e=>e.target.id==='shadeClose');
// 8방향 모서리로 자유 리사이즈
shadePanel.querySelectorAll('.sh-rz').forEach(rz=>{
  const dir=[...rz.classList].find(c=>c.startsWith('sh-')&&c!=='sh-rz').slice(3); // n,s,e,w,ne...
  makeDrag(rz,(e,s)=>{
    const r=shadePanel.getBoundingClientRect();
    if(!s)return{x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height};
    let{l,t,w,h}=s;const dx=e.clientX-s.x,dy=e.clientY-s.y;
    if(dir.includes('e'))w=Math.max(80,s.w+dx);
    if(dir.includes('s'))h=Math.max(60,s.h+dy);
    if(dir.includes('w')){w=Math.max(80,s.w-dx);l=s.l+(s.w-w);}
    if(dir.includes('n')){h=Math.max(60,s.h-dy);t=s.t+(s.h-h);}
    shadePanel.style.left=l+'px';shadePanel.style.top=t+'px';
    shadePanel.style.right='auto';shadePanel.style.bottom='auto';
    shadePanel.style.width=w+'px';shadePanel.style.height=h+'px';
  });
});

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
    gx.font='bold 10px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=2.5;gx.strokeStyle='rgba(0,0,0,.65)';
    gx.strokeText(b.nm.slice(0,2),b.x,b.y);
    gx.fillStyle='#fff';gx.fillText(b.nm.slice(0,2),b.x,b.y);
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
    const scale=alive===1?0.5:1;            // 마지막 1개 → 슬로모션
    // 첫 프레임은 dt를 표준값으로 고정 (시작 시 느려지는 현상 방지)
    let dt=first?0.016:(now-last)/1000;first=false;
    dt=Math.min(0.032,dt)*scale;last=now;
    pkStep(dt/2);pkStep(dt/2);
    pkCamUpdate(dt/scale);                   // 카메라는 실제 시간 기준
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
$('trCopy').addEventListener('click',()=>{window.cm.copyText($('trOut').innerText);toast('📋 복사됨');});

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
  else if(res.status===0){suSay((res.message&&res.message.startsWith('NET:'))?('서버 연결 실패: '+res.message.slice(4)):'인터넷 연결을 확인하세요');}
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
    const r=await window.cm.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:fn});
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
      <button class="fbtn" id="mCopy" title="클립보드로 복사">📋</button>
      <button class="fbtn" id="mSave" title="txt 파일로 저장">💾</button>
      <button class="fbtn" id="mMic" title="음성 녹음">🎤</button>
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

/* ===== 핀 — 핀 위 메모(캡션) + 카메라/영상 + 저장 ===== */
function addPin(src,label,x,y,w,isVideo){
  const p=document.createElement('div');p.className='pin iv';
  const d=dockDisp();
  p.style.cssText=`left:${x??(d.x+200+Math.random()*160)}px;top:${y??(d.y+110+Math.random()*120)}px;width:${w??280}px;`;
  const media=isVideo
    ? `<video src="${src}" loop autoplay muted draggable="false" style="width:100%;display:block;border-radius:0 0 2px 2px;cursor:pointer;"></video>`
    : `<img src="${src}" draggable="false">`;
  const vidCtrls=isVideo
    ? `<button class="vplay" title="재생/일시정지">⏸</button><button class="vloop on" title="무한반복">🔁</button>`
    : '';
  p.innerHTML=`<div class="pb"><span class="lbl">📌 ${label||'핀'}</span><span style="display:flex;align-items:center;gap:5px">${vidCtrls}<button class="cap" title="핀 메모">✎</button><button class="psave" title="저장">💾</button><input type="range" min="25" max="100" value="100" title="투명도"><button class="x">×</button></span></div>${media}<div class="pcap" contenteditable="true"></div><div class="rs"></div>`;
  document.body.appendChild(p);
  p.dataset.video=isVideo?'1':'';
  p._src=src;
  p.querySelector('.x').addEventListener('click',()=>p.remove());
  if(isVideo){
    const vid=p.querySelector('video'),playBtn=p.querySelector('.vplay'),loopBtn=p.querySelector('.vloop');
    vid.muted=false; // 녹화엔 소리 없지만 재생은 자유
    const sync=()=>playBtn.textContent=vid.paused?'▶':'⏸';
    playBtn.addEventListener('click',()=>{vid.paused?vid.play():vid.pause();sync();});
    vid.addEventListener('click',()=>{vid.paused?vid.play():vid.pause();sync();});
    vid.addEventListener('play',sync);vid.addEventListener('pause',sync);
    loopBtn.addEventListener('click',()=>{
      vid.loop=!vid.loop;loopBtn.classList.toggle('on',vid.loop);
      toast(vid.loop?'🔁 무한반복 켜짐':'무한반복 꺼짐');
      if(vid.loop&&vid.paused)vid.play();
    });
    vid.addEventListener('ended',()=>{if(!vid.loop)sync();});
  }
  const capBtn=p.querySelector('.cap'),capEl=p.querySelector('.pcap');
  capBtn.addEventListener('click',()=>{
    capEl.classList.toggle('on');capBtn.classList.toggle('on');
    if(capEl.classList.contains('on'))capEl.focus();
  });
  // 저장: 영상은 영상파일로, 이미지는 메모(캡션) 합성해서 PNG로
  p.querySelector('.psave').addEventListener('click',()=>savePin(p,isVideo,capEl));
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
// 핀 저장: 이미지는 캡션 메모를 아래 붙여 PNG 합성, 영상은 webm 저장
async function savePin(p,isVideo,capEl){
  const now=new Date();
  const stamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
  if(isVideo){
    try{
      const resp=await fetch(p._src);const blob=await resp.blob();
      const buf=await blob.arrayBuffer();
      const r=await window.cm.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:'영상_'+stamp+'.webm'});
      if(r&&r.ok)toast('💾 영상 저장 완료');
    }catch(e){toast('영상 저장 실패');}
    return;
  }
  // 이미지 + 메모 합성
  const img=new Image();
  img.onload=()=>{
    const cap=(capEl.innerText||'').trim();
    const pad=cap?14:0, lineH=22;
    const lines=cap?cap.split('\n'):[];
    const capH=cap?(pad*2+lines.length*lineH):0;
    const cv=document.createElement('canvas');
    cv.width=img.naturalWidth;cv.height=img.naturalHeight+capH;
    const c=cv.getContext('2d');
    c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);
    c.drawImage(img,0,0);
    if(cap){
      c.fillStyle='#fff7ec';c.fillRect(0,img.naturalHeight,cv.width,capH);
      c.fillStyle='#F68C1F';c.fillRect(0,img.naturalHeight,4,capH);
      c.fillStyle='#3a2a10';c.font='16px "Malgun Gothic"';c.textBaseline='top';
      lines.forEach((ln,i)=>c.fillText(ln,pad,img.naturalHeight+pad+i*lineH));
    }
    cv.toBlob(async b=>{
      const buf=await b.arrayBuffer();
      const r=await window.cm.saveImage({dataURL:cv.toDataURL('image/png'),filename:'핀_'+stamp+'.png'});
      if(r&&r.ok)toast('💾 핀'+(cap?' (메모 포함)':'')+' 저장 완료');
    });
  };
  img.src=p._src;
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
$('camCancel').addEventListener('click',()=>{ if(camRecOn)stopCamRec(); closeCam(); });
$('camShot').addEventListener('click',()=>{
  const v=$('camVid');
  if(!v.videoWidth){toast('카메라 준비 중…');return;}
  const cv=document.createElement('canvas');cv.width=v.videoWidth;cv.height=v.videoHeight;
  cv.getContext('2d').drawImage(v,0,0);
  addPin(cv.toDataURL('image/png'),'카메라');
  closeCam();toast('📌 사진이 핀으로 고정됨 — ✎ 메모 / 💾 저장');
});
// 동영상 녹화 (최대 10초, 다시 누르면 정지)
let camRec=null,camRecOn=false,camRecChunks=[],camRecTimer=null,camRecSec=0;
function stopCamRec(){ if(camRec&&camRec.state!=='inactive')camRec.stop(); }
$('camRec').addEventListener('click',()=>{
  if(camRecOn){stopCamRec();return;}
  if(!camStream){toast('카메라가 꺼져 있어요');return;}
  camRecChunks=[];
  try{camRec=new MediaRecorder(camStream,{mimeType:'video/webm'});}
  catch(e){try{camRec=new MediaRecorder(camStream);}catch(e2){toast('이 환경에서는 녹화를 지원하지 않아요');return;}}
  camRec.ondataavailable=ev=>{if(ev.data.size)camRecChunks.push(ev.data);};
  camRec.onstop=()=>{
    clearInterval(camRecTimer);camRecTimer=null;
    camRecOn=false;$('camRec').textContent='🎬 녹화';$('camRec').classList.remove('on');
    const blob=new Blob(camRecChunks,{type:'video/webm'});
    const url=URL.createObjectURL(blob);
    addPin(url,'영상',null,null,320,true);
    closeCam();toast('📌 영상이 핀으로 고정됨 — ▶ 재생 / 💾 저장');
  };
  camRec.start();camRecOn=true;camRecSec=0;
  $('camRec').classList.add('on');$('camRec').textContent='⏹ 0s';
  camRecTimer=setInterval(()=>{
    camRecSec++;$('camRec').textContent='⏹ '+camRecSec+'s';
    if(camRecSec>=10)stopCamRec(); // 최대 10초 자동 정지
  },1000);
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
  if(w<8||h<8){endSnip();snipRecMode=false;return;}
  if(snipRecMode){snipRecMode=false;endSnip();recordRegion(x,y,w,h);return;}
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

/* ===== 영역 녹화 → 핀 ===== */
let snipRecMode=false; // snip을 녹화용으로 사용 중
async function startSnipRec(){
  snipRecMode=true;
  await startSnip();
  $('snipHint').textContent='녹화할 영역을 드래그하세요';
}
$('snipRecBtn').addEventListener('click',startSnipRec);
async function recordRegion(x,y,w,h){
  // 커서 모니터 화면 스트림 받기
  const src=await window.cm.getScreenSource();
  if(!src){toast('화면 녹화를 시작할 수 없어요');return;}
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:src.id,
        maxWidth:1920,maxHeight:1080}}
    });
  }catch(e){toast('화면 캡처 권한이 필요해요');return;}
  const video=document.createElement('video');video.srcObject=stream;video.muted=true;
  await video.play();
  // 화면 해상도 → 영역 좌표 스케일
  const vw=video.videoWidth,vh=video.videoHeight;
  const scX=vw/src.bounds.w, scY=vh/src.bounds.h;
  const cropX=(x-src.bounds.x)*scX, cropY=(y-src.bounds.y)*scY, cropW=w*scX, cropH=h*scY;
  // 크롭용 캔버스를 매 프레임 그려서 그 캔버스를 녹화
  const cv=document.createElement('canvas');cv.width=Math.round(cropW);cv.height=Math.round(cropH);
  const cc=cv.getContext('2d');
  let drawing=true;
  const drawFrame=()=>{
    if(!drawing)return;
    cc.drawImage(video,cropX,cropY,cropW,cropH,0,0,cv.width,cv.height);
    requestAnimationFrame(drawFrame);
  };
  drawFrame();
  const cvStream=cv.captureStream(30);
  let rec;
  try{rec=new MediaRecorder(cvStream,{mimeType:'video/webm'});}
  catch(e){try{rec=new MediaRecorder(cvStream);}catch(e2){toast('녹화 미지원 환경');drawing=false;stream.getTracks().forEach(t=>t.stop());return;}}
  const chunks=[];rec.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data);};
  rec.onstop=()=>{
    drawing=false;stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:'video/webm'});
    addPin(URL.createObjectURL(blob),'영역녹화',x,y,Math.max(160,w),true);
    toast('📌 영역 녹화가 핀으로 고정됨 — ▶ 재생 / 💾 저장');
    $('recStop').classList.remove('on');
  };
  rec.start();
  // 정지 버튼 표시
  const stopBtn=$('recStop');stopBtn.classList.add('on');
  requestAnimationFrame(()=>{
    const dd=dockDisp();
    stopBtn.style.left=(dd.x+(dd.w-stopBtn.offsetWidth)/2)+'px';
    stopBtn.style.top=(dd.y+dd.h-stopBtn.offsetHeight-30)+'px';
  });
  let sec=0;stopBtn.textContent='⏹ 녹화 정지 0s';
  const tmr=setInterval(()=>{sec++;stopBtn.textContent='⏹ 녹화 정지 '+sec+'s';if(sec>=15)done();},1000);
  const done=()=>{clearInterval(tmr);if(rec.state!=='inactive')rec.stop();};
  stopBtn.onclick=done;
}

/* ===== 포인터: 링 / 스포트라이트 — v0.4: 모양은 별도 선택, 버튼 혼동 제거 ===== */
const halo=$('halo'),spotEl=$('spot'),spotHole=$('spotHole');
const PS={ring:false,spot:0,size:160};
let spotShape=1; // 1 원 / 2 사각 (스포트라이트 켜기 전 미리 선택)
let hx=innerWidth/2,hy=innerHeight/2,ptrRAF=0;
function syncPtr(){
  if(PS.ring||PS.spot>0)window.cm.grabFocus();
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
  // 클릭 위치에 물결 + 짧은 펄스 (확실히 보이도록 2겹)
  ['ripple','ripple ring2'].forEach((cls,i)=>{
    const r=document.createElement('div');r.className=cls;
    r.style.cssText=`left:${e.clientX}px;top:${e.clientY}px;transform:translate(-50%,-50%);${i?'animation-delay:.06s;':''}`;
    document.body.appendChild(r);setTimeout(()=>r.remove(),600);
  });
  // 커서 링 자체도 클릭 순간 한 번 커졌다 작아짐
  halo.classList.remove('clickpulse');void halo.offsetWidth;halo.classList.add('clickpulse');
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
  hud.querySelector('.ptxt').textContent=({pen:'펜',hl:'형광펜',eraser:'지우개',rect:'박스',circle:'원'})[penType]+' 굵기 '+w;
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
  if(lensOn)window.cm.grabFocus();
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
const PW={pen:5,hl:16,eraser:26,rect:4,circle:4}; // 도구별 굵기 (휠로 조절)
let rectStart=null,rectMode=false,circleMode=false;
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
  ['penBtn','hlBtn','erBtn','txBtn','rectBtn','circBtn'].forEach(id=>$(id).classList.remove('on'));
  $({pen:'penBtn',hl:'hlBtn',eraser:'erBtn',text:'txBtn',rect:'rectBtn',circle:'circBtn'}[t]).classList.add('on');
}
$('penBtn').addEventListener('click',()=>setTool('pen'));
$('hlBtn').addEventListener('click',()=>setTool('hl'));
$('erBtn').addEventListener('click',()=>setTool('eraser'));
$('txBtn').addEventListener('click',()=>setTool('text'));
$('rectBtn').addEventListener('click',()=>setTool('rect'));
$('circBtn').addEventListener('click',()=>setTool('circle'));

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
  if(drawMode&&(e.key==='c'||e.key==='C')){e.preventDefault();setTool('circle');}
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
    else if($('boardWrap')&&$('boardWrap').classList.contains('on')){$('boardWrap').classList.remove('on');$('boardBtn')&&$('boardBtn').classList.remove('on');}
    else if(curPanel)setPanel(null); // AI보조·번역 등 열린 패널 닫기
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
  // Ctrl 드래그 = 박스, Shift 드래그 = 원 (펜/형광 중에도)
  rectMode=(penType==='rect')||((penType==='pen'||penType==='hl')&&e.ctrlKey);
  circleMode=(penType==='circle')||((penType==='pen'||penType==='hl')&&e.shiftKey);
  if(rectMode||circleMode){rectStart={x:e.clientX,y:e.clientY};return;}
  if(penType==='eraser'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='#000';ctx.fillStyle='#000';
    pathStroke(ctx,stroke,PW.eraser);
  }
});
dc.addEventListener('pointermove',e=>{
  if(!drawing)return;
  if(rectMode||circleMode){
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
    dctmp.style.opacity=penType==='hl'?0.42:1;
    const x0=rectStart.x,y0=rectStart.y;
    const lw=PW[penType==='circle'?'circle':(penType==='rect'?'rect':penType)]||PW.rect;
    tctx.strokeStyle=penColor;tctx.lineWidth=lw;tctx.lineJoin='round';
    if(circleMode){
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
  if(rectMode||circleMode){
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=penType==='hl'?0.42:1;
    ctx.drawImage(dctmp,0,0);
    ctx.globalAlpha=1;
    tctx.clearRect(0,0,dctmp.width,dctmp.height);
    stroke=[];rectMode=false;circleMode=false;return;
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
  if($('boardWrap')){$('boardWrap').classList.remove('on');$('boardBtn')&&$('boardBtn').classList.remove('on');}
  setIgnore(true); // 클릭 통과 복구
}
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

/* ===== 칠판 (보드) — 화이트보드(보드마카) / 초록칠판(분필) + 스탬프 + 가리개 ===== */
(()=>{
  const boardWrap=$('boardWrap'),bcv=$('boardCv'),bx=bcv.getContext('2d');
  const PAL={green:['#ffffff','#ffe14d','#ff9ecb'], white:['#1f2024','#e8362f','#1f6dff']};
  const STAMPS=['⭐','👍','✅','💮','🌸','🎉','💯','❤️','😊','✏️','🅾️','❌'];
  let bStyle='green',bColor=PAL.green[0],bTool='pen',bStamp='⭐',bDrawing=false,bLast=null,bOpen=false;
  const SIZE={marker:5,chalk:15,eraser:36};

  function fitBoard(){const r=window.devicePixelRatio||1;bcv.width=innerWidth;bcv.height=innerHeight;}
  function setStyle(s){
    bStyle=s;
    boardWrap.classList.toggle('green',s==='green');
    boardWrap.classList.toggle('white',s==='white');
    $('bStyleBtn').textContent=s==='green'?'🟩 칠판':'⬜ 보드';
    renderSwatches();
  }
  function renderSwatches(){
    const wrap=$('bSwatches');wrap.innerHTML='';
    PAL[bStyle].forEach((c,i)=>{
      const s=document.createElement('span');s.className='bsw'+(i===0?' sel':'');
      s.style.background=c;s.title=c;
      s.addEventListener('click',()=>{
        bColor=c;wrap.querySelectorAll('.bsw').forEach(x=>x.classList.remove('sel'));s.classList.add('sel');
        if(bTool!=='stamp')setTool('pen');
      });
      wrap.appendChild(s);
    });
    bColor=PAL[bStyle][0];
  }
  function renderStamps(){
    const g=$('boardStamps');g.innerHTML='';
    STAMPS.forEach(em=>{
      const b=document.createElement('div');b.className='bstamp'+(em===bStamp?' sel':'');
      b.textContent=em;
      b.addEventListener('click',()=>{bStamp=em;setTool('stamp');g.querySelectorAll('.bstamp').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');});
      g.appendChild(b);
    });
  }
  function setTool(t){
    bTool=t;
    $('bPenBtn').classList.toggle('on',t==='pen');
    $('bErBtn').classList.toggle('on',t==='eraser');
    $('bStampBtn').classList.toggle('on',t==='stamp');
    $('boardStamps').classList.toggle('on',t==='stamp');
    bcv.style.cursor=t==='stamp'?'pointer':(t==='eraser'?'cell':'crosshair');
  }
  // 분필: 거친 입자 / 보드마카: 매끈한 선
  function drawSeg(a,b){
    if(bTool==='eraser'){
      bx.save();bx.globalCompositeOperation='destination-out';
      bx.strokeStyle='#000';bx.lineWidth=SIZE.eraser;bx.lineCap='round';bx.lineJoin='round';
      bx.beginPath();bx.moveTo(a.x,a.y);bx.lineTo(b.x,b.y);bx.stroke();bx.restore();return;
    }
    if(bStyle==='green'){ // 분필 입자
      const dist=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.floor(dist/2)),sz=SIZE.chalk;
      bx.fillStyle=bColor;
      for(let i=0;i<=steps;i++){
        const t=i/steps,cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t;
        for(let k=0;k<sz*0.7;k++){
          const ang=Math.random()*6.28,rr=Math.random()*sz/2;
          bx.globalAlpha=0.12+Math.random()*0.24;
          bx.fillRect(cx+Math.cos(ang)*rr,cy+Math.sin(ang)*rr,1.6,1.6);
        }
      }
      bx.globalAlpha=1;
    }else{ // 보드마카
      bx.globalAlpha=0.96;bx.strokeStyle=bColor;bx.lineWidth=SIZE.marker;bx.lineCap='round';bx.lineJoin='round';
      bx.beginPath();bx.moveTo(a.x,a.y);bx.lineTo(b.x,b.y);bx.stroke();bx.globalAlpha=1;
    }
  }
  function stampAt(x,y){
    bx.globalAlpha=1;bx.textAlign='center';bx.textBaseline='middle';bx.font='46px "Apple Color Emoji","Segoe UI Emoji",serif';
    bx.fillText(bStamp,x,y);
  }
  bcv.addEventListener('pointerdown',e=>{
    if(bTool==='stamp'){stampAt(e.clientX,e.clientY);return;}
    bDrawing=true;bcv.setPointerCapture(e.pointerId);bLast={x:e.clientX,y:e.clientY};
    drawSeg(bLast,{x:e.clientX+0.1,y:e.clientY+0.1}); // 점 찍기
  });
  bcv.addEventListener('pointermove',e=>{
    if(!bDrawing)return;
    const p={x:e.clientX,y:e.clientY};drawSeg(bLast,p);bLast=p;
  });
  const endB=()=>{bDrawing=false;};
  bcv.addEventListener('pointerup',endB);bcv.addEventListener('pointercancel',endB);

  function openBoard(){
    setPanel(null);fitBoard();
    boardWrap.classList.add('on');setIgnore(false);bOpen=true;
    $('boardBtn')&&$('boardBtn').classList.add('on');
    setStyle(bStyle);setTool('pen');renderStamps();
    const tb=$('boardTb');
    requestAnimationFrame(()=>{
      const d=dockDisp();
      const lx2=Math.round(d.x+(d.w-tb.offsetWidth)/2),ty=d.y+18;
      tb.style.left=lx2+'px';tb.style.top=ty+'px';
      const st=$('boardStamps');st.style.left=lx2+'px';st.style.top=(ty+46)+'px';
    });
  }
  function closeBoard(){boardWrap.classList.remove('on');bOpen=false;$('boardBtn')&&$('boardBtn').classList.remove('on');}
  $('boardBtn')&&$('boardBtn').addEventListener('click',()=>{bOpen?closeBoard():openBoard();});
  $('bStyleBtn').addEventListener('click',()=>setStyle(bStyle==='green'?'white':'green'));
  $('bPenBtn').addEventListener('click',()=>setTool('pen'));
  $('bErBtn').addEventListener('click',()=>setTool('eraser'));
  $('bStampBtn').addEventListener('click',()=>setTool(bTool==='stamp'?'pen':'stamp'));
  $('bClearBtn').addEventListener('click',()=>bx.clearRect(0,0,bcv.width,bcv.height));
  $('bShadeBtn').addEventListener('click',()=>{ if(typeof openShade==='function')openShade(); });
  $('bCloseBtn').addEventListener('click',closeBoard);
  addEventListener('resize',()=>{ if(bOpen){const img=bx.getImageData(0,0,bcv.width,bcv.height);fitBoard();bx.putImageData(img,0,0);} });
  // 펜 툴바 이동
  makeDrag($('boardGrip'),(e,s)=>{
    const tb=$('boardTb');
    if(!s){const r=tb.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    tb.style.left=(e.clientX-s.dx)+'px';tb.style.top=(e.clientY-s.dy)+'px';
    const st=$('boardStamps');st.style.left=(e.clientX-s.dx)+'px';st.style.top=(e.clientY-s.dy+46)+'px';
  });
})();
