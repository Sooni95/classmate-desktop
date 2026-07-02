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

