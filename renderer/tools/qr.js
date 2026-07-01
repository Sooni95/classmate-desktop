/* ===== QR ===== */
let qrT;
$('qrUrl').addEventListener('input',e=>{clearTimeout(qrT);qrT=setTimeout(()=>genQR(e.target.value.trim()),450);});
function makeQR(el,text){
  el.innerHTML='';
  try{new QRCode(el,{text,width:132,height:132,colorDark:'#1c1d1f',colorLight:'#ffffff'});}catch(e){}
}
function genQR(url){
  const box=$('qrbox');
  if(!url){box.className='empty';box.textContent='URL 입력 시 자동 생성 (오프라인 작동)';$('qrAct').classList.remove('on');return;}
  box.className='';makeQR(box,url);
  $('qrAct').classList.add('on');
}
// QR 이미지 추출 → 저장/복사
function qrDataURL(box){
  const img=box.querySelector('img');
  if(img&&img.src)return img.src;
  const cv=box.querySelector('canvas');
  return cv?cv.toDataURL('image/png'):null;
}
async function saveQRImage(box,filename){
  const d=qrDataURL(box);
  if(!d){toast('QR을 먼저 생성하세요');return;}
  const r=await ipc.saveImage({dataURL:d,filename});
  if(r.ok)toast('💾 QR 이미지 저장 완료');
}
function copyQRImage(box){
  const d=qrDataURL(box);
  if(!d){toast('QR을 먼저 생성하세요');return;}
  ipc.copyImage(d);
  toast('📋 QR 복사됨 — 한글/PPT에 Ctrl+V');
}
$('qrSave').addEventListener('click',()=>saveQRImage($('qrbox'),'QR코드.png'));
$('qrCopy').addEventListener('click',()=>copyQRImage($('qrbox')));
$('suQrSave').addEventListener('click',()=>saveQRImage($('suQr'),'QR_'+($('suUrl').textContent.split('/')[1]||'단축주소')+'.png'));
$('suQrCopy').addEventListener('click',()=>copyQRImage($('suQr')));

/* ===== 단축주소 (코코아팹.kr) — 온라인 기능 ===== */
const SU_BASE='코코아팹.kr';
const SU_TOKEN_DEFAULT='kocoafab2026';
let suTtl=604800;
function suKeys(){try{return JSON.parse(localStorage.getItem('su_keys')||'{}');}catch(e){return{};}}
function suKeySave(slug,key){const m=suKeys();m[slug]=key;localStorage.setItem('su_keys',JSON.stringify(m));}
function genKey(){return crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2,10);}
$('suTtl').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  $('suTtl').querySelectorAll('button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');suTtl=+b.dataset.s;
}));

function suSay(msg,good){const m=$('suMsg');m.textContent=msg;m.style.color=good?'#34c759':'var(--amber)';}
$('suGo').addEventListener('click',async()=>{
  let target=$('suTarget').value.trim();
  const slug=$('suSlug').value.trim();
  const token=SU_TOKEN_DEFAULT;
  if(!target){suSay('원본 URL을 입력하세요');return;}
  if(!/^https?:\/\//i.test(target))target='https://'+target;
  if(!slug){suSay('단축 이름을 입력하세요 (예: 수업자료)');return;}
  if(/[\/\s?#]/.test(slug)||slug.toLowerCase()==='api'){suSay('단축 이름에 공백, /, ?, # 은 쓸 수 없어요');return;}
  $('suGo').disabled=true;$('suGo').textContent='만드는 중…';suSay('');
  const key=suKeys()[slug]||genKey();
  const res=await ipc.shorten({slug,target,ttl:suTtl,token,key});
  $('suGo').disabled=false;$('suGo').textContent='단축주소 만들기';
  if(res.ok){
    suKeySave(slug,key);
    let data={};try{data=JSON.parse(res.message);}catch(e){}
    const short=SU_BASE+'/'+slug;
    const exp=new Date(Date.now()+suTtl*1000);
    $('suUrl').textContent=short;
    $('suExp').textContent='만료: '+exp.getFullYear()+'.'+String(exp.getMonth()+1).padStart(2,'0')+'.'+String(exp.getDate()).padStart(2,'0')+' (이후 자동 삭제)';
    $('suCard').classList.add('on');$('suQr').classList.remove('on');$('suQr').innerHTML='';
    $('suQrAct').classList.remove('on');
    suSay(data.updated?'♻️ 기존 QR·주소 그대로 — 연결만 새 URL로 변경됐어요!':'완성! 복사하거나 QR로 띄워보세요 🎉',true);
  }else if(res.status===409){suSay('"'+slug+'" 는 다른 곳에서 사용 중인 이름이에요 — 다른 이름을 써보세요');}
  else if(res.status===403){suSay('서버 연동 오류 (관리자 문의)');}
  else if(res.status===0){suSay((res.message&&res.message.startsWith('NET:'))?('서버 연결 실패: '+res.message.slice(4)):'인터넷 연결을 확인하세요');}
  else{suSay('오류: '+(res.message||res.status));}
});
$('suCopy').addEventListener('click',()=>{
  ipc.copyText('https://'+$('suUrl').textContent);
  toast('📋 단축주소 복사됨');
});
$('suQrBtn').addEventListener('click',()=>{
  const box=$('suQr');
  if(box.classList.contains('on')){box.classList.remove('on');$('suQrAct').classList.remove('on');return;}
  box.classList.add('on');$('suQrAct').classList.add('on');
  // QR에는 퓨니코드 형태로 (구형 스캐너 호환), 화면 표시는 한글
  makeQR(box,new URL('https://'+$('suUrl').textContent).href);
});
// 만든 단축 URL 목록·관리
$('suListBtn').addEventListener('click',()=>{
  const box=$('suListBox');
  if(box.classList.contains('on')){box.classList.remove('on');box.innerHTML='';return;}
  renderSuList();box.classList.add('on');
});
function suRow(slug,onOpen,onCopy,onEdit,onDel,extra){
  const row=document.createElement('div');row.className='su-li';
  row.innerHTML='<span class="su-li-n">'+slug+(extra||'')+'</span>'
    +'<button class="su-li-b" data-a="open" title="브라우저로 열기">↗</button>'
    +'<button class="su-li-b" data-a="copy" title="주소 복사">📋</button>'
    +(onEdit?'<button class="su-li-b" data-a="edit" title="연결 수정">✏️</button>':'')
    +'<button class="su-li-b del" data-a="del" title="삭제">🗑</button>';
  row.querySelector('[data-a=open]').addEventListener('click',onOpen);
  row.querySelector('[data-a=copy]').addEventListener('click',onCopy);
  if(onEdit)row.querySelector('[data-a=edit]').addEventListener('click',onEdit);
  row.querySelector('[data-a=del]').addEventListener('click',onDel);
  return row;
}
function renderSuList(){
  const box=$('suListBox');box.innerHTML='';
  const keys=suKeys();const slugs=Object.keys(keys);
  if(!slugs.length){box.innerHTML='<div class="su-empty">아직 만든 단축 URL이 없어요.</div>';}
  slugs.forEach(slug=>{
    box.appendChild(suRow(slug,
      ()=>ipc.openExternal('https://'+new URL('https://'+SU_BASE+'/'+slug).host+'/'+slug),
      ()=>{ipc.copyText('https://'+SU_BASE+'/'+slug);toast('📋 복사됨');},
      ()=>{ // 연결 수정: 슬러그 채우고 새 URL 입력 유도
        $('suSlug').value=slug;$('suTarget').value='';$('suTarget').focus();
        suSay('새 원본 URL을 넣고 [단축주소 만들기]를 누르면 연결만 바뀝니다.');
      },
      async()=>{
        if(!confirm('"'+slug+'" 단축 URL을 삭제할까요? 배포된 QR·링크가 더 이상 연결되지 않습니다.'))return;
        const r=await ipc.suDelete({slug,key:keys[slug],token:SU_TOKEN_DEFAULT});
        if(r.ok||r.status===404){const m=suKeys();delete m[slug];localStorage.setItem('su_keys',JSON.stringify(m));renderSuList();toast('🗑 삭제됨');}
        else toast('삭제 실패 — 서버에 삭제 기능 배포가 필요해요');
      }));
  });
  // 관리자(코코아팹) 전체 관리
  const adm=document.createElement('button');adm.className='su-admin';adm.textContent='🔑 전체 URL 관리 (코코아팹 관리자)';
  adm.addEventListener('click',()=>askInput('관리자 토큰 입력','',adminListAll));
  box.appendChild(adm);
}
async function adminListAll(token){
  if(!token)return;
  const box=$('suListBox');box.innerHTML='<div class="su-empty">불러오는 중…</div>';
  const r=await ipc.suAdminList({admin:token});
  box.innerHTML='';
  if(!r.ok){box.innerHTML='<div class="su-empty">'+(r.status===401?'토큰이 올바르지 않아요':r.status===404?'서버에 관리자 기능 배포가 필요해요':'불러오기 실패')+'</div>';
    const back=document.createElement('button');back.className='su-admin';back.textContent='← 내 목록으로';back.addEventListener('click',renderSuList);box.appendChild(back);return;}
  let items=[];try{items=JSON.parse(r.message);}catch(e){}
  if(!items.length)box.innerHTML='<div class="su-empty">등록된 URL이 없어요.</div>';
  items.forEach(it=>{
    const slug=it.slug||it;
    box.appendChild(suRow(slug,
      ()=>ipc.openExternal('https://'+SU_BASE+'/'+slug),
      ()=>{ipc.copyText('https://'+SU_BASE+'/'+slug);toast('📋 복사됨');},
      null,
      async()=>{
        if(!confirm('[관리자] "'+slug+'"를 삭제할까요?'))return;
        const d=await ipc.suAdminDelete({slug,admin:token});
        if(d.ok||d.status===404){adminListAll(token);toast('🗑 삭제됨');}else toast('삭제 실패');
      },
      it.target?' <small style="color:#8a94a1;font-weight:400">→ '+String(it.target).slice(0,28)+'</small>':''));
  });
  const back=document.createElement('button');back.className='su-admin';back.textContent='← 내 목록으로';back.addEventListener('click',renderSuList);box.appendChild(back);
}
