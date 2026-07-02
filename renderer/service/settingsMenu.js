/* ===== ⚙ 설정 메뉴 + 🌗 테마 + ✉️ 의견 보내기 + 🧩 독 편집 ===== */
(function(){
  const dockEl=$('dock'), setBtn=$('setBtn'), setMenu=$('setMenu');
  if(!setBtn||!setMenu)return;

  /* --- 메뉴 토글 --- */
  function closeSet(){setMenu.classList.remove('on');}
  setBtn.addEventListener('click',e=>{
    e.stopPropagation();
    if(setMenu.classList.contains('on')){closeSet();return;}
    setMenu.classList.add('on');
    const r=setBtn.getBoundingClientRect(),mw=setMenu.offsetWidth,mh=setMenu.offsetHeight;
    let lx=r.right-mw; if(lx<8)lx=8;
    let ty=r.top-mh-8; if(ty<8)ty=r.bottom+8;
    setMenu.style.left=lx+'px'; setMenu.style.top=ty+'px';
  });
  document.addEventListener('click',e=>{
    if(setMenu.classList.contains('on')&&!setMenu.contains(e.target)&&!setBtn.contains(e.target))closeSet();
  });

  /* --- 🌗 테마 (독 중심) --- */
  function applyAlpha(a){ // a: 5~100 (100=불투명)
    document.documentElement.style.setProperty('--glass-alpha',(a/100).toFixed(2));
    document.body.classList.toggle('translucent',a<100);
    const gr=$('glassRange'); if(gr)gr.value=a;
  }
  function applyTheme(t){
    document.body.classList.toggle('light',t==='light');
    applyAlpha(parseInt(localStorage.getItem('cm_glass_alpha')||'100'));
  }
  applyTheme(localStorage.getItem('cm_theme')||'dark');
  function toggleTheme(){
    const next=document.body.classList.contains('light')?'dark':'light';
    localStorage.setItem('cm_theme',next);applyTheme(next);
    toast(next==='light'?'🌞 라이트 모드':'🌙 다크 모드');
  }
  if($('glassRange'))$('glassRange').addEventListener('input',e=>{
    const a=parseInt(e.target.value);
    localStorage.setItem('cm_glass_alpha',String(a));
    applyAlpha(a);
  });

  /* --- ✉️ 의견 보내기 --- */
  const fbModal=$('feedbackModal'),fbMsg=$('fbMsg'),fbContact=$('fbContact'),fbSend=$('fbSend'),fbStatus=$('fbStatus');
  const fbCard=fbModal.querySelector('.fb-card'),fbHead=fbModal.querySelector('.fb-head');
  const FEEDBACK_TO='ksh0502@nepes.co.kr'; // 메일 앱 폴백 수신처 (NEPES 회사메일; 차단 시 ksh0502@kocoa.or.kr 로 변경)
  function openFeedback(){
    fbStatus.textContent='';fbStatus.className='fb-status';fbSend.disabled=false;
    fbModal.classList.add('on');setIgnore(false);ipc.grabFocus&&ipc.grabFocus();
    // 독이 있는 모니터 중앙에 (멀티모니터 중간 걸침 방지)
    centerOnDockDisplay(fbCard);
    setTimeout(()=>fbMsg.focus(),60);
  }
  function closeFeedback(){fbModal.classList.remove('on');}
  $('fbClose').addEventListener('click',closeFeedback);
  $('fbCancel').addEventListener('click',closeFeedback);
  // 카드 어디를 잡아도 이동 (단, 입력칸·버튼 누를 땐 드래그 안 함 → 타이핑/클릭 정상)
  makeDrag(fbCard,(e,s)=>{
    if(!s){const r=fbCard.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    fbCard.style.left=(e.clientX-s.dx)+'px';fbCard.style.top=(e.clientY-s.dy)+'px';
  },e=>{const t=e.target;return t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='BUTTON'||t.id==='fbClose';});
  fbSend.addEventListener('click',async()=>{
    const message=fbMsg.value.trim();
    if(!message){fbStatus.className='fb-status err';fbStatus.textContent='내용을 입력해 주세요.';return;}
    const contact=fbContact.value.trim();
    fbSend.disabled=true;fbStatus.className='fb-status';fbStatus.textContent='보내는 중…';
    let meta='';try{const i=await ipc.getAppInfo();meta='v'+((i&&i.version)||'?');}catch(e){}
    let r=null;try{r=await ipc.feedback({message,contact,meta});}catch(e){r=null;}
    if(r&&r.ok){
      fbStatus.className='fb-status ok';fbStatus.textContent='접수되었습니다. 감사합니다! 🧡';
      fbMsg.value='';fbContact.value='';setTimeout(closeFeedback,1400);return;
    }
    // 서버 전송 실패 (오프라인 또는 워커 라우트 미배포)
    if(r&&r.status===0)fbStatus.textContent='인터넷 연결을 확인한 뒤 다시 보내 주세요.';
    else fbStatus.textContent='전송에 실패했어요. 잠시 후 다시 시도해 주세요.';
    fbStatus.className='fb-status err';fbSend.disabled=false;
  });

  /* --- 🧩 독 편집 (도구 표시/숨김 + 순서) --- */
  const TOOL_META={timer:'⏱ 타이머',game:'🎲 뽑기·게임',draw:'✏️ 펜',ptr:'🎯 포인터',noise:'📢 소음',memo:'📝 메모',pin:'📌 핀',tools:'🧰 도구',qr:'🔗 URL',exp:'📋 기록저장',pro:'🧡 Pro'};
  const ALL_IDS=Object.keys(TOOL_META);
  const drawer=$('dockDrawer'),hiddenBox=$('dockHidden');
  const toolBtn=id=>dockEl.querySelector('.tool[data-id="'+id+'"]');
  function loadCfg(){
    let order=[],hidden=[];
    try{order=JSON.parse(localStorage.getItem('cm_dock_order')||'[]');}catch(e){}
    try{hidden=JSON.parse(localStorage.getItem('cm_dock_hidden')||'[]');}catch(e){}
    if(!Array.isArray(order))order=[]; if(!Array.isArray(hidden))hidden=[];
    ALL_IDS.forEach(id=>{if(!order.includes(id))order.push(id);});
    return {order:order.filter(id=>ALL_IDS.includes(id)),hidden:hidden.filter(id=>ALL_IDS.includes(id))};
  }
  const saveCfg=(order,hidden)=>{localStorage.setItem('cm_dock_order',JSON.stringify(order));localStorage.setItem('cm_dock_hidden',JSON.stringify(hidden));};
  const currentOrder=()=>[...dockEl.querySelectorAll('.tool[data-id]')].map(b=>b.dataset.id);
  const currentHidden=()=>ALL_IDS.filter(id=>{const b=toolBtn(id);return b&&b.style.display==='none';});
  function applyCfg(){
    const {order,hidden}=loadCfg();
    order.forEach(id=>{const b=toolBtn(id);if(b)dockEl.insertBefore(b,setBtn);});
    ALL_IDS.forEach(id=>{const b=toolBtn(id);if(b)b.style.display=(id!=='pro'&&hidden.includes(id))?'none':'';}); // Pro는 항상 표시
  }
  function renderDrawer(){
    hiddenBox.innerHTML='';
    currentHidden().forEach(id=>{
      const m=TOOL_META[id],it=document.createElement('div');it.className='dd-item';
      it.innerHTML='<span class="em">'+m.split(' ')[0]+'</span>'+m.split(' ').slice(1).join(' ');
      it.addEventListener('click',()=>{const b=toolBtn(id);if(b)b.style.display='';saveCfg(currentOrder(),currentHidden());renderDrawer();});
      hiddenBox.appendChild(it);
    });
  }
  function addDx(){
    dockEl.querySelectorAll('.tool[data-id]').forEach(b=>{
      if(b.dataset.id==='pro')return; // Pro는 제거 불가
      if(b.querySelector('.dx'))return;
      const x=document.createElement('span');x.className='dx';x.textContent='×';
      x.addEventListener('click',ev=>{ev.stopPropagation();b.style.display='none';saveCfg(currentOrder(),currentHidden());renderDrawer();});
      b.appendChild(x);
    });
  }
  const removeDx=()=>dockEl.querySelectorAll('.tool .dx').forEach(x=>x.remove());
  let editing=false;
  function enterEdit(){
    if(typeof setPanel==='function')setPanel(null);
    editing=true;dockEditing=true;dockEl.classList.add('editing');addDx();renderDrawer();
    const r=dockEl.getBoundingClientRect();
    drawer.classList.add('on');
    drawer.style.left=Math.max(8,Math.min(r.left,innerWidth-drawer.offsetWidth-8))+'px';
    drawer.style.top=(r.bottom+10)+'px';
    setIgnore(false);
  }
  function exitEdit(){
    editing=false;dockEditing=false;dockEl.classList.remove('editing');removeDx();drawer.classList.remove('on');
    saveCfg(currentOrder(),currentHidden());toast('🧩 독 편집을 저장했어요');
  }
  $('dockDone').addEventListener('click',exitEdit);
  // 편집 중 도구 클릭은 원래 동작(패널 열기) 대신 무시
  dockEl.addEventListener('click',e=>{
    if(!editing)return;
    const t=e.target.closest('.tool[data-id]');
    if(t&&!e.target.classList.contains('dx')){e.stopPropagation();e.preventDefault();}
  },true);
  // 드래그로 순서 변경 — document 리스너 + FLIP (캡처/커서-지오메트리 의존 제거)
  let dragEl=null,dragMove=null,dragUp=null;
  function reorderAt(clientX){
    if(!dragEl)return;
    const sibs=[...dockEl.querySelectorAll('.tool[data-id]')].filter(b=>b!==dragEl&&b.style.display!=='none');
    let target=setBtn;
    for(const b of sibs){const r=b.getBoundingClientRect();if(clientX<r.left+r.width/2){target=b;break;}}
    if(dragEl.nextElementSibling===target)return; // 위치 변화 없음 (요소 기준 — 공백 텍스트노드 무시)
    // FLIP: 이동하는 형제들을 부드럽게 슬라이드
    const others=[...dockEl.querySelectorAll('.tool[data-id]')].filter(b=>b!==dragEl);
    const firsts=new Map(others.map(b=>[b,b.getBoundingClientRect().left]));
    dockEl.insertBefore(dragEl,target);
    others.forEach(b=>{
      const dx=firsts.get(b)-b.getBoundingClientRect().left;
      if(dx){b.style.transition='none';b.style.transform='translateX('+dx+'px)';
        requestAnimationFrame(()=>{b.style.transition='transform .22s cubic-bezier(.2,.8,.2,1)';b.style.transform='';});}
    });
  }
  dockEl.addEventListener('pointerdown',e=>{
    if(!editing)return;
    const t=e.target.closest('.tool[data-id]');
    if(!t||e.target.classList.contains('dx'))return;
    e.preventDefault();
    dragEl=t;t.classList.add('dragging');
    dragMove=ev=>reorderAt(ev.clientX);
    dragUp=()=>{
      document.removeEventListener('pointermove',dragMove);
      document.removeEventListener('pointerup',dragUp);
      document.removeEventListener('pointercancel',dragUp);
      if(dragEl){
        dragEl.classList.remove('dragging');
        dockEl.querySelectorAll('.tool[data-id]').forEach(b=>{b.style.transition='';b.style.transform='';});
        saveCfg(currentOrder(),currentHidden());renderDrawer();dragEl=null;
      }
    };
    document.addEventListener('pointermove',dragMove);
    document.addEventListener('pointerup',dragUp);
    document.addEventListener('pointercancel',dragUp);
  });

  /* --- 💾 설정·명단 백업 (내보내기/가져오기) --- */
  const BK_KEYS=['cm_rosters','cm_dock_order','cm_dock_hidden','cm_theme','cm_glass_alpha','cm_shortcuts','su_keys','noise_guide_seen'];
  const bkModal=$('backupModal'),bkCard=bkModal?bkModal.querySelector('.bk-card'):null;
  function bkSay(msg,good){const s=$('bkStatus');if(!s)return;s.textContent=msg||'';s.className='bk-status'+(good===true?' ok':good===false?' err':'');}
  function openBackup(){if(!bkModal)return;bkSay('');bkModal.classList.add('on');setIgnore(false);centerOnDockDisplay(bkCard);}
  function closeBackup(){if(bkModal)bkModal.classList.remove('on');}
  if(bkModal){
    $('bkClose').addEventListener('click',closeBackup);
    makeDrag(bkModal.querySelector('.bk-head'),(e,s)=>{
      if(!s){const r=bkCard.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      bkCard.style.left=(e.clientX-s.dx)+'px';bkCard.style.top=(e.clientY-s.dy)+'px';
    },e=>e.target.id==='bkClose');
    $('bkExport').addEventListener('click',async()=>{
      const out={app:'ClassMate',type:'backup',v:1,date:new Date().toISOString(),data:{}};
      BK_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!=null)out.data[k]=v;});
      const json=JSON.stringify(out,null,2);
      const bytes=Array.from(new TextEncoder().encode(json));
      const now=new Date();
      const fn='ClassMate_백업_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'.json';
      const r=await ipc.saveBinary({bytes,filename:fn,ext:'json'});
      if(r&&r.ok)bkSay('내보내기 완료 — 안전한 곳에 보관하세요.',true);
      else if(r&&r.canceled)bkSay('');
      else bkSay('저장에 실패했어요.',false);
    });
    $('bkImport').addEventListener('click',async()=>{
      const f=await ipc.pickBackup();
      if(!f)return;
      if(f.error){bkSay('파일 선택 창을 열지 못했어요: '+f.error,false);return;}
      let obj=null;
      try{obj=JSON.parse(f.text.replace(/^\uFEFF/,''));}catch(e){bkSay('백업 파일을 읽을 수 없어요(형식 오류).',false);return;}
      if(!obj||obj.app!=='ClassMate'||!obj.data){bkSay('ClassMate 백업 파일이 아니에요.',false);return;}
      let n=0;
      BK_KEYS.forEach(k=>{if(typeof obj.data[k]==='string'){localStorage.setItem(k,obj.data[k]);n++;}});
      try{applyTheme(localStorage.getItem('cm_theme')||'dark');}catch(e){} // 테마 즉시 반영
      try{applyCfg();}catch(e){}                                          // 독 구성 즉시 반영
      bkSay('복원 완료 — '+n+'개 항목을 불러왔어요. 🧡',true);
      toast('💾 백업을 복원했어요');
    });
  }

  /* --- ⌨️ 단축키 설정 --- */
  const SC_DEFS=[
    ['hk-draw','✏️ 펜','Control+Alt+P'],
    ['hk-ring','🎯 링 포인터','Control+Alt+R'],
    ['hk-spot','🔦 스포트라이트','Control+Alt+O'],
    ['hk-lens','🔍 돋보기','Control+Alt+L'],
    ['hk-snip','📷 영역 캡처','Control+Alt+S'],
    ['hk-dock','📌 툴바 표시/숨김','Control+Alt+`'],
    ['hk-escape','⛔ 모두 끄기','Control+Alt+0'],
  ];
  const scModal=$('scModal'),scCard=scModal?scModal.querySelector('.sc-card'):null;
  let scCustom=JSON.parse(localStorage.getItem('cm_shortcuts')||'{}');
  const scEff=ch=>scCustom[ch]||(SC_DEFS.find(d=>d[0]===ch)||[])[2]||'';
  const scPretty=a=>a.replace('Control','Ctrl').replace('Super','Win').replace(/\+/g,' + ');
  function scApply(){try{ipc.setShortcuts(scCustom);}catch(e){}}
  scApply(); // 로드 시 저장된 사용자 단축키 적용
  let scCapturing=null;
  function scRender(){
    const list=$('scList'); if(!list)return; list.innerHTML='';
    SC_DEFS.forEach(([ch,lab])=>{
      const row=document.createElement('div');row.className='sc-item';
      row.innerHTML='<span class="sc-lab">'+lab+'</span><span class="sc-key">'+scPretty(scEff(ch))+'</span><button class="sc-chg">변경</button>';
      const keyEl=row.querySelector('.sc-key'),btn=row.querySelector('.sc-chg');
      btn.addEventListener('click',()=>scCapture(ch,keyEl,btn));
      list.appendChild(row);
    });
  }
  function scCapture(ch,keyEl,btn){
    if(scCapturing)scCapturing.cancel();
    keyEl.classList.add('capturing');keyEl.textContent='키 입력…';btn.textContent='취소';
    const onKey=e=>{
      e.preventDefault();e.stopPropagation();
      if(e.key==='Escape'){done();return;}
      if(['Control','Alt','Shift','Meta'].includes(e.key))return; // 보조키 단독 무시
      const mods=[];if(e.ctrlKey)mods.push('Control');if(e.altKey)mods.push('Alt');if(e.shiftKey)mods.push('Shift');if(e.metaKey)mods.push('Super');
      let k=e.key;
      if(k===' ')k='Space';else if(/^[a-z]$/i.test(k))k=k.toUpperCase();else if(k.startsWith('Arrow'))k=k.replace('Arrow','');
      const isF=/^F\d{1,2}$/.test(k);
      if(!isF&&mods.length===0){keyEl.textContent='보조키 필요(Ctrl/Alt…)';return;}
      const acc=[...mods,k].join('+');
      scCustom[ch]=acc;localStorage.setItem('cm_shortcuts',JSON.stringify(scCustom));scApply();
      done();scRender();toast('⌨️ 저장됨: '+scPretty(acc));
    };
    function done(){document.removeEventListener('keydown',onKey,true);keyEl.classList.remove('capturing');keyEl.textContent=scPretty(scEff(ch));btn.textContent='변경';scCapturing=null;}
    scCapturing={cancel:done};
    document.addEventListener('keydown',onKey,true);
  }
  function openShortcuts(){if(!scModal)return;scRender();scModal.classList.add('on');setIgnore(false);centerOnDockDisplay(scCard);}
  function closeShortcuts(){if(scCapturing)scCapturing.cancel();if(scModal)scModal.classList.remove('on');}
  if(scModal){
    $('scClose').addEventListener('click',closeShortcuts);
    makeDrag(scModal.querySelector('.bk-head'),(e,s)=>{
      if(!s){const r=scCard.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
      scCard.style.left=(e.clientX-s.dx)+'px';scCard.style.top=(e.clientY-s.dy)+'px';
    },e=>e.target.id==='scClose');
    $('scReset').addEventListener('click',()=>{scCustom={};localStorage.removeItem('cm_shortcuts');scApply();scRender();toast('⌨️ 기본값으로 되돌렸어요');});
  }

  /* --- 메뉴 액션 --- */
  setMenu.addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    closeSet();
    if(b.dataset.act==='theme')toggleTheme();
    else if(b.dataset.act==='dockedit')enterEdit();
    else if(b.dataset.act==='shortcuts')openShortcuts();
    else if(b.dataset.act==='backup')openBackup();
    else if(b.dataset.act==='feedback')openFeedback();
  });

  /* --- Esc 로 닫기 --- */
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(scModal&&scModal.classList.contains('on')){closeShortcuts();}
    else if(bkModal&&bkModal.classList.contains('on')){closeBackup();}
    else if(fbModal.classList.contains('on')){closeFeedback();}
    else if(setMenu.classList.contains('on')){closeSet();}
    else if(editing){exitEdit();}
  });

  applyCfg();
})();
