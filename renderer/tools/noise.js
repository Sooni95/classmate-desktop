/* ===== 소음 측정 — v0.4: 폭탄 게이지 (지속 소음 → 충전 → 폭발) ===== */
let nStream=null,nCtx=null,nAn=null,nRAF=0,gauge=0,nLastBeep=0,boomCool=0,nBombDeadline=0;
const nBomb=$('nBomb'),bombRing=$('bombRing');
$('nTh').addEventListener('input',e=>$('nThV').textContent=e.target.value);
$('nGain').addEventListener('input',e=>$('nGainV').textContent=(e.target.value/100).toFixed(1)+'×');
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
  if(nBombDeadline){const bm=Math.max(0,parseInt($('nBombMin').value)||0);nBombDeadline=bm>0?Date.now()+bm*60000:0;} // 시간폭탄이면 카운트다운 재시작
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
    // autoGainControl을 끄지 않으면 브라우저가 음량을 평준화해 큰 소리도 작게 잡힘 → 게이지가 안 오름
    nStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    nCtx=new AudioContext();
    const srcN=nCtx.createMediaStreamSource(nStream);
    nAn=nCtx.createAnalyser();nAn.fftSize=512;srcN.connect(nAn);
    const buf=new Uint8Array(nAn.fftSize);
    gauge=0;
    const bm=Math.max(0,parseInt($('nBombMin').value)||0); // 폭발 시간(분)
    nBombDeadline=bm>0?Date.now()+bm*60000:0;
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
      const gain=(+$('nGain').value||100)/100;
      const lvl=Math.min(100,Math.round(rms*620*gain)); // 감도(gain)로 민감도 보정
      const th=+$('nTh').value;
      const over=lvl>th;
      $('nFill').style.width=lvl+'%';
      $('nFill').style.background=over?'linear-gradient(90deg,#ffb020,#e05544)':'linear-gradient(90deg,#37c871,#34c759)';
      $('nVal').textContent='현재 '+lvl+' / 기준 '+th+(nBombDeadline?' · ⏱'+Math.max(0,Math.ceil((nBombDeadline-Date.now())/1000))+'초':'');
      $('noiseAlert').classList.toggle('on',over||gauge>=70);
      if(Date.now()>boomCool){
        if(lvl>th)gauge=Math.min(100,gauge+0.55);
        else gauge=Math.max(0,gauge-0.4);
      }
      renderBomb();
      if(gauge>=100||(nBombDeadline&&Date.now()>=nBombDeadline))explode(); // 게이지 만충 또는 설정 시간 경과
      if(gauge>=70&&Date.now()-nLastBeep>3000){beep();nLastBeep=Date.now();}
      nRAF=requestAnimationFrame(loop);
    };
    loop();
  }catch(e){$('nVal').textContent='마이크 권한이 거부되었습니다';}
}
$('nStop').addEventListener('click',()=>{
  cancelAnimationFrame(nRAF);
  if(nStream){nStream.getTracks().forEach(t=>t.stop());nStream=null;}
  if(nCtx){nCtx.close();nCtx=null;}nAn=null;gauge=0;nBombDeadline=0;
  $('nFill').style.width='0%';$('nVal').textContent='대기 중';
  $('noiseAlert').classList.remove('on');
  nBomb.classList.remove('on','shake');
});
