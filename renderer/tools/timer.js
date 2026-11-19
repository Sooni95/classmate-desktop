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
// AudioContext는 한 번만 만들어 재사용 — 호출마다 새로 만들면 브라우저 한도(약 6개)를 넘겨 소리가 끊긴다
let _beepAc=null;
// 효과음 설정 (⚙ 설정 메뉴의 '효과음'): 켜기/끄기 + 음량 0~100 (기본 80 = 원래 크기). 타이머 종료음도 같은 설정을 따른다
let cmSndOn=localStorage.getItem('cm_sound')!=='0';
let cmSndVol=(()=>{const v=parseInt(localStorage.getItem('cm_volume'));return isNaN(v)?80:Math.max(0,Math.min(100,v));})();
function sndMul(){return cmSndOn?cmSndVol/80:0;}
function setSound(on,vol){cmSndOn=!!on;cmSndVol=Math.max(0,Math.min(100,vol|0));try{localStorage.setItem('cm_sound',cmSndOn?'1':'0');localStorage.setItem('cm_volume',cmSndVol);}catch(e){}}
// 짧은 효과음 한 음 (주파수 Hz, 길이 초, 음량, 시작 지연 초) — 핀볼 심장박동·카운트다운 등
function tone(freq,dur,vol,delay){try{const m=sndMul();if(m<=0)return;const ac=_beepAc||(_beepAc=new AudioContext());if(ac.state==='suspended')ac.resume();const t=ac.currentTime+(delay||0);const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=freq;o.connect(g);g.connect(ac.destination);g.gain.setValueAtTime((vol||.15)*m,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.start(t);o.stop(t+dur+.02);}catch(e){}}
function beep(n){try{const m=sndMul();if(m<=0)return;const ac=_beepAc||(_beepAc=new AudioContext());if(ac.state==='suspended')ac.resume();const arr=n===1?[0]:[0,.2,.4];arr.forEach(d=>{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=880;o.start(ac.currentTime+d);g.gain.setValueAtTime(.15*m,ac.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d+.18);o.stop(ac.currentTime+d+.2);});}catch(e){}}
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
if($('tfGrip'))makeScaleHandle($('tfGrip'),$('tFloat'),{min:0.7,max:2.5,key:'cm_tf_scale'});
makeDrag($('tFloat'),(e,s)=>{
  if(!s){const r=$('tFloat').getBoundingClientRect();$('tFloat').style.right='auto';return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  $('tFloat').style.left=(e.clientX-s.dx)+'px';$('tFloat').style.top=(e.clientY-s.dy)+'px';
},e=>e.target.tagName==='BUTTON');
