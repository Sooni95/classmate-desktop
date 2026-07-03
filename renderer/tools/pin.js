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
  p.innerHTML=`<div class="pb"><span class="lbl">📌 ${label||'핀'}</span><span style="display:flex;align-items:center;gap:5px">${vidCtrls}<button class="cap" title="핀 메모">✎</button><button class="psave" title="저장">💾</button><input type="range" min="25" max="100" value="100" title="투명도"><button class="x">×</button></span></div><div class="pmedia">${media}</div><div class="pcap" contenteditable="true"></div><div class="rs-e" title="가로 조절"></div><div class="rs-s" title="세로 조절"></div><div class="rs" title="가로·세로 자유 조절"></div>`;
  document.body.appendChild(p);
  const pmedia=p.querySelector('.pmedia');
  const setInitH=(nw,nh)=>{ if(nw&&nh)pmedia.style.height=Math.round((p.clientWidth||280)*nh/nw)+'px'; };
  p.dataset.video=isVideo?'1':'';
  p._src=src;
  p.querySelector('.x').addEventListener('click',()=>p.remove());
  if(isVideo){
    const vid=p.querySelector('video'),playBtn=p.querySelector('.vplay'),loopBtn=p.querySelector('.vloop');
    vid.addEventListener('loadedmetadata',()=>setInitH(vid.videoWidth,vid.videoHeight));
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
  if(!isVideo){const im=p.querySelector('img');if(im.complete)setInitH(im.naturalWidth,im.naturalHeight);else im.addEventListener('load',()=>setInitH(im.naturalWidth,im.naturalHeight));}
  makeDrag(p.querySelector('.pb'),(e,s)=>{
    if(!s){const r=p.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    p.style.left=(e.clientX-s.dx)+'px';p.style.top=(e.clientY-s.dy)+'px';
  },e=>['BUTTON','INPUT'].includes(e.target.tagName));
  // 가로 조절
  makeDrag(p.querySelector('.rs-e'),(e,s)=>{
    if(!s)return{sx:e.clientX,sw:p.offsetWidth};
    p.style.width=Math.max(120,s.sw+(e.clientX-s.sx))+'px';
  });
  // 세로 조절
  makeDrag(p.querySelector('.rs-s'),(e,s)=>{
    if(!s)return{sy:e.clientY,sh:pmedia.offsetHeight};
    pmedia.style.height=Math.max(70,s.sh+(e.clientY-s.sy))+'px';
  });
  // 모서리 = 가로·세로 자유 (비율 고정 아님)
  makeDrag(p.querySelector('.rs'),(e,s)=>{
    if(!s)return{sx:e.clientX,sy:e.clientY,sw:p.offsetWidth,sh:pmedia.offsetHeight};
    p.style.width=Math.max(120,s.sw+(e.clientX-s.sx))+'px';
    pmedia.style.height=Math.max(70,s.sh+(e.clientY-s.sy))+'px';
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
      const r=await ipc.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:'영상_'+stamp+'.webm'});
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
      const r=await ipc.saveImage({dataURL:cv.toDataURL('image/png'),filename:'핀_'+stamp+'.png'});
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
registerCaptureMode(()=>snipOn, {hidesPointer:false}); // [클릭통과 규칙] 캡처 스닙 중엔 통과 차단, 커스텀 포인터는 그대로
const snipWrap=$('snipWrap'),snipRect=$('snipRect');
let snipB=null;
async function startSnip(){
  if(snipOn)return;
  const res=await ipc.captureScreen();
  if(!res){toast('📷 화면 캡처에 실패했어요. 다시 시도해 주세요');return;}
  snipImgData=res.dataURL;snipB=res.bounds;
  const im=$('snipImg');
  im.src=res.dataURL;
  im.style.cssText=`left:${snipB.x}px;top:${snipB.y}px;width:${snipB.w}px;height:${snipB.h}px;inset:auto;`;
  $('snipDim').style.cssText=`left:${snipB.x}px;top:${snipB.y}px;width:${snipB.w}px;height:${snipB.h}px;`;
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
  if(w<8||h<8){endSnip();snipRecMode=false;snipOcrMode=false;return;}
  if(snipRecMode){snipRecMode=false;endSnip();recordRegion(x,y,w,h);return;}
  const wasOcr=snipOcrMode;snipOcrMode=false;
  const img=new Image();
  img.onload=()=>{
    const lx=x-snipB.x, ly=y-snipB.y;
    const scX=img.naturalWidth/snipB.w, scY=img.naturalHeight/snipB.h;
    const cv=document.createElement('canvas');cv.width=w*scX;cv.height=h*scY;
    cv.getContext('2d').drawImage(img,lx*scX,ly*scY,w*scX,h*scY,0,0,w*scX,h*scY);
    const out=cv.toDataURL('image/png');
    if(wasOcr){endSnip();runOcr(out);return;}
    addPin(out,'캡처',x,y,w);
    ipc.copyImage(out);
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

/* ===== 영역 OCR (Pro) — 드래그한 영역의 글자를 추출해 클립보드+메모로 ===== */
let snipOcrMode=false;
async function startSnipOcr(){
  if(typeof isPro==='function'&&!isPro())return; // Pro 잠금은 pro.js의 [data-pro] 핸들러가 안내 모달을 띄움
  snipOcrMode=true;
  await startSnip();
  $('snipHint').textContent='글자를 추출할 영역을 드래그하세요';
}
async function runOcr(dataURL){
  toast('🔤 글자를 읽는 중…');
  const proKey=localStorage.getItem('cm_pro_key')||'';
  const apiKey=localStorage.getItem('ai_key')||'';
  const r=await ipc.aiOcr({dataURL,proKey,apiKey});
  if(r&&r.ok&&r.text){
    ipc.copyText(r.text);
    $('memoBtn').click();
    setTimeout(()=>{const m=[...document.querySelectorAll('.memo')].pop();if(m)m.querySelector('.mtext').innerText=r.text;},60);
    toast('📋 글자를 복사했어요 — 메모에도 담아뒀어요');
  }
  else if(r&&r.ok)toast('이 영역에서 글자를 찾지 못했어요');
  else if(r&&r.message==='NO_KEY')toast('🔒 Pro 인증 또는 AI 키 설정이 필요해요');
  else if(r&&r.message==='NO_ROUTE')toast('서버에 OCR 기능 배포가 필요해요 (관리자에게 문의)');
  else toast('글자 추출 실패: '+((r&&r.message)||'인터넷 연결을 확인하세요'));
}
$('ocrBtn')&&$('ocrBtn').addEventListener('click',startSnipOcr);
async function recordRegion(x,y,w,h){
  // 커서 모니터 화면 스트림 받기
  const src=await ipc.getScreenSource();
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

/* ===== 전체 화면 녹화 → 파일 저장 (핀 아님, webm) =====
   독·펜 필기도 화면에 보이는 그대로 녹화에 담김 (판서 과정 기록용) */
let fullRecOn=false;
async function startFullRec(){
  if(fullRecOn){toast('이미 녹화 중이에요 — 아래 정지 버튼으로 끝내주세요');return;}
  const src=await ipc.getScreenSource();
  if(!src){toast('화면 녹화를 시작할 수 없어요');return;}
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:src.id,
        maxWidth:1920,maxHeight:1080}}
    });
  }catch(e){toast('화면 캡처 권한이 필요해요');return;}
  let rec;
  try{rec=new MediaRecorder(stream,{mimeType:'video/webm'});}
  catch(e){try{rec=new MediaRecorder(stream);}catch(e2){toast('녹화 미지원 환경');stream.getTracks().forEach(t=>t.stop());return;}}
  const chunks=[];rec.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data);};
  rec.onstop=async()=>{
    fullRecOn=false;
    stream.getTracks().forEach(t=>t.stop());
    $('recStop').classList.remove('on');
    const blob=new Blob(chunks,{type:'video/webm'});
    const buf=await blob.arrayBuffer();
    const now=new Date();
    const fn='수업녹화_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0')+'.webm';
    const r=await ipc.saveBinary({bytes:Array.from(new Uint8Array(buf)),filename:fn});
    if(r&&r.ok)toast('💾 녹화 파일 저장 완료');
    else if(!(r&&r.canceled))toast('저장에 실패했어요');
  };
  rec.start();fullRecOn=true;
  setPanel(null);
  const stopBtn=$('recStop');stopBtn.classList.add('on');
  requestAnimationFrame(()=>{
    const dd=dockDisp();
    stopBtn.style.left=(dd.x+(dd.w-stopBtn.offsetWidth)/2)+'px';
    stopBtn.style.top=(dd.y+dd.h-stopBtn.offsetHeight-30)+'px';
  });
  let sec=0;stopBtn.textContent='⏹ 녹화 정지 0:00';
  const tmr=setInterval(()=>{sec++;stopBtn.textContent='⏹ 녹화 정지 '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');},1000);
  stopBtn.onclick=()=>{clearInterval(tmr);if(rec.state!=='inactive')rec.stop();};
}
$('fullRecBtn')&&$('fullRecBtn').addEventListener('click',startFullRec);

