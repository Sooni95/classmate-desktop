/* ===== 칠판 (보드) — 화이트보드(보드마카) / 초록칠판(분필) + 스탬프 + 가리개 ===== */
(()=>{
  const boardWrap=$('boardWrap'),bcv=$('boardCv'),bx=bcv.getContext('2d');
  const PAL={green:['#ffffff','#ffe14d','#ff9ecb'], white:['#1f2024','#e8362f','#1f6dff']};
  let bStyle='green',bColor=PAL.green[0],bTool='pen',bStamp='⭐',bDrawing=false,bLast=null,bOpen=false,bFull=false,bTextEd=null,tbMoved=false;
  const SIZE={marker:5,chalk:15,eraser:36};
  function boardFont(){ return bStyle==='green' ? '"Gungsuh","궁서","Batang","Malgun Gothic",serif' : '"Malgun Gothic","맑은 고딕",sans-serif'; }

  function fitBoard(){
    const w=bFull?innerWidth:(boardWrap.clientWidth||Math.round(innerWidth*0.7));
    const h=bFull?innerHeight:(boardWrap.clientHeight||Math.round(innerHeight*0.7));
    bcv.width=w;bcv.height=h;
  }
  function placeTb(){
    const tb=$('boardTb'),st=$('boardStamps');
    if(tbMoved&&bFull){ // 사용자가 직접 옮긴 전체화면 툴바는 그대로 두고 스탬프만 따라가게
      const tl=parseInt(tb.style.left||'0'),tt=parseInt(tb.style.top||'0');
      st.style.left=tl+'px';st.style.top=(tt+44)+'px';return;
    }
    let left,top;
    if(bFull){ const d=dockDisp(); left=Math.round(d.x+(d.w-tb.offsetWidth)/2); top=Math.round(d.y+10); } // 합집합 중앙 ✕ → 독 모니터 중앙
    else { const r=boardWrap.getBoundingClientRect(); left=Math.round(r.left+(r.width-tb.offsetWidth)/2); top=Math.round(r.top+10); }
    tb.style.left=left+'px';tb.style.top=top+'px';
    st.style.left=left+'px';st.style.top=(top+44)+'px';
  }
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
        if(bTool!=='stamp')bSetTool('pen');
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
      b.addEventListener('click',()=>{bStamp=em;bSetTool('stamp');g.querySelectorAll('.bstamp').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');});
      g.appendChild(b);
    });
  }
  function bSetTool(t){
    if(bTool==='text'&&t!=='text')commitBText();
    bTool=t;
    $('bPenBtn').classList.toggle('on',t==='pen');
    $('bErBtn').classList.toggle('on',t==='eraser');
    $('bStampBtn').classList.toggle('on',t==='stamp');
    $('bTextBtn')&&$('bTextBtn').classList.toggle('on',t==='text');
    $('boardStamps').classList.toggle('on',t==='stamp');
    bcv.style.cursor=t==='stamp'?'pointer':(t==='eraser'?'cell':(t==='text'?'text':'crosshair'));
  }
  function openBText(x,y){
    commitBText();
    const ed=document.createElement('div');ed.className='cvtext-b iv';ed.contentEditable='true';
    ed.style.left=x+'px';ed.style.top=y+'px';
    ed.style.color=bColor;ed.style.font='34px '+boardFont();ed.style.lineHeight='1.25';
    ed.dataset.x=x;ed.dataset.y=y;
    document.body.appendChild(ed);bTextEd=ed;
    ipc.grabFocus&&ipc.grabFocus();
    setTimeout(()=>ed.focus(),0);
    ed.addEventListener('keydown',ev=>{ ev.stopPropagation();
      if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();commitBText();}
      else if(ev.key==='Escape'){const e2=bTextEd;bTextEd=null;e2.remove();}
    });
  }
  function commitBText(){
    if(!bTextEd)return;
    const ed=bTextEd;bTextEd=null;
    const txt=ed.innerText.replace(/\n+$/,'');
    const x=+ed.dataset.x,y=+ed.dataset.y,col=ed.style.color;
    ed.remove();
    if(!txt.trim())return;
    const r=bcv.getBoundingClientRect();
    bx.save();bx.globalAlpha=1;bx.fillStyle=col;bx.textBaseline='top';bx.textAlign='left';
    bx.font='34px '+boardFont();
    txt.split('\n').forEach((ln,i)=>bx.fillText(ln,(x-r.left)+2,(y-r.top)+2+i*34*1.25));
    bx.restore();
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
  function lp(e){const r=bcv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  bcv.addEventListener('pointerdown',e=>{
    if(bTool==='text'){openBText(e.clientX,e.clientY);return;}
    const p=lp(e);
    if(bTool==='stamp'){stampAt(p.x,p.y);return;}
    bDrawing=true;bcv.setPointerCapture(e.pointerId);bLast=p;
    drawSeg(bLast,{x:p.x+0.1,y:p.y+0.1}); // 점 찍기
  });
  bcv.addEventListener('pointermove',e=>{
    if(!bDrawing)return;
    const p=lp(e);drawSeg(bLast,p);bLast=p;
  });
  const endB=()=>{bDrawing=false;};
  bcv.addEventListener('pointerup',endB);bcv.addEventListener('pointercancel',endB);

  function openBoard(){
    setPanel(null);
    boardWrap.classList.add('on');setIgnore(false);bOpen=true;
    if(!bFull){
      // 창 모드: 독 모니터에 ~72% 크기로
      const d=dockDisp();
      const w=Math.round(d.w*0.72),h=Math.round(d.h*0.72);
      boardWrap.classList.add('windowed');
      boardWrap.style.left=(d.x+(d.w-w)/2)+'px';boardWrap.style.top=(d.y+(d.h-h)/2)+'px';
      boardWrap.style.width=w+'px';boardWrap.style.height=h+'px';
    }
    setStyle(bStyle);bSetTool('pen');renderStamps();
    requestAnimationFrame(()=>{fitBoard();placeTb();});
  }
  function closeBoard(){boardWrap.classList.remove('on');bOpen=false;}
  $('gcBoard')&&$('gcBoard').addEventListener('click',()=>{if(typeof gShowCfg==='function')gShowCfg();openBoard();});
  $('bStyleBtn').addEventListener('click',()=>setStyle(bStyle==='green'?'white':'green'));
  $('bPenBtn').addEventListener('click',()=>bSetTool('pen'));
  $('bTextBtn')&&$('bTextBtn').addEventListener('click',()=>bSetTool('text'));
  $('bErBtn').addEventListener('click',()=>bSetTool('eraser'));
  $('bStampBtn').addEventListener('click',()=>bSetTool(bTool==='stamp'?'pen':'stamp'));
  $('bClearBtn').addEventListener('click',()=>{commitBText();bx.clearRect(0,0,bcv.width,bcv.height);});
  $('bShadeBtn').addEventListener('click',()=>{ if(typeof openShade==='function')openShade(); });
  $('bCloseBtn').addEventListener('click',closeBoard);
  // 🗖 전체화면 / 창 모드 전환
  $('bFullBtn')&&$('bFullBtn').addEventListener('click',()=>{
    const img=bx.getImageData(0,0,bcv.width,bcv.height);
    bFull=!bFull;
    tbMoved=false; // 모드 전환 시 툴바를 다시 독 모니터 중앙으로
    if(bFull){boardWrap.classList.remove('windowed');boardWrap.style.left=boardWrap.style.top=boardWrap.style.width=boardWrap.style.height='';}
    else{const d=dockDisp(),w=Math.round(d.w*0.72),h=Math.round(d.h*0.72);
      boardWrap.classList.add('windowed');boardWrap.style.left=(d.x+(d.w-w)/2)+'px';boardWrap.style.top=(d.y+(d.h-h)/2)+'px';boardWrap.style.width=w+'px';boardWrap.style.height=h+'px';}
    $('bFullBtn').textContent=bFull?'🗗 창':'🗖 전체';
    requestAnimationFrame(()=>{fitBoard();bx.putImageData(img,0,0);placeTb();});
  });
  addEventListener('resize',()=>{ if(bOpen){const img=bx.getImageData(0,0,bcv.width,bcv.height);fitBoard();bx.putImageData(img,0,0);placeTb();} });
  // 창/툴바 이동 (grip) — 창모드: 창 전체 이동 / 전체화면: 툴바만 이동
  makeDrag($('boardGrip'),(e,s)=>{
    if(!s){
      if(bFull){const r=$('boardTb').getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      const r=boardWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};
    }
    if(bFull){ // 전체화면에선 화면 전체가 칠판이므로 툴바만 옮김
      tbMoved=true;
      const tb=$('boardTb'),st=$('boardStamps');
      const lx=e.clientX-s.dx, ty=e.clientY-s.dy;
      tb.style.left=lx+'px';tb.style.top=ty+'px';
      st.style.left=lx+'px';st.style.top=(ty+44)+'px';
      return;
    }
    boardWrap.style.left=(e.clientX-s.dx)+'px';boardWrap.style.top=(e.clientY-s.dy)+'px';
    placeTb();
  });
  // 창 크기 조절
  boardWrap.querySelectorAll('.brz').forEach(rz=>{
    const dir=rz.classList.contains('brz-e')?'e':rz.classList.contains('brz-s')?'s':'se';
    makeDrag(rz,(e,s)=>{
      const r=boardWrap.getBoundingClientRect();
      if(!s)return{x:e.clientX,y:e.clientY,w:r.width,h:r.height,img:bx.getImageData(0,0,bcv.width,bcv.height)};
      let w=s.w,h=s.h;
      if(dir.includes('e'))w=Math.max(280,s.w+(e.clientX-s.x));
      if(dir.includes('s'))h=Math.max(200,s.h+(e.clientY-s.y));
      boardWrap.style.width=w+'px';boardWrap.style.height=h+'px';
      fitBoard();bx.putImageData(s.img,0,0);placeTb();
    });
  });
})();
