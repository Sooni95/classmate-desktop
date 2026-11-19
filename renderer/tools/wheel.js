/* ===== 게임 모달 공통 ===== */
const gameWrap=$('gameWrap'),gCv=$('gameCv'),gx=gCv.getContext('2d'),gRes=$('gameRes'),gGo=$('gameGo');
let gameMode=null,gameAnim=0,gameNames=[];
// 선명도: 캔버스 내부 해상도를 화면 배율(DPR)에 맞춘다 — 125~150% 배율 화면에서 글자·선이 흐릿하던 문제.
// 그리기 좌표는 그대로 540×(430|470) 기준이고, gBase()가 배율 변환을 깔아준다.
let GDPR=1;
function gSize(w,h){
  GDPR=Math.max(1,Math.min(3,window.devicePixelRatio||1));
  gCv.width=Math.round(w*GDPR);gCv.height=Math.round(h*GDPR);
  gCv.style.width=w+'px';gCv.style.height=h+'px';
}
function gBase(){gx.setTransform(GDPR,0,0,GDPR,0,0);}
// 이웃한 칸이 비슷한 주황끼리 붙지 않도록 주황 계열 사이에 다른 색을 끼워 넣은 순서
const BRAND=['#F68C1F','#5b8def','#FFB45E','#34c759','#D9760F','#e05544','#a78bfa','#ffd166'];
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
// 돌림판 항목: "이름*3" → 칸 크기(확률) 3배. [{nm, w}]
function parseWheel(txt){return parseCounted(txt,10).map(x=>({nm:x.nm,w:x.n}));}
function openGame(mode){
  const src=mode==='wheel'?parseWheel($('wheelNames').value):parseNames($('pkNames').value,true);
  if(src.length<2){toast('명단을 2명(개) 이상 입력하세요');return;}
  // 예전엔 40개를 넘으면 뒤쪽 사람을 말없이 잘라내 아예 참가하지 못했다 → 열지 않고 알려준다
  if(mode==='plinko'&&src.length>40){toast('구슬은 최대 40개예요 (지금 '+src.length+'개) — 인원이나 *개수를 줄여주세요');return;}
  cancelAnimationFrame(gameAnim);
  gameNames=src;gameMode=mode;gRes.textContent='';gGo.disabled=false;
  wheelAngle=0;wheelWin=-1;
  $('gameTitle').textContent=mode==='wheel'?'🎡 돌림판':'🎢 핀볼 — '+pkRule(src.length).label+'이 당첨!';
  gGo.textContent=mode==='wheel'?'돌리기!':'구슬 떨어뜨리기!';
  gSize(540,mode==='wheel'?430:470);
  gameWrap.classList.toggle('plinko',mode==='plinko');
  gameWrap.classList.toggle('wheel',mode==='wheel');
  _pkRankN=-1;if($('pkrList'))$('pkrList').innerHTML='';
  gameWrap.classList.add('on');
  centerOnDockDisplay(gameWrap);
  if(mode==='wheel')drawWheel(src,0);else{pk=pkInit(src);pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0};pkDraw();}
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
    const win=final&&b===pk.winner;
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
  $('pkLogBody').innerHTML=pkRankHTML(true)+'<div style="color:#6b7884;font-size:11px;margin-top:8px">※ 🎉 표시가 당첨 ('+escH(pk.label)+')</div>';
  $('pkLog').classList.add('on');
  centerOnDockDisplay($('pkLog').querySelector('.pkl-card'));
});
$('pkLogClose')&&$('pkLogClose').addEventListener('click',()=>$('pkLog').classList.remove('on'));
$('pkLog')&&$('pkLog').addEventListener('click',e=>{if(e.target.id==='pkLog')$('pkLog').classList.remove('on');});

/* --- 돌림판 (당첨 = 위쪽 중앙 포인터) --- */
const WW=540,WH=430,WCX=WW/2,WCY=WH/2+12,WR=178;
let wheelAngle=0,wheelWin=-1; // 현재 각도(다음 회전은 여기서 이어서 시작) · 당첨 조각(강조 표시)
function drawWheel(names,angle){
  gBase();
  gx.clearRect(0,0,WW,WH);
  // 외곽 림
  gx.beginPath();gx.arc(WCX,WCY,WR+11,0,7);
  gx.strokeStyle='#2c3744';gx.lineWidth=16;gx.stroke();
  // 칸 시작각 누적표 st[i] (가중치 w에 비례). names = [{nm, w}]
  const n=names.length,tot=names.reduce((a,x)=>a+x.w,0),st=[];
  {let acc=0;names.forEach(x=>{st.push(acc);acc+=Math.PI*2*x.w/tot;});st.push(Math.PI*2);}
  const thin=names.some((x,i)=>st[i+1]-st[i]<0.5);
  const radial=n>10||thin; // 인원이 많거나 좁은 칸이 있으면 글자를 바퀴살 방향으로 눕혀 겹치지 않게
  const fs=n<=6?18:n<=10?16:n<=16?14:n<=24?12:n<=36?10:9;
  for(let i=0;i<n;i++){
    const a0=angle+st[i],a1=angle+st[i+1],step=a1-a0,nmI=names[i].nm;
    gx.beginPath();gx.moveTo(WCX,WCY);gx.arc(WCX,WCY,WR,a0,a1);gx.closePath();
    gx.fillStyle=BRAND[i%BRAND.length];gx.fill();
    if(wheelWin>=0&&i!==wheelWin){gx.fillStyle='rgba(13,18,24,.55)';gx.fill();} // 당첨 외 조각은 어둡게
    gx.strokeStyle='rgba(0,0,0,.25)';gx.lineWidth=1;gx.stroke();
    const mid=a0+step/2;
    gx.fillStyle=(wheelWin>=0&&i!==wheelWin)?'rgba(255,255,255,.6)':'#fff';
    gx.font='bold '+fs+'px "Malgun Gothic"';
    gx.shadowColor='rgba(0,0,0,.5)';gx.shadowBlur=3;gx.textBaseline='middle';
    if(radial){
      const label=nmI.length>8?nmI.slice(0,8)+'…':nmI;
      gx.save();gx.translate(WCX,WCY);
      // 왼쪽 반원은 뒤집어 써서 글자가 거꾸로 서지 않게
      if(Math.cos(mid)<0){gx.rotate(mid+Math.PI);gx.textAlign='left';gx.fillText(label,-(WR-12),0);}
      else{gx.rotate(mid);gx.textAlign='right';gx.fillText(label,WR-12,0);}
      gx.restore();
    }else{
      const rTxt=WR*0.62,label=nmI.length>6?nmI.slice(0,6)+'…':nmI;
      gx.textAlign='center';
      gx.fillText(label,WCX+Math.cos(mid)*rTxt,WCY+Math.sin(mid)*rTxt);
    }
    gx.shadowBlur=0;
  }
  if(wheelWin>=0){ // 당첨 조각 테두리
    gx.beginPath();gx.moveTo(WCX,WCY);gx.arc(WCX,WCY,WR,angle+st[wheelWin],angle+st[wheelWin+1]);gx.closePath();
    gx.strokeStyle='#fff';gx.lineWidth=3;gx.lineJoin='round';gx.stroke();
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
  cancelAnimationFrame(gameAnim);
  const n=names.length,tot=names.reduce((a,x)=>a+x.w,0);
  const T=4200,start=performance.now();
  // 직전에 멈춘 각도에서 이어서 돈다 (매번 0도로 튀어 돌아가던 문제)
  const base=wheelAngle%(Math.PI*2);
  const delta=Math.random()*Math.PI*2+Math.PI*2*(4+Math.random()*2);
  const ease=t=>1-Math.pow(1-t,3);
  wheelWin=-1;
  const tick=now=>{
    const t=Math.max(0,Math.min(1,(now-start)/T));
    const a=base+delta*ease(t);
    wheelAngle=a;
    if(t<1){drawWheel(names,a);gameAnim=requestAnimationFrame(tick);}
    else{
      // 위쪽 중앙 포인터(절대각 -90°)가 가리키는 조각
      const norm=(((-Math.PI/2)-a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      let idx=n-1,acc=0;
      for(let i=0;i<n;i++){acc+=Math.PI*2*names[i].w/tot;if(norm<acc){idx=i;break;}}
      wheelWin=idx;drawWheel(names,a);
      gRes.textContent='🎉 '+names[idx].nm+'!';beep();gGo.disabled=false;
      gGo.textContent='다시 돌리기!';
    }
  };
  gameAnim=requestAnimationFrame(tick);
}

// gameWrap/gGo는 이 파일 맨 위에서 정의됨 — tools/lottery.js에 있으면 gGo가 아직
// 정의되기 전이라 ReferenceError로 클릭 등록 자체가 실패했던 버그(실행 버튼 무반응)
$('wheelOpen').addEventListener('click',()=>openGame('wheel'));
// 핀볼 당첨 규칙: 'N번째'를 고르면 숫자 칸을 보여준다
if($('pkRule'))$('pkRule').addEventListener('change',()=>{const on=$('pkRule').value==='nth';$('pkNth').style.display=on?'':'none';$('pkNthU').style.display=on?'':'none';});
$('plinkoOpen').addEventListener('click',()=>openGame('plinko'));
makeDrag($('gameHead'),(e,s)=>{
  if(!s){const r=gameWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  gameWrap.style.left=(e.clientX-s.dx)+'px';gameWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='gameClose');
gGo.addEventListener('click',()=>{
  if(gameMode==='wheel'){
    // '당첨자 제외'가 켜져 있으면 직전 당첨자를 빼고 돌린다 (한 번 뽑힌 사람이 또 나오지 않게)
    if($('wheelEx')&&$('wheelEx').checked&&wheelWin>=0){
      if(gameNames.length<=2){toast('마지막 한 명만 남아요 — 돌림판을 다시 열어 주세요');return;}
      gameNames=gameNames.filter((_,i)=>i!==wheelWin);
      wheelWin=-1;
    }
    gGo.disabled=true;gRes.textContent='';
    spinWheel(gameNames);
  }else{
    gGo.disabled=true;gRes.textContent='';
    dropPlinko();
  }
});

