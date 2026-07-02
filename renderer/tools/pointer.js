/* ===== 포인터: 링 / 스포트라이트 — v0.4: 모양은 별도 선택, 버튼 혼동 제거 ===== */
const halo=$('halo'),spotEl=$('spot'),spotHole=$('spotHole');
const PS={ring:false,spot:0,size:160};
registerCaptureMode(()=>PS.ring||PS.spot>0); // [클릭통과 규칙] 링/스포트 포인터 활성 중엔 통과 차단 + 커스텀 포인터 표시
let spotShape=1; // 1 원 / 2 사각 (스포트라이트 켜기 전 미리 선택)
let hx=innerWidth/2,hy=innerHeight/2,ptrRAF=0;
function syncPtr(){
  if(PS.ring||PS.spot>0)ipc.grabFocus();
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

/* ===== 부분 렌즈 ===== */
let lensOn=false,lensShape=0,lz=2,lensImgW=0,lensB=null,lensSize=280;
registerCaptureMode(()=>lensOn); // [클릭통과 규칙] 돋보기 활성 중엔 통과 차단 + 커스텀 포인터 표시
const lens2=$('lens2'),lensImg=$('lensImg'),lensTip=$('lensTip');
async function setLens(shape){
  if(shape>0&&lensShape===0){
    const res=await ipc.captureScreen();
    if(!res){toast('📷 화면 캡처에 실패했어요. 다시 시도해 주세요');return;}
    lensB=res.bounds;lensImg.src=res.dataURL;
    await new Promise(r=>{lensImg.onload=r;});
    lensImgW=lensImg.naturalWidth;
    lz=2;
  }
  lensShape=shape;lensOn=shape>0;
  if(lensOn)ipc.grabFocus();
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
// app.js는 이 파일보다 먼저 로드되어 여기서 직접 호출할 수 없으므로, 정의된 이 파일 쪽에서 초기 실행
syncPtr();
