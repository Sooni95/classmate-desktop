/* ===== 수업 시간표 + 교시 자동 타이머 =====
   교시 시간을 한 번 입력해두면, 지금이 몇 교시인지·종료까지 얼마 남았는지
   화면 왼쪽 위 배지에 자동으로 표시하고, 종료 5분 전에 조용히 알려준다. */
(function(){
  const floatEl=$('scheduleFloat'); if(!floatEl)return;
  const sfPeriod=$('sfPeriod'),sfTime=$('sfTime');

  function loadSchedule(){try{const a=JSON.parse(localStorage.getItem('cm_schedule')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function saveSchedule(periods){localStorage.setItem('cm_schedule',JSON.stringify(periods));}
  function showPref(){return localStorage.getItem('cm_schedule_show')!=='0';}

  // "09:00-09:40" 줄들을 분 단위 시작/끝으로 파싱 (형식 안 맞는 줄은 건너뜀)
  function parseSchedule(text){
    const periods=[];
    (text||'').split('\n').forEach(line=>{
      const m=line.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if(!m)return;
      const start=(+m[1])*60+(+m[2]), end=(+m[3])*60+(+m[4]);
      if(end>start)periods.push({start,end});
    });
    return periods;
  }
  function scheduleToText(periods){return periods.map(p=>{
    const h=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
    return h(p.start)+'-'+h(p.end);
  }).join('\n');}

  $('scheduleIn').value=scheduleToText(loadSchedule());
  $('scheduleShow').checked=showPref();

  // 시작 시각·교시 수·수업/쉬는 시간만 넣으면 교시 목록을 자동으로 만들어줌 (직접 타이핑 안 해도 되게)
  $('schQGen').addEventListener('click',()=>{
    const sm=($('schQStart').value||'').trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!sm){$('scheduleMsg').textContent='시작 시각을 09:00 형식으로 입력해 주세요';return;}
    let cur=(+sm[1])*60+(+sm[2]);
    const cnt=Math.max(1,Math.min(12,parseInt($('schQCount').value)||1));
    const len=Math.max(5,Math.min(120,parseInt($('schQLen').value)||40));
    const brk=Math.max(0,Math.min(60,parseInt($('schQBreak').value)||0));
    const periods=[];
    for(let i=0;i<cnt;i++){
      periods.push({start:cur,end:cur+len});
      cur+=len+brk;
    }
    $('scheduleIn').value=scheduleToText(periods);
    $('scheduleMsg').textContent=cnt+'교시 자동 생성 — 확인 후 "저장"을 눌러주세요';
  });

  $('scheduleSave').addEventListener('click',()=>{
    const periods=parseSchedule($('scheduleIn').value);
    saveSchedule(periods);
    localStorage.setItem('cm_schedule_show',$('scheduleShow').checked?'1':'0');
    $('scheduleMsg').textContent=periods.length?('✅ '+periods.length+'개 교시 저장됨'):'저장할 교시가 없어요 (형식: 09:00-09:40)';
    tick();
  });
  $('sfHide').addEventListener('click',e=>{
    e.stopPropagation();
    localStorage.setItem('cm_schedule_show','0');
    $('scheduleShow').checked=false;
    floatEl.classList.remove('on');
  });
  makeDrag(floatEl,(e,s)=>{
    if(!s){const r=floatEl.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    floatEl.style.left=(e.clientX-s.dx)+'px';floatEl.style.top=(e.clientY-s.dy)+'px';floatEl.style.right='auto';
  },e=>e.target.tagName==='BUTTON'||e.target.classList.contains('sz-grip'));
  makeScaleHandle($('sfGrip'),floatEl,{min:0.7,max:2.6,key:'cm_schedule_scale'});

  let warnedIdx=-1; // 이번 교시에 5분 전 알림을 이미 보냈는지 (교시 바뀌면 리셋)
  function fmt(sec){return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
  function tick(){
    const periods=loadSchedule();
    if(!periods.length||!showPref()){floatEl.classList.remove('on');return;}
    const now=new Date();
    const nowMin=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
    let idx=periods.findIndex(p=>nowMin>=p.start&&nowMin<p.end);
    if(idx===-1){
      // 쉬는 시간 또는 수업 시간 밖: 다음 교시가 있으면 "쉬는 시간", 없으면 배지 숨김
      const next=periods.find(p=>p.start>nowMin);
      if(!next){floatEl.classList.remove('on');return;}
      warnedIdx=-1;
      floatEl.classList.add('on');
      sfPeriod.textContent='쉬는 시간';
      sfTime.classList.remove('warn');
      const remain=Math.round((next.start-nowMin)*60);
      sfTime.textContent=fmt(Math.max(0,remain));
      return;
    }
    const p=periods[idx];
    const remainSec=Math.round((p.end-nowMin)*60);
    floatEl.classList.add('on');
    sfPeriod.textContent=(idx+1)+'교시';
    sfTime.textContent=fmt(Math.max(0,remainSec));
    const warn=remainSec<=300;
    sfTime.classList.toggle('warn',warn);
    if(warn&&warnedIdx!==idx){
      warnedIdx=idx;
      beep();
      toast('⏰ '+(idx+1)+'교시 종료 5분 전이에요');
    }
  }
  tick();
  setInterval(tick,1000);

  // 🧰 도구 메뉴의 "시간표" 항목 → 편집창 열기
  $('gcSchedule').addEventListener('click',()=>{if(typeof gShowCfg==='function')gShowCfg();openWidget('scheduleW');});
})();
