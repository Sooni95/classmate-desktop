
/* ===== QR ===== */
let qrT;

$('qrUrl').addEventListener('input', e => {
  clearTimeout(qrT);
  qrT = setTimeout(() => genQR(e.target.value.trim()), 450);
});

function makeQR(el, text) {
  el.innerHTML = '';
  try {
    new QRCode(el, {
      text,
      width: 132,
      height: 132,
      colorDark: '#1c1d1f',
      colorLight: '#ffffff'
    });
  } catch (e) {
    console.error('QR 생성 실패:', e);
  }
}

function genQR(url) {
  const box = $('qrbox');

  if (!url) {
    box.className = 'empty';
    box.textContent = 'URL 입력 시 자동 생성 (오프라인 작동)';
    $('qrAct').classList.remove('on');
    return;
  }

  box.className = '';
  makeQR(box, url);
  $('qrAct').classList.add('on');
}

// QR 이미지 추출 → 저장/복사
function qrDataURL(box) {
  const img = box.querySelector('img');
  if (img && img.src) return img.src;

  const cv = box.querySelector('canvas');
  return cv ? cv.toDataURL('image/png') : null;
}

async function saveQRImage(box, filename) {
  const d = qrDataURL(box);

  if (!d) {
    toast('QR을 먼저 생성하세요');
    return;
  }

  try {
    const r = await ipc.saveImage({ dataURL: d, filename });
    if (r.ok) toast('💾 QR 이미지 저장 완료');
    else toast('QR 이미지 저장 실패');
  } catch (e) {
    toast('QR 이미지 저장 실패');
  }
}

function copyQRImage(box) {
  const d = qrDataURL(box);

  if (!d) {
    toast('QR을 먼저 생성하세요');
    return;
  }

  ipc.copyImage(d);
  toast('📋 QR 복사됨 — 한글/PPT에 Ctrl+V');
}

$('qrSave').addEventListener('click', () =>
  saveQRImage($('qrbox'), 'QR코드.png')
);

$('qrCopy').addEventListener('click', () =>
  copyQRImage($('qrbox'))
);

$('suQrSave').addEventListener('click', () =>
  saveQRImage(
    $('suQr'),
    'QR_' + ($('suUrl').textContent.split('/')[1] || '단축주소') + '.png'
  )
);

$('suQrCopy').addEventListener('click', () =>
  copyQRImage($('suQr'))
);


/* ===== 단축주소 (코코아팹.kr) — 온라인 기능 ===== */

// 공통 토큰은 클라이언트 코드에 저장하지 않습니다.
// 실제 인증 토큰은 서버 측 Secret에서 관리합니다.
const SU_BASE = '코코아팹.kr';

// 기본 만료기간: 7일
let suTtl = 604800;

// 단축주소별 개별 관리 키 저장
function suKeys() {
  try {
    return JSON.parse(localStorage.getItem('su_keys') || '{}');
  } catch (e) {
    return {};
  }
}

function suKeySave(slug, key) {
  const m = suKeys();
  m[slug] = key;
  localStorage.setItem('su_keys', JSON.stringify(m));
}

function genKey() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

// 만료기간 선택
$('suTtl').querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    $('suTtl').querySelectorAll('button').forEach(x =>
      x.classList.remove('on')
    );

    b.classList.add('on');
    suTtl = +b.dataset.s;
  });
});

function suSay(msg, good) {
  const m = $('suMsg');
  m.textContent = msg;
  m.style.color = good ? '#34c759' : 'var(--amber)';
}

// 단축주소 생성 및 기존 주소 수정
$('suGo').addEventListener('click', async () => {
  let target = $('suTarget').value.trim();
  const slug = $('suSlug').value.trim();

  if (!target) {
    suSay('원본 URL을 입력하세요');
    return;
  }

  if (!/^https?:\/\//i.test(target)) {
    target = 'https://' + target;
  }

  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch (e) {
    suSay('올바른 URL을 입력하세요');
    return;
  }

  if (!slug) {
    suSay('단축 이름을 입력하세요 (예: 수업자료)');
    return;
  }

  if (/[\/\s?#]/.test(slug) || slug.toLowerCase() === 'api') {
    suSay('단축 이름에 공백, /, ?, # 은 쓸 수 없어요');
    return;
  }

  $('suGo').disabled = true;
  $('suGo').textContent = '만드는 중…';
  suSay('');

  // 기존에 생성한 주소라면 같은 개별 키 사용
  const key = suKeys()[slug] || genKey();

  try {
    // 공통 토큰은 전달하지 않습니다.
    // Electron IPC에서 서버 측 Worker로 전달해야 합니다.
    const res = await ipc.shorten({
      slug,
      target,
      ttl: suTtl,
      key
    });

    if (res.ok) {
      suKeySave(slug, key);

      let data = {};
      try {
        data = JSON.parse(res.message);
      } catch (e) {}

      const short = SU_BASE + '/' + slug;
      const exp = new Date(Date.now() + suTtl * 1000);

      $('suUrl').textContent = short;

      $('suExp').textContent =
        '만료: ' +
        exp.getFullYear() + '.' +
        String(exp.getMonth() + 1).padStart(2, '0') + '.' +
        String(exp.getDate()).padStart(2, '0') +
        ' (이후 자동 삭제)';

      $('suCard').classList.add('on');
      $('suQr').classList.remove('on');
      $('suQr').innerHTML = '';
      $('suQrAct').classList.remove('on');

      suSay(
        data.updated
          ? '♻️ 기존 QR·주소 그대로 — 연결만 새 URL로 변경됐어요!'
          : '완성! 복사하거나 QR로 띄워보세요 🎉',
        true
      );

    } else if (res.status === 409) {
      suSay(
        '"' + slug + '" 는 다른 곳에서 사용 중인 이름이에요 — 다른 이름을 써보세요'
      );

    } else if (res.status === 403) {
      suSay('서버 연동 오류 (관리자 문의)');

    } else if (res.status === 0) {
      suSay(
        res.message && res.message.startsWith('NET:')
          ? '서버 연결 실패: ' + res.message.slice(4)
          : '인터넷 연결을 확인하세요'
      );

    } else {
      suSay('오류: ' + (res.message || res.status));
    }

  } catch (e) {
    console.error('단축주소 생성 실패:', e);
    suSay('서버 연결 중 오류가 발생했습니다.');

  } finally {
    $('suGo').disabled = false;
    $('suGo').textContent = '단축주소 만들기';
  }
});


// 단축주소 복사
$('suCopy').addEventListener('click', () => {
  ipc.copyText('https://' + $('suUrl').textContent);
  toast('📋 단축주소 복사됨');
});


// 단축주소 QR 표시
$('suQrBtn').addEventListener('click', () => {
  const box = $('suQr');

  if (box.classList.contains('on')) {
    box.classList.remove('on');
    $('suQrAct').classList.remove('on');
    return;
  }

  box.classList.add('on');
  $('suQrAct').classList.add('on');

  // QR에는 퓨니코드 형태 사용 (구형 스캐너 호환)
  makeQR(
    box,
    new URL('https://' + $('suUrl').textContent).href
  );
});


/* ===== 만든 단축 URL 목록·관리 ===== */

$('suListBtn').addEventListener('click', () => {
  const box = $('suListBox');

  if (box.classList.contains('on')) {
    box.classList.remove('on');
    box.innerHTML = '';
    return;
  }

  renderSuList();
  box.classList.add('on');
});


// 목록 행 생성
// 사용자 입력은 innerHTML에 직접 삽입하지 않습니다.
function suRow(slug, onOpen, onCopy, onEdit, onDel, extra) {
  const row = document.createElement('div');
  row.className = 'su-li';

  const name = document.createElement('span');
  name.className = 'su-li-n';
  name.textContent = slug;

  if (extra) {
    const small = document.createElement('small');
    small.style.color = '#8a94a1';
    small.style.fontWeight = '400';
    small.textContent = extra;
    name.appendChild(small);
  }

  row.appendChild(name);

  function addButton(action, title, label, handler, extraClass) {
    const btn = document.createElement('button');
    btn.className = 'su-li-b' + (extraClass ? ' ' + extraClass : '');
    btn.dataset.a = action;
    btn.title = title;
    btn.textContent = label;
    btn.addEventListener('click', handler);
    row.appendChild(btn);
  }

  addButton('open', '브라우저로 열기', '↗', onOpen);
  addButton('copy', '주소 복사', '📋', onCopy);

  if (onEdit) {
    addButton('edit', '연결 수정', '✏️', onEdit);
  }

  addButton('del', '삭제', '🗑', onDel, 'del');

  return row;
}


// 내가 만든 단축주소 목록
function renderSuList() {
  const box = $('suListBox');
  box.innerHTML = '';

  const keys = suKeys();
  const slugs = Object.keys(keys);

  if (!slugs.length) {
    box.innerHTML =
      '<div class="su-empty">아직 만든 단축 URL이 없어요.</div>';
  }

  slugs.forEach(slug => {
    box.appendChild(
      suRow(
        slug,

        // 브라우저에서 열기
        () => {
          ipc.openExternal(
            new URL('https://' + SU_BASE + '/' + slug).href
          );
        },

        // 주소 복사
        () => {
          ipc.copyText('https://' + SU_BASE + '/' + slug);
          toast('📋 복사됨');
        },

        // 연결 수정
        () => {
          $('suSlug').value = slug;
          $('suTarget').value = '';
          $('suTarget').focus();

          suSay(
            '새 원본 URL을 넣고 [단축주소 만들기]를 누르면 연결만 바뀝니다.'
          );
        },

        // 주소 삭제
        async () => {
          if (
            !confirm(
              '"' + slug +
              '" 단축 URL을 삭제할까요? 배포된 QR·링크가 더 이상 연결되지 않습니다.'
            )
          ) {
            return;
          }

          try {
            // 공통 토큰 제거
            const r = await ipc.suDelete({
              slug,
              key: keys[slug]
            });

            if (r.ok || r.status === 404) {
              const m = suKeys();
              delete m[slug];

              localStorage.setItem(
                'su_keys',
                JSON.stringify(m)
              );

              renderSuList();
              toast('🗑 삭제됨');
            } else {
              toast('삭제 실패 — 서버 연동을 확인하세요');
            }

          } catch (e) {
            console.error('단축주소 삭제 실패:', e);
            toast('삭제 중 오류가 발생했습니다.');
          }
        }
      )
    );
  });

  // 관리자(코코아팹) 전체 관리
  const adm = document.createElement('button');
  adm.className = 'su-admin';
  adm.textContent = '🔑 전체 URL 관리 (코코아팹 관리자)';

  adm.addEventListener('click', () =>
    askInput('관리자 토큰 입력', '', adminListAll)
  );

  box.appendChild(adm);
}


/* ===== 관리자 전용 전체 URL 관리 ===== */

async function adminListAll(token) {
  if (!token) return;

  const box = $('suListBox');
  box.innerHTML = '<div class="su-empty">불러오는 중…</div>';

  let r;

  try {
    // 관리자 인증은 기존 서버의 인증 체계를 유지
    r = await ipc.suAdminList({
      admin: token
    });

  } catch (e) {
    console.error('관리자 목록 조회 실패:', e);
    r = {
      ok: false,
      status: 0,
      message: '서버 연결 실패'
    };
  }

  box.innerHTML = '';

  if (!r.ok) {
    const msg = document.createElement('div');
    msg.className = 'su-empty';

    msg.textContent =
      r.status === 401
        ? '토큰이 올바르지 않아요'
        : r.status === 404
          ? '서버에 관리자 기능 배포가 필요해요'
          : '불러오기 실패';

    box.appendChild(msg);

    const back = document.createElement('button');
    back.className = 'su-admin';
    back.textContent = '← 내 목록으로';
    back.addEventListener('click', renderSuList);

    box.appendChild(back);
    return;
  }

  let items = [];

  try {
    items = JSON.parse(r.message);
    if (!Array.isArray(items)) items = [];
  } catch (e) {
    items = [];
  }

  if (!items.length) {
    box.innerHTML =
      '<div class="su-empty">등록된 URL이 없어요.</div>';
  }

  items.forEach(it => {
    const slug = String(it.slug || it);

    box.appendChild(
      suRow(
        slug,

        // 브라우저 열기
        () => {
          ipc.openExternal(
            new URL('https://' + SU_BASE + '/' + slug).href
          );
        },

        // 주소 복사
        () => {
          ipc.copyText('https://' + SU_BASE + '/' + slug);
          toast('📋 복사됨');
        },

        // 관리자 목록에서는 개별 수정 버튼 없음
        null,

        // 관리자 삭제
        async () => {
          if (
            !confirm(
              '[관리자] "' + slug + '"를 삭제할까요?'
            )
          ) {
            return;
          }

          try {
            const d = await ipc.suAdminDelete({
              slug,
              admin: token
            });

            if (d.ok || d.status === 404) {
              await adminListAll(token);
              toast('🗑 삭제됨');
            } else {
              toast('삭제 실패');
            }

          } catch (e) {
            console.error('관리자 삭제 실패:', e);
            toast('삭제 중 오류가 발생했습니다.');
          }
        },

        // 연결된 원본 URL 표시
        it.target
          ? ' → ' + String(it.target).slice(0, 28)
          : ''
      )
    );
  });

  const back = document.createElement('button');
  back.className = 'su-admin';
  back.textContent = '← 내 목록으로';

  back.addEventListener('click', renderSuList);
  box.appendChild(back);
}
