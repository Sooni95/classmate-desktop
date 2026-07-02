/* ===== 첫 실행 온보딩 ===== */
(function(){
  const wrap=$('onboardWrap'); if(!wrap)return;
  const card=wrap.querySelector('.ob-card');
  const steps=[...wrap.querySelectorAll('.ob-step')];
  const dots=[...wrap.querySelectorAll('.ob-dots span')];
  const nextBtn=$('obNext');
  let i=0;
  function render(){
    steps.forEach((s,idx)=>s.classList.toggle('on',idx===i));
    dots.forEach((d,idx)=>d.classList.toggle('on',idx===i));
    nextBtn.textContent=(i===steps.length-1)?'시작하기!':'다음';
  }
  function closeOnboarding(){
    wrap.classList.remove('on');
    localStorage.setItem('cm_onboarded','1');
  }
  function openOnboarding(){
    i=0;render();
    wrap.classList.add('on');setIgnore(false);
    centerOnDockDisplay(card);
  }
  nextBtn.addEventListener('click',()=>{
    if(i<steps.length-1){i++;render();}
    else closeOnboarding();
  });
  $('obSkip').addEventListener('click',closeOnboarding);
  makeDrag($('obHead'),(e,s)=>{
    if(!s){const r=card.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    card.style.left=(e.clientX-s.dx)+'px';card.style.top=(e.clientY-s.dy)+'px';
  },e=>e.target.tagName==='BUTTON');

  // 설정 메뉴 "가이드 다시보기"에서 재사용
  window.openOnboarding=openOnboarding;

  // 처음 실행이면 잠깐 뜸을 들였다가 자동으로 보여줌 (독 배치 등 초기화가 끝난 뒤)
  if(!localStorage.getItem('cm_onboarded')){
    setTimeout(openOnboarding,500);
  }
})();
