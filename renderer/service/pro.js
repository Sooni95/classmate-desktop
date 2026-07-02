/* ===== Pro 잠금 시스템 ===== */
// Pro 해제 여부 (지금은 항상 잠김 — 추후 라이선스 연동 지점)
function isPro(){ return localStorage.getItem('cm_pro')==='1'; }
function setProUI(){
  const on=isPro();
  document.querySelectorAll('.pro-badge').forEach(b=>b.style.display=on?'none':'');
  $('proBtn').classList.toggle('prolock',!on);
  // Pro면 개인 키 설정 UI 숨김 (회사 키 자동 사용)
  ['aiGear','trGear'].forEach(id=>{const el=$(id);if(el)el.style.display=on?'none':'';});
  if(on){
    const aiKeyRow=$('aiKeyRow'),trKeyRow=$('trKeyRow');
    if(aiKeyRow)aiKeyRow.classList.remove('on');
    if(trKeyRow)trKeyRow.classList.remove('on');
  }
}
// Pro 키 인증 (Cloudflare 서버 검증)
$('proKeyGo').addEventListener('click',async()=>{
  const key=$('proKeyIn').value.trim().toUpperCase();
  const msg=$('proKeyMsg');
  if(!key){msg.className='pro-key-msg err';msg.textContent='키를 입력하세요';return;}
  $('proKeyGo').disabled=true;msg.className='pro-key-msg';msg.textContent='확인 중…';
  const r=await ipc.verifyPro({key});
  $('proKeyGo').disabled=false;
  if(r.ok){
    localStorage.setItem('cm_pro','1');
    localStorage.setItem('cm_pro_key',key);
    msg.className='pro-key-msg ok';msg.textContent='✅ 인증 완료! Pro 기능이 열렸어요';
    setProUI();
    setTimeout(()=>{proWrap.classList.remove('on');toast('🧡 ClassMate Pro 활성화됨');},1200);
  }else if(r.status===404||r.valid===false){
    msg.className='pro-key-msg err';msg.textContent='유효하지 않은 키예요';
  }else if(r.status===410){
    msg.className='pro-key-msg err';msg.textContent='만료되었거나 정지된 키예요';
  }else{
    msg.className='pro-key-msg err';msg.textContent=(r.message&&r.message.startsWith('NET:'))?('서버 연결 실패: '+r.message.slice(4)):'확인 실패 — 인터넷 연결을 확인하세요';
  }
});
const proWrap=$('proWrap');
function openPro(){ proWrap.classList.add('on'); centerOnDockDisplay(proWrap); }
$('proClose').addEventListener('click',()=>proWrap.classList.remove('on'));
makeDrag($('proHead'),(e,s)=>{
  if(!s){const r=proWrap.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  proWrap.style.left=(e.clientX-s.dx)+'px';proWrap.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='proClose');

// 독 Pro 버튼 → Pro 안내 모달 (해제 시 다문화번역 패널 바로 열기)
$('proBtn').addEventListener('click',()=>{
  if(!isPro()){openPro();return;}
  // Pro 인증됨 → 기능 메뉴 표시 (Pro 버튼 위에)
  const menu=$('proMenu');
  if(menu.classList.contains('on')){menu.classList.remove('on');return;}
  const r=$('proBtn').getBoundingClientRect();
  menu.classList.add('on');
  menu.style.left=Math.max(8,r.left+r.width/2-90)+'px';
  menu.style.top=(r.top-menu.offsetHeight-8)+'px';
});
$('proMenu').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  $('proMenu').classList.remove('on');
  const act=b.dataset.act;
  if(act==='trans')setPanel('p-trans');
  else if(act==='ai')setPanel('p-ai');
  else if(act==='roster')openRosterModal();
}));
// 메뉴 바깥 클릭 시 닫기
document.addEventListener('click',e=>{
  if($('proMenu').classList.contains('on')&&!e.target.closest('#proMenu')&&e.target.id!=='proBtn'&&!e.target.closest('#proBtn'))
    $('proMenu').classList.remove('on');
});
// Pro 모달 안의 기능 항목 클릭 → 해제 상태면 해당 패널로
const PRO_PANEL={'다문화 번역':'p-trans','AI 교수 보조':'p-ai'};
document.querySelectorAll('#proWrap .pro-item').forEach(it=>{
  it.style.cursor='pointer';
  it.addEventListener('click',()=>{
    if(!isPro())return;
    const t=it.querySelector('.pi-t')?.textContent||'';
    const pid=PRO_PANEL[t];
    if(pid){proWrap.classList.remove('on');setPanel(pid);}
  });
});
// 명단 저장(roster) 잠금 버튼
document.querySelectorAll('[data-pro]').forEach(el=>{
  el.addEventListener('click',e=>{ if(!isPro()){e.preventDefault();e.stopPropagation();openPro();} });
});

// 명단 저장·불러오기 (Pro) — localStorage 'cm_rosters'
$('rosterBtn').addEventListener('click',()=>{
  if(!isPro())return; // 잠금은 위 핸들러가 처리
  openRosterModal();
});
let activeRoster=null; // 현재 게임에 불러온 명단 이름 (삭제 시 게임에서도 비우기 위함)
function getRosters(){try{return JSON.parse(localStorage.getItem('cm_rosters')||'{}');}catch(e){return {};}}
function saveRosters(r){localStorage.setItem('cm_rosters',JSON.stringify(r));}
function openRosterModal(){
  $('rosterModal').classList.add('on');
  $('rmName').value='';
  renderRosterList();
  centerOnDockDisplay($('rosterModal').querySelector('.rm-card')); // 독 있는 모니터에 배치
}
function renderRosterList(){
  const rosters=getRosters();const names=Object.keys(rosters);
  const list=$('rmList');list.innerHTML='';
  if(!names.length){list.innerHTML='<div class="rm-empty">저장된 명단이 없어요.<br>위에서 현재 명단을 저장해보세요.</div>';return;}
  names.forEach(nm=>{
    const cnt=rosters[nm].split('\n').filter(s=>s.trim()).length;
    const row=document.createElement('div');row.className='rm-item';
    row.innerHTML='<span class="rm-nm"></span><span class="rm-cnt">'+cnt+'명</span><button class="rm-load">불러오기</button><button class="rm-del">삭제</button>';
    row.querySelector('.rm-nm').textContent=nm;
    row.querySelector('.rm-load').addEventListener('click',()=>{
      $('nameList').value=rosters[nm];loadN();
      // 다른 게임에도 반영
      const names=splitNames(rosters[nm]);
      if($('wheelNames'))$('wheelNames').value=names.join('\n');
      if($('pkNames'))$('pkNames').value=names.join('\n');
      if($('tNames'))$('tNames').value=names.join('\n');
      activeRoster=nm;
      $('rosterModal').classList.remove('on');toast('📂 "'+nm+'" 불러옴 (모든 게임에 반영)');
    });
    row.querySelector('.rm-del').addEventListener('click',()=>{
      const r=getRosters();delete r[nm];saveRosters(r);
      // 게임에 불러와 있던 명단이면 게임 입력칸도 비움
      if(activeRoster===nm){
        ['nameList','wheelNames','pkNames','tNames'].forEach(id=>{if($(id))$(id).value='';});
        loadN();activeRoster=null;
        renderRosterList();toast('🗑 "'+nm+'" 삭제 — 게임 명단에서도 제외됨');return;
      }
      renderRosterList();toast('🗑 "'+nm+'" 삭제됨');
    });
    list.appendChild(row);
  });
}
$('rmSave').addEventListener('click',()=>{
  const nm=$('rmName').value.trim();
  const cur=$('nameList').value.trim();
  if(!nm){toast('명단 이름을 입력하세요');return;}
  if(!cur){toast('저장할 명단이 비어있어요 (이름 목록을 먼저 입력)');return;}
  const r=getRosters();r[nm]=cur;saveRosters(r);
  $('rmName').value='';renderRosterList();toast('💾 "'+nm+'" 저장됨');
});
$('rmClose').addEventListener('click',()=>$('rosterModal').classList.remove('on'));
// 카드 헤더 드래그로 이동
makeDrag($('rosterModal').querySelector('.rm-head'),(e,s)=>{
  const card=$('rosterModal').querySelector('.rm-card');
  if(!s){const r=card.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
  card.style.left=(e.clientX-s.dx)+'px';card.style.top=(e.clientY-s.dy)+'px';
},e=>e.target.id==='rmClose');
// 배경 클릭 시 닫기 (카드 바깥)
$('rosterModal').addEventListener('click',e=>{if(e.target.id==='rosterModal')$('rosterModal').classList.remove('on');});

// ── 엑셀 명단 가져오기 (드래그앤드롭 + 파일선택) ──
$('rmTemplate').addEventListener('click',async()=>{
  const r=await ipc.saveTemplate();
  if(r&&r.ok)toast('📥 양식을 저장했어요');
});
const rmDrop=$('rmDrop');
function b64ToU8(b64){const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8;}
async function pickRoster(){
  try{
    const r=await ipc.pickRosterFile();
    if(r&&r.error){toast('파일 선택 창을 열지 못했어요: '+r.error);}
    else if(r)parseRosterData(r.name,b64ToU8(r.b64));
  }
  catch(e){toast('파일 선택 창을 열지 못했어요: '+(e&&e.message||e));}
}
$('rmPick').addEventListener('click',e=>{e.stopPropagation();pickRoster();});
rmDrop.addEventListener('click',()=>pickRoster());
$('rmFile').addEventListener('change',e=>{if(e.target.files[0])parseRosterFile(e.target.files[0]);});
['dragenter','dragover'].forEach(ev=>rmDrop.addEventListener(ev,e=>{e.preventDefault();rmDrop.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>rmDrop.addEventListener(ev,e=>{e.preventDefault();rmDrop.classList.remove('drag');}));
rmDrop.addEventListener('drop',async e=>{
  e.preventDefault();rmDrop.classList.remove('drag');
  const f=e.dataTransfer.files[0];if(!f)return;
  if(f.path){const r=await ipc.readPath(f.path);if(r){parseRosterData(r.name,b64ToU8(r.b64));return;}}
  parseRosterFile(f); // 경로를 못 얻으면 브라우저 방식으로
});
// 창 전체에 파일을 떨어뜨려도 페이지가 파일로 이동하지 않도록 차단
['dragover','drop'].forEach(ev=>window.addEventListener(ev,e=>e.preventDefault(),false));
function parseRosterFile(file){
  const reader=new FileReader();
  reader.onload=e=>parseRosterData(file.name,new Uint8Array(e.target.result));
  reader.readAsArrayBuffer(file);
}
function parseRosterData(fname,u8){
  const name=(fname||'').toLowerCase();
  if(!/\.(xlsx|xls|csv)$/.test(name)){toast('xlsx 또는 csv 파일을 올려주세요');return;}
  try{
      const wb=XLSX.read(u8,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      if(!rows.length){toast('빈 파일이에요');return;}
      // 헤더 찾기 (이름 열 위치)
      let head=rows[0].map(x=>String(x).trim());
      const colName=head.findIndex(h=>/이름|성명|name/i.test(h));
      const colNo=head.findIndex(h=>/번호|no|번/i.test(h));
      const colTeam=head.findIndex(h=>/모둠|조|팀|team|group/i.test(h));
      const colW=head.findIndex(h=>/가중치|개수|weight|count/i.test(h));
      const ni=colName>=0?colName:0; // 이름 못 찾으면 첫 열
      const data=rows.slice(colName>=0?1:0).filter(r=>String(r[ni]||'').trim());
      if(!data.length){toast('이름 데이터가 없어요');return;}
      // 발표자 명단(nameList)에 이름 채우기
      const names=data.map(r=>String(r[ni]).trim());
      $('nameList').value=names.join('\n');loadN();
      // 핀볼: 가중치 반영 (이름*N)
      if(colW>=0){
        const pk=data.map(r=>{const w=parseInt(r[colW])||1;return w>1?String(r[ni]).trim()+'*'+Math.min(10,w):String(r[ni]).trim();});
        if($('pkNames'))$('pkNames').value=pk.join('\n');
      }else if($('pkNames'))$('pkNames').value=names.join('\n');
      // 돌림판도 채우기
      if($('wheelNames'))$('wheelNames').value=names.join('\n');
      // 모둠 정보가 있으면 안내
      let msg='📂 '+names.length+'명 불러옴';
      if(colTeam>=0)msg+=' (모둠 정보 포함)';
      toast(msg);
      // 저장 이름 자동 추천
      if(!$('rmName').value)$('rmName').value=(fname||'명단').replace(/\.(xlsx|xls|csv)$/i,'');
    }catch(err){toast('파일을 읽지 못했어요: '+err.message);}
}

// 구독 안내 받기 → Google Forms (기본 브라우저에서 열기)
const PRO_FORM_URL='https://forms.gle/ZK8hxnx65injpK3R8';
$('proCta').addEventListener('click',()=>{
  proWrap.classList.remove('on');
  ipc.openExternal(PRO_FORM_URL);
  toast('📋 구독 신청 폼을 브라우저에서 열었어요');
});
// app.js는 이 파일보다 먼저 로드되어 여기서 직접 호출할 수 없으므로, 정의된 이 파일 쪽에서 초기 실행
setProUI();
