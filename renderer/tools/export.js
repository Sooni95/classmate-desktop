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
  c.fillText('코코메이트 · 네패스 코코아팹 · '+now.getFullYear()+'.'+String(now.getMonth()+1).padStart(2,'0')+'.'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),M,y);
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
