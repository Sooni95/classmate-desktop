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

