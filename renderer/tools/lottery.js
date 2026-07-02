/* --- 제비뽑기 (번호 표시) --- */
const drawWrap=$('drawWrap');let drawData=[],drawWinLeft=0;
makeDrag($('drawHead'),(e,s)=>{
  if(!s){const r=drawWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  drawWrap.style.left=(e.clientX-s.dx)+'px';drawWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='drawClose');
$('drawClose').addEventListener('click',()=>drawWrap.classList.remove('on'));
$('drawOpen').addEventListener('click',()=>{
  const cnt=Math.min(60,Math.max(2,parseInt($('drawCnt').value)||30));
  const winN=Math.min(cnt,Math.max(1,parseInt($('drawWin').value)||1));
  // 당첨 위치 무작위 (번호는 1..cnt 고정 표시, 당첨 여부만 숨김)
  const winIdx=new Set();while(winIdx.size<winN)winIdx.add(Math.floor(Math.random()*cnt));
  drawData=Array.from({length:cnt},(_,i)=>({no:i+1,win:winIdx.has(i),open:false}));
  drawWinLeft=winN;
  renderDraw();
  drawWrap.classList.add('on');centerOnDockDisplay(drawWrap);
});
function renderDraw(){
  $('drawCount').textContent='제비 '+drawData.length+'개 · 당첨 '+drawWinLeft+'개 남음';
  $('drawResult').textContent='학생이 번호를 부르면 그 제비를 클릭하세요';
  const g=$('drawGrid');g.innerHTML='';
  drawData.forEach((d,i)=>{
    const t=document.createElement('div');t.className='ticket';
    t.innerHTML='<span class="tk-no">'+d.no+'</span><span class="tk-win">👑</span><span class="tk-txt"></span>';
    if(!d.open)t.addEventListener('click',()=>openTicket(i,t));
    g.appendChild(t);
  });
}
function openTicket(i,el){
  if(drawData[i].open)return;
  drawData[i].open=true;
  el.classList.add('open');
  const txt=el.querySelector('.tk-txt');
  if(drawData[i].win){
    el.classList.add('win');txt.classList.add('hit');
    txt.innerHTML='<span class="tk-emo">🎉</span><span class="tk-lbl">당첨</span>';
    if(drawWinLeft>0)drawWinLeft--;beep();
    $('drawResult').innerHTML='🎉 <b style="color:#F68C1F">'+drawData[i].no+'번 당첨!</b>';
  }else{
    txt.classList.add('lose');
    txt.innerHTML='<span class="tk-emo">💧</span><span class="tk-lbl">꽝</span>';
    $('drawResult').textContent=drawData[i].no+'번 — 꽝!';
  }
  $('drawCount').textContent='제비 '+drawData.length+'개 · 당첨 '+drawWinLeft+'개 남음';
}

// 플로팅 위젯 공통: 표시 + 드래그 + 닫기
function openWidget(id){
  const w=$(id);
  if(!w.dataset.init){
    makeDrag(w.querySelector('.fwh'),(e,s)=>{
      if(!s){const r=w.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      w.style.left=(e.clientX-s.dx)+'px';w.style.top=(e.clientY-s.dy)+'px';
    },e=>e.target.classList.contains('x'));
    w.querySelector('.x').addEventListener('click',()=>w.classList.remove('on'));
    w.dataset.init='1';
    if(id==='scoreW'){
      const saved=loadScores();
      if(saved.length)saved.forEach(s=>scoreAddRow(s.name,s.score));
      else [1,2,3].forEach(()=>scoreAddRow());
    }
    if(id==='diceW')diceRender(1);
  }
  w.classList.add('on');
  const d=dockDisp();
  w.style.left=(d.x+d.w/2-w.offsetWidth/2+(Math.random()*80-40))+'px';
  w.style.top=(d.y+d.h/2-w.offsetHeight/2)+'px';
}

/* --- 모둠 점수판 (localStorage에 자동 저장 — 앱 재시작해도 유지) --- */
let scoreN=0;const SCORE_COL=['#F68C1F','#5b8def','#37c871','#e84d3d','#a78bfa','#ffc02e'];
function loadScores(){try{const a=JSON.parse(localStorage.getItem('cm_score')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function saveScores(){
  const rows=[...$('scoreRows').children].map(r=>({name:r.querySelector('.nm2').value,score:+r.dataset.score}));
  localStorage.setItem('cm_score',JSON.stringify(rows));
}
function scoreAddRow(name,score){
  scoreN++;const i=scoreN;
  const row=document.createElement('div');row.className='srow2';
  row.dataset.score=score||0;
  row.innerHTML=`<span class="crown"></span>
    <span style="width:9px;height:9px;border-radius:50%;background:${SCORE_COL[(i-1)%6]}"></span>
    <input class="nm2" value="${name||('모둠 '+i)}">
    <button class="mn">－</button><span class="sc">${score||0}</span><button class="pl2">＋</button>
    <button class="sdel" title="모둠 삭제">✕</button>`;
  $('scoreRows').appendChild(row);
  const sc=row.querySelector('.sc');
  const upd=d=>{let v=+row.dataset.score+d;row.dataset.score=v;sc.textContent=v;sc.classList.remove('pop');void sc.offsetWidth;sc.classList.add('pop');scoreRank();saveScores();};
  row.querySelector('.pl2').addEventListener('click',()=>upd(1));
  row.querySelector('.mn').addEventListener('click',()=>upd(-1));
  row.querySelector('.nm2').addEventListener('input',saveScores);
  row.querySelector('.sdel').addEventListener('click',()=>{row.remove();scoreRank();saveScores();});
  scoreRank();
}
function scoreRank(){
  const rows=[...$('scoreRows').children];
  const max=Math.max(...rows.map(r=>+r.dataset.score));
  rows.forEach(r=>{
    const lead=+r.dataset.score===max&&max>0;
    r.classList.toggle('lead',lead);
    r.querySelector('.crown').textContent=lead?'👑':'';
  });
}
$('scoreAdd').addEventListener('click',()=>{scoreAddRow();saveScores();});
$('scoreReset').addEventListener('click',()=>{
  if(!confirm('모둠 점수판을 초기화할까요? 지금 점수가 모두 사라져요.'))return;
  $('scoreRows').innerHTML='';
  [1,2,3].forEach(()=>scoreAddRow());
  saveScores();
});

/* --- 주사위 --- */
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
let diceCount=1;
$('diceW')&&$('diceW').querySelectorAll('.dcnt button').forEach(b=>b.addEventListener('click',()=>{
  $('diceW').querySelectorAll('.dcnt button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');diceCount=+b.dataset.n;diceRender(diceCount);$('diceTotal').textContent='';
}));
function dieEl(v){
  const d=document.createElement('div');d.className='die';
  for(let i=0;i<9;i++){const dot=document.createElement('i');if(PIPS[v].includes(i))dot.style.visibility='visible';d.appendChild(dot);}
  return d;
}
function diceRender(n,vals){
  const wrap=$('diceFaces');wrap.innerHTML='';
  for(let i=0;i<n;i++)wrap.appendChild(dieEl(vals?vals[i]:1));
}
let diceRolling=false;
$('diceRoll').addEventListener('click',()=>{
  if(diceRolling)return;diceRolling=true;
  $('diceRoll').disabled=true;$('diceTotal').textContent='';
  let n=0;const total=13;
  const iv=setInterval(()=>{
    const vals=Array.from({length:diceCount},()=>1+Math.floor(Math.random()*6));
    diceRender(diceCount,vals);
    $('diceFaces').querySelectorAll('.die').forEach(d=>d.classList.add('rolling'));
    if(++n>=total){
      clearInterval(iv);
      const fin=Array.from({length:diceCount},()=>1+Math.floor(Math.random()*6));
      diceRender(diceCount,fin);
      // 착지 연출
      $('diceFaces').querySelectorAll('.die').forEach(d=>{d.classList.remove('rolling');d.classList.add('landed');});
      const sum=fin.reduce((a,b)=>a+b,0);
      $('diceTotal').innerHTML=diceCount>1?('합계 <b>'+sum+'</b>'):('<b>'+sum+'</b>');
      beep();
      setTimeout(()=>{$('diceFaces').querySelectorAll('.die').forEach(d=>d.classList.remove('landed'));},320);
      diceRolling=false;$('diceRoll').disabled=false;
    }
  },90);
});

/* --- 🎱 행운 번호 뽑기 (로또식 추첨) --- */
(function(){
  const cv=$('lottoCv'); if(!cv)return;
  const cx=cv.getContext('2d'),W=cv.width,H=cv.height,CX=W/2,CY=H/2,R=Math.min(W,H)/2-6;
  const LC=['#F68C1F','#5b8def','#37c871','#e84d3d','#a78bfa','#ffc02e','#4dd0e1','#ff8a65','#ba68c8','#26c6da'];
  let balls=[],raf=0,spinning=false;
  function makeBalls(){
    balls=[];
    for(let i=0;i<26;i++){
      const a=Math.random()*6.2832,r=Math.random()*(R-18);
      balls.push({x:CX+Math.cos(a)*r,y:CY+Math.sin(a)*r,vx:(Math.random()-.5)*140,vy:(Math.random()-.5)*140,n:1+Math.floor(Math.random()*99),col:LC[i%LC.length]});
    }
  }
  function step(){
    if(!$('lottoW').classList.contains('on')){raf=0;return;} // 닫히면 정지
    cx.clearRect(0,0,W,H);
    cx.beginPath();cx.arc(CX,CY,R,0,6.2832);cx.strokeStyle='#46586b';cx.lineWidth=6;cx.stroke();
    const dt=0.016,ag=spinning?2.6:1;
    balls.forEach(b=>{
      if(spinning){b.vx+=(Math.random()-.5)*70;b.vy+=(Math.random()-.5)*70;}
      b.x+=b.vx*dt*ag;b.y+=b.vy*dt*ag;
      const dx=b.x-CX,dy=b.y-CY,d=Math.hypot(dx,dy),mx=R-11;
      if(d>mx){const nx=dx/d,ny=dy/d;b.x=CX+nx*mx;b.y=CY+ny*mx;const vn=b.vx*nx+b.vy*ny;b.vx-=2*vn*nx;b.vy-=2*vn*ny;b.vx*=.9;b.vy*=.9;}
      b.vx*=.994;b.vy*=.994;
      const g=cx.createRadialGradient(b.x-3,b.y-3,1,b.x,b.y,11);g.addColorStop(0,'#fff');g.addColorStop(.25,b.col);g.addColorStop(1,b.col);
      cx.beginPath();cx.arc(b.x,b.y,11,0,6.2832);cx.fillStyle=g;cx.fill();
      cx.fillStyle='#fff';cx.font='bold 10px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(b.n,b.x,b.y);
    });
    raf=requestAnimationFrame(step);
  }
  function startDrum(){makeBalls();if(!raf)raf=requestAnimationFrame(step);}
  window.lottoStart=()=>{$('lottoResult').innerHTML='';startDrum();};
  $('lottoDraw').addEventListener('click',()=>{
    let mn=parseInt($('lottoMin').value),mx=parseInt($('lottoMax').value),cnt=parseInt($('lottoCnt').value);
    mn=Math.max(0,Math.min(999,isNaN(mn)?0:mn));mx=Math.max(0,Math.min(999,isNaN(mx)?0:mx));
    if(mn>mx){const t=mn;mn=mx;mx=t;$('lottoMin').value=mn;$('lottoMax').value=mx;}
    const pool=mx-mn+1;cnt=Math.max(1,Math.min(20,Math.min(isNaN(cnt)?1:cnt,pool)));
    $('lottoResult').innerHTML='';spinning=true;startDrum();beep(1);
    setTimeout(()=>{
      spinning=false;
      const set=new Set();while(set.size<cnt)set.add(mn+Math.floor(Math.random()*pool));
      const wins=[...set].sort((a,b)=>a-b),res=$('lottoResult');
      wins.forEach((n,i)=>setTimeout(()=>{
        const s=document.createElement('span');s.className='lotto-ball';s.textContent=n;s.style.background=LC[i%LC.length];
        res.appendChild(s);beep(1);
      },i*240));
    },1700);
  });
})();
$('gcLotto')&&$('gcLotto').addEventListener('click',()=>{gShowCfg();openWidget('lottoW');if(window.lottoStart)lottoStart();});

/* --- 신호등 --- */
let lightScale=1;
document.querySelectorAll('#lightW .fw-sz').forEach(b=>b.addEventListener('click',e=>{
  e.stopPropagation();
  lightScale=Math.min(2.4,Math.max(0.7,lightScale+(+b.dataset.d>0?0.15:-0.15)));
  const w=$('lightW');w.style.transformOrigin='top left';w.style.transform='scale('+lightScale+')';
}));
$('lightW')&&$('lightW').querySelectorAll('.tl button').forEach(b=>b.addEventListener('click',()=>{
  $('lightW').querySelectorAll('.tl button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');$('lightLabel').textContent=b.dataset.m;
}));

/* --- 활동 상징 (조용히·짝·모둠 등을 화면에 크게) --- */
(function(){
  const pick=$('symPick'); if(!pick)return;
  const SYMS=[
    {e:'🤫',t:'조용히'},{e:'👂',t:'잘 듣기'},{e:'👥',t:'짝 활동'},
    {e:'👨‍👩‍👧‍👦',t:'모둠 활동'},{e:'🙋',t:'발표·질문'},{e:'🚶',t:'이동·자유'},
  ];
  SYMS.forEach(s=>{
    const b=document.createElement('button');b.className='sym-b';
    b.innerHTML='<span class="se">'+s.e+'</span><span class="st">'+s.t+'</span>';
    b.addEventListener('click',()=>{
      pick.querySelectorAll('.sym-b').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      $('symBig').textContent=s.e;$('symLabel').textContent=s.t;
    });
    pick.appendChild(b);
  });
})();

