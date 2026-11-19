/* ===== 발표자 (공용 명단 = 돌림판/핀볼도 사용) ===== */
let pool=[],orig=[],pHist=[],nHist=[];
const pres=$('pres'),hist=$('hist');
// 이름 분리: 줄바꿈 + 콤마(,， 둘 다) 인식
function splitNames(str){return (str||'').split(/[\n,，]/).map(s=>s.trim()).filter(Boolean);}
// 공정한 섞기(Fisher–Yates) — sort(()=>Math.random()-.5)는 순서가 한쪽으로 쏠린다. 핀볼·모둠 나누기 공용
function shuffled(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
// "이름*3" 표기 해석 → [{nm, n}] (n 없으면 1, 최대 max). 핀볼 구슬 수·돌림판 칸 크기·제비/사다리 결과 개수 공용
function parseCounted(str,max){
  return splitNames(str).map(line=>{
    const m=line.match(/^(.*?)\s*\*\s*(\d+)$/);
    return {nm:(m?m[1]:line).trim(),n:m?Math.min(max||99,Math.max(1,+m[2])):1};
  }).filter(x=>x.nm);
}
// 이름만 (별표 개수는 떼고) — 발표자·모둠·사다리는 한 사람을 한 번만 센다
function plainNames(str){return parseCounted(str).map(x=>x.nm);}
function rosterNames(){return plainNames($('nameList').value);}
function loadN(){orig=plainNames($('nameList').value);pool=[...orig];}
/* 공용 명단: 이름 칸 4곳(발표자·모둠·돌림판·핀볼)은 같은 명단을 본다. 어디서 고쳐도 나머지에 반영되고,
   앱을 껐다 켜도 남는다(localStorage cm_names). 사다리는 '이름 가져오기'로 같은 명단을 쓴다. */
const ROSTER_IDS=['nameList','tNames','wheelNames','pkNames'];
function syncRoster(from){
  const v=$(from).value;
  ROSTER_IDS.forEach(id=>{if(id!==from&&$(id))$(id).value=v;});
  try{localStorage.setItem('cm_names',v);}catch(e){}
  loadN();
}
ROSTER_IDS.forEach(id=>{if($(id))$(id).addEventListener('input',()=>syncRoster(id));});
(()=>{let saved='';try{saved=localStorage.getItem('cm_names')||'';}catch(e){}
  if(saved){ROSTER_IDS.forEach(id=>{if($(id))$(id).value=saved;});loadN();}})();
function candidates(){loadIfStale();return $('noRep').checked?pool:orig;}
function loadIfStale(){ // textarea 변경분 반영하되 pool 유지
  const cur=plainNames($('nameList').value);
  if(JSON.stringify(cur)!==JSON.stringify(orig)){orig=cur;pool=[...orig];}
}
function recordWin(p){
  // 동명이인이 있어도 한 명만 빠지도록 한 건만 제거
  if($('noRep').checked){const i=pool.indexOf(p);if(i>=0)pool.splice(i,1);}
  pHist.unshift(p);if(pHist.length>5)pHist.pop();
  hist.textContent='최근: '+pHist.join(' → ')+($('noRep').checked?' · 남은 '+pool.length+'명':'');
}
$('pickBtn').addEventListener('click',()=>{
  const src=candidates();
  if(!orig.length){pres.textContent='이름을 입력하세요';return;}
  if(!src.length){pres.textContent='모두 뽑았어요 🎉';hist.textContent='‘복원’을 누르면 처음부터 다시 뽑아요';return;}
  rollPick(pres,src,w=>'🎉 '+w,recordWin);
});
$('pickRst').addEventListener('click',()=>{loadN();pool=[...orig];pres.textContent='— 준비 —';pHist=[];hist.textContent='';});

/* --- 번호 뽑기: 뽑힌 번호 제외(기본) --- */
let nUsed=new Set(),nRange='';
function numRange(){
  let a=parseInt($('nFrom').value),b=parseInt($('nTo').value);
  if(isNaN(a))a=1; if(isNaN(b))b=30;
  if(a>b){const t=a;a=b;b=t;$('nFrom').value=a;$('nTo').value=b;} // 거꾸로 넣어도 알아서 바로잡음
  return [a,b];
}
$('pickN').addEventListener('click',()=>{
  const [a,b]=numRange(),out=$('presN');
  if(b-a>9998){out.textContent='범위가 너무 커요';$('histN').textContent='번호는 최대 9,999개까지 뽑을 수 있어요';return;}
  const key=a+'~'+b;
  if(key!==nRange){nRange=key;nUsed.clear();nHist=[];} // 범위가 바뀌면 새로 시작
  const noRep=$('noRepN')?$('noRepN').checked:false;
  const nums=[];for(let i=a;i<=b;i++){if(!noRep||!nUsed.has(i))nums.push(String(i));}
  if(!nums.length){out.textContent='모두 뽑았어요 🎉';$('histN').textContent='‘복원’을 누르면 처음부터 다시 뽑아요';return;}
  rollPick(out,nums,w=>'🎯 '+w+'번',p=>{
    nUsed.add(+p);
    nHist.unshift(p);if(nHist.length>5)nHist.pop();
    $('histN').textContent='최근: '+nHist.join(' → ')+(noRep?' · 남은 '+(b-a+1-nUsed.size)+'개':'');
  });
});
$('pickNRst')&&$('pickNRst').addEventListener('click',()=>{nUsed.clear();nHist=[];$('presN').textContent='— 준비 —';$('histN').textContent='';});

/* --- 모둠 나누기 --- */
$('tBtn').addEventListener('click',()=>{
  const names=plainNames($('tNames').value);
  const n=Math.min(20,Math.max(2,parseInt($('tN').value)||4));
  $('tN').value=n;
  if(!names.length){$('tRes').textContent='이름을 입력하세요';return;}
  if(names.length<n){$('tRes').textContent='인원('+names.length+'명)이 모둠 수('+n+')보다 적어요';return;}
  const sh=shuffled(names);
  const teams=Array.from({length:n},()=>[]);
  sh.forEach((nm,i)=>teams[i%n].push(nm));
  $('tRes').innerHTML=teams.map((t,i)=>`<b style="color:#F68C1F">${i+1}모둠</b> <span style="color:var(--tx4)">(${t.length})</span> ${t.map(escH).join(', ')}`).join('<br>');
});

