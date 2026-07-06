/* ===== 회의 녹음 · 화자분리 · 요약 (Pro) =====
   마이크로 회의를 녹음 → 정지하면 파일부터 저장 → AssemblyAI로 화자분리 전사 →
   Claude로 요약. 실시간이 아니라 "녹음 후 일괄 처리" 방식 (긴 오디오도 안정적). */
(function(){
  const wrap=$('meetingModal'); if(!wrap)return;
  const card=wrap.querySelector('.mt-card');
  const recBtn=$('mtRecBtn'),timerEl=$('mtTimer'),statusEl=$('mtStatus'),result=$('mtResult');
  const sumBody=$('mtSummaryBody'),transBody=$('mtTranscriptBody');

  function openMeeting(){
    if(!isPro())return; // 잠금은 pro.js의 [data-pro] 핸들러가 안내 모달을 띄움
    wrap.classList.add('on');setIgnore(false);ipc.grabFocus&&ipc.grabFocus();
    centerOnDockDisplay(card);
  }
  function closeMeeting(){
    if(recOn){toast('녹음 중에는 닫을 수 없어요 — 먼저 정지해 주세요');return;}
    wrap.classList.remove('on');
  }
  $('meetingBtn').addEventListener('click',openMeeting);
  $('mtClose').addEventListener('click',closeMeeting);
  makeDrag(wrap.querySelector('.mt-head'),(e,s)=>{
    if(!s){const r=card.getBoundingClientRect();return{dx:e.clientX-r.left,dy:e.clientY-r.top};}
    card.style.left=(e.clientX-s.dx)+'px';card.style.top=(e.clientY-s.dy)+'px';
  },e=>e.target.id==='mtClose');

  wrap.querySelectorAll('.mt-tab').forEach(t=>t.addEventListener('click',()=>{
    wrap.querySelectorAll('.mt-tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    sumBody.style.display=t.dataset.t==='summary'?'':'none';
    transBody.style.display=t.dataset.t==='transcript'?'':'none';
  }));

  function setStatus(msg,isErr){statusEl.textContent=msg||'';statusEl.className='mt-status'+(isErr?' err':'');}

  // 개인 AssemblyAI 키 (회사 서버 미배포 상태에서도 바로 쓸 수 있도록)
  $('mtKey').value=localStorage.getItem('asm_key')||'';
  $('mtGear').addEventListener('click',()=>$('mtKeyRow').classList.toggle('on'));
  $('mtKeySave').addEventListener('click',()=>{
    localStorage.setItem('asm_key',$('mtKey').value.trim());
    $('mtKeyRow').classList.remove('on');toast('🔑 API 키 저장됨');
  });

  // ---------- 녹음 ----------
  let recOn=false,mediaRec=null,recStream=null,recChunks=[],recTimer=null,recSec=0;
  function fmtTime(s){return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  recBtn.addEventListener('click',async()=>{
    if(recOn){mediaRec&&mediaRec.state!=='inactive'&&mediaRec.stop();return;}
    result.classList.remove('on');setStatus('');
    try{ recStream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){toast('🎤 마이크를 사용할 수 없어요 (권한 확인)');return;}
    recChunks=[];
    try{mediaRec=new MediaRecorder(recStream);}
    catch(e){toast('이 환경에서는 녹음을 지원하지 않아요');recStream.getTracks().forEach(t=>t.stop());return;}
    mediaRec.ondataavailable=ev=>{if(ev.data.size)recChunks.push(ev.data);};
    mediaRec.onstop=onRecordingStop;
    mediaRec.start();
    recOn=true;recSec=0;timerEl.textContent='0:00';
    recBtn.classList.add('on');recBtn.textContent='⏹ 녹음 정지';
    recTimer=setInterval(()=>{recSec++;timerEl.textContent=fmtTime(recSec);},1000);
  });

  async function onRecordingStop(){
    clearInterval(recTimer);recTimer=null;
    recStream.getTracks().forEach(t=>t.stop());
    recOn=false;recBtn.classList.remove('on');recBtn.textContent='⏺ 녹음 시작';
    const blob=new Blob(recChunks,{type:'audio/webm'});
    if(blob.size<2000){setStatus('녹음 내용이 너무 짧아요',true);return;}
    const buf=await blob.arrayBuffer();
    const bytes=Array.from(new Uint8Array(buf));

    // 1) 무슨 일이 있어도 녹음 파일부터 저장 (서버 처리 실패해도 원본은 남게)
    const now=new Date();
    const fn='회의녹음_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0')+'.webm';
    const sr=await ipc.saveBinary({bytes,filename:fn});
    if(sr&&sr.ok)toast('💾 녹음 파일 저장 완료');
    else if(!(sr&&sr.canceled)){setStatus('녹음 파일 저장에 실패했어요',true);return;}

    // 2) 화자분리 전사 제출 → 폴링
    const proKey=localStorage.getItem('cm_pro_key')||'';
    const apiKey=localStorage.getItem('asm_key')||'';
    if(!proKey&&!apiKey){setStatus('⚙ 위 "화자분리 API 키 설정"에서 AssemblyAI 키를 먼저 등록해 주세요',true);return;}
    setStatus('서버로 전송 중…');
    const sub=await ipc.meetingSubmit({bytes,proKey,apiKey});
    if(!sub||!sub.ok){
      const m=sub&&sub.message;
      setStatus(m==='NO_KEY'?'⚙ AssemblyAI 키가 필요해요 (위 "화자분리 API 키 설정")'
        :m==='NO_ROUTE'?'서버에 아직 배포되지 않았어요 — 개인 키를 등록하면 바로 쓸 수 있어요'
        :'전사 요청 실패: '+(m||'서버 연결 확인'),true);
      return;
    }
    setStatus('화자 분리 중… (녹음 길이에 따라 시간이 걸려요)');
    let utterances=null,tries=0;
    while(tries<120){ // 최대 약 6분 폴링
      await new Promise(r=>setTimeout(r,3000));
      const st=await ipc.meetingStatus({id:sub.id,proKey,apiKey});
      if(!st||!st.ok){setStatus('상태 확인 실패: '+((st&&st.message)||'서버 연결 확인'),true);return;}
      if(st.status==='completed'){utterances=st.utterances;break;}
      if(st.status==='error'){setStatus('전사 처리 중 오류가 발생했어요',true);return;}
      tries++;
    }
    if(!utterances){setStatus('처리 시간이 너무 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요',true);return;}

    // 3) 화자 라벨을 한국어로 매핑하고 전사 텍스트 구성
    const speakerMap={};let nextIdx=1;
    const lines=utterances.map(u=>{
      if(!speakerMap[u.speaker])speakerMap[u.speaker]='화자 '+(nextIdx++);
      return speakerMap[u.speaker]+': '+u.text;
    });
    const transcript=lines.join('\n');
    transBody.textContent=transcript||'(내용 없음)';
    result.classList.add('on');

    // 4) 요약 (기존 AI 프록시/개인 키 재사용)
    setStatus('요약 생성 중…');
    const sys='다음은 회의 녹음을 화자별로 받아적은 내용이야. 한국어로 회의록을 정리해줘. '
      +'형식: 1) 참석자별 주요 발언 요약 2) 주요 논의 사항 3) 결정 사항 4) 실행 항목(Action Item, 담당자가 언급되면 함께). '
      +'내용에 없는 것은 지어내지 말고, 간결하고 보기 좋게 정리해.';
    const r=await callAI({prompt:transcript,system:sys,max_tokens:1500});
    if(r&&r.ok){sumBody.textContent=r.text;setStatus('완료 ✅');}
    else{sumBody.textContent='(요약 실패 — 화자별 전사 탭에서 원문을 확인하세요)';setStatus('요약 생성 실패: '+((r&&r.message)||'AI 키 또는 Pro 인증을 확인하세요'),true);}
  }

  function activeTabText(){
    return transBody.style.display==='none'?sumBody.textContent:transBody.textContent;
  }
  $('mtCopy').addEventListener('click',()=>{
    const t=activeTabText();
    if(!t){toast('복사할 내용이 없어요');return;}
    ipc.copyText(t);toast('📋 복사됨');
  });
  $('mtSave').addEventListener('click',async()=>{
    const t=(sumBody.textContent?'[요약]\n'+sumBody.textContent+'\n\n':'')+(transBody.textContent?'[화자별 전사]\n'+transBody.textContent:'');
    if(!t.trim()){toast('저장할 내용이 없어요');return;}
    const now=new Date();
    const fn='회의요약_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'.txt';
    const r=await ipc.saveText({text:t,filename:fn});
    if(r&&r.ok)toast('💾 저장 완료');
  });
})();
