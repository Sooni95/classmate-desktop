// 코코메이트(KocoMate) Desktop — main process (Electron)
const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, Tray, Menu, clipboard, nativeImage, dialog, shell, net } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null, tray = null, origin = { x: 0, y: 0 };

// 주의: 투명(transparent) 오버레이 창에서는 하드웨어 가속을 끄면 캔버스(펜 필기)가
// 화면에 그려지지 않는 Windows 이슈가 있어, app.disableHardwareAcceleration()는 쓰지 않는다.

// 오버레이는 항상 최상위(screen-saver 레벨)라, 네이티브 파일 대화상자가 그 뒤에 가려져
// 보이지도 클릭되지도 않는 문제가 있다. 대화상자를 띄우는 동안만 always-on-top을 잠깐
// 풀었다가, 끝나면(선택/취소/에러 무관) 다시 복구한다.
async function withDialog(fn) {
  if (win) win.setAlwaysOnTop(false);
  try { return await fn(); }
  finally { if (win) win.setAlwaysOnTop(true, 'screen-saver'); }
}

// desktopCapturer 소스를 실제 Display에 매칭. Windows에서는 display_id가 비어있거나
// getAllDisplays()와 getSources()의 배열 순서가 어긋나는 경우가 흔해, 그대로 index로
// 폴백하면 커서 위치와 무관하게 항상 같은(엉뚱한) 모니터가 잡히는 문제가 생긴다.
// → 1) display_id 매칭 → 2) 실제 캡처 해상도 일치 → 3) 배열 순서 폴백 순으로 시도.
// 모니터별 실제 해상도가 그대로 나오도록 어떤 디스플레이보다도 큰 고정 상한을 준다
// (thumbnailSize가 작으면 여러 모니터가 같은 크기로 눌려서 나와 해상도 비교가 무의미해진다)
const NATIVE_THUMB_CAP = { width: 7680, height: 4320 };
function pickSourceForDisplay(sources, d) {
  if (!sources.length) return null;
  let src = sources.find(s => s.display_id && s.display_id == String(d.id));
  if (src) return src;
  const tw = Math.round(d.size.width * d.scaleFactor), th = Math.round(d.size.height * d.scaleFactor);
  src = sources.find(s => { const sz = s.thumbnail.getSize(); return sz.width === tw && sz.height === th; });
  if (src) return src;
  const idx = screen.getAllDisplays().findIndex(x => x.id === d.id);
  return sources[idx] || sources[0];
}

// 모든 모니터를 합친 영역 계산 (멀티모니터 대응)
function unionBounds() {
  const ds = screen.getAllDisplays();
  const minX = Math.min(...ds.map(d => d.bounds.x));
  const minY = Math.min(...ds.map(d => d.bounds.y));
  const maxX = Math.max(...ds.map(d => d.bounds.x + d.bounds.width));
  const maxY = Math.max(...ds.map(d => d.bounds.y + d.bounds.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function createOverlay() {
  const ub = unionBounds();
  origin = { x: ub.x, y: ub.y };
  win = new BrowserWindow({
    ...ub,
    transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: true, hasShadow: false,  // resizable:false면 생성 크기가 주모니터로 클램핑되는 경우가 있어 true로 생성
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, // 포커스 없는 오버레이 상태가 대부분이라, 꺼두지 않으면 setTimeout 등이 크게 지연됨(토스트가 안 사라지는 등)
    },
  });
  // ★ 멀티모니터 스팬 강제: 생성 직후 한 번 더 명시적으로 배치
  win.setBounds(ub);
  win.setResizable(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  // macOS: 전체화면 앱 위에도 오버레이가 보이도록 + 모든 워크스페이스
  if (process.platform === 'darwin') {
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
    try { if (app.dock) app.dock.hide(); } catch (e) {}
  }
  // 모니터 연결/해제/배치변경 시 자동 재스팬
  const respan = () => {
    const u = unionBounds(); origin = { x: u.x, y: u.y };
    win.setResizable(true); win.setBounds(u); win.setResizable(false);
    win.webContents.send('bounds-changed');
  };
  screen.on('display-added', respan);
  screen.on('display-removed', respan);
  screen.on('display-metrics-changed', respan);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setIgnoreMouseEvents(true, { forward: true });

  ipcMain.on('set-ignore', (_e, ig) => { if (win) win.setIgnoreMouseEvents(ig, { forward: true }); });
  // 포인터/렌즈 등 활성 모드: 창에 포커스를 줘서 키보드 ESC가 먹히게
  ipcMain.on('grab-focus', () => { try { if (win) win.focusOnWebView ? win.focusOnWebView() : win.focus(); } catch (e) {} });

  // 앱 버전 + 빌드 날짜
  ipcMain.handle('get-app-info', () => {
    let buildDate = '';
    try { buildDate = require('./build-date.json').date || ''; } catch (e) {}
    return { version: app.getVersion(), buildDate };
  });

  ipcMain.handle('get-displays', () => {
    const pid = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map(d => ({
      x: d.bounds.x - origin.x, y: d.bounds.y - origin.y,
      w: d.bounds.width, h: d.bounds.height, primary: d.id === pid,
    }));
  });

  // 화면 녹화용 소스 ID (커서가 있는 모니터)
  ipcMain.handle('get-screen-source', async () => {
    try {
      const pt = screen.getCursorScreenPoint();
      const d = screen.getDisplayNearestPoint(pt);
      // 해상도 매칭용이라 썸네일은 실 해상도로 받아야 함 (1x1이면 전부 같은 크기라 매칭 불가)
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: NATIVE_THUMB_CAP });
      const src = pickSourceForDisplay(sources, d);
      return src ? { id: src.id, bounds: { x: d.bounds.x - origin.x, y: d.bounds.y - origin.y, w: d.bounds.width, h: d.bounds.height } } : null;
    } catch (e) { return null; }
  });

  // 커서가 있는 모니터를 캡처 → {dataURL, bounds(창 기준 좌표)}
  ipcMain.handle('capture-screen', async () => {
    const pt = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(pt);
    try {
      win.setOpacity(0);
      await new Promise(r => setTimeout(r, 150));
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: NATIVE_THUMB_CAP });
      const src = pickSourceForDisplay(sources, d);
      if (!src || src.thumbnail.isEmpty()) return null; // 빈(투명) 캡처 방지
      return {
        dataURL: src.thumbnail.toDataURL(),
        bounds: { x: d.bounds.x - origin.x, y: d.bounds.y - origin.y, w: d.bounds.width, h: d.bounds.height },
      };
    } catch (e) {
      return null;
    } finally {
      win.setOpacity(1); // 캡처 성공/실패와 무관하게 오버레이를 항상 다시 보이게 (투명 고착 방지)
    }
  });

  // 캡처 이미지를 클립보드로 (Ctrl+V로 한글/PPT에 붙여넣기 가능)
  ipcMain.on('copy-image', (_e, dataURL) => {
    try { clipboard.writeImage(nativeImage.createFromDataURL(dataURL)); } catch (e) {}
  });

  ipcMain.on('copy-text', (_e, text) => {
    try { clipboard.writeText(text); } catch (e) {}
  });

  // 메모를 txt 파일로 저장 (저장 위치 선택)
  ipcMain.handle('save-text', async (_e, { text, filename }) => {
    try {
      const r = await withDialog(() => dialog.showSaveDialog({
        defaultPath: filename || '메모.txt',
        filters: [{ name: '텍스트 파일', extensions: ['txt'] }],
      }));
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, '\uFEFF' + text, 'utf8'); // BOM: 한글 메모장 호환
      return { ok: true };
    } catch (e) { return { ok: false, message: String(e) }; }
  });

  ipcMain.handle('save-image', async (_e, { dataURL, filename }) => {
    try {
      const r = await withDialog(() => dialog.showSaveDialog({
        defaultPath: filename || 'QR.png',
        filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
      }));
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, Buffer.from(dataURL.split(',')[1], 'base64'));
      return { ok: true };
    } catch (e) { return { ok: false, message: String(e) }; }
  });

  // 바이너리 파일 저장 (음성 .webm 등)
  ipcMain.handle('save-binary', async (_e, { bytes, filename, ext }) => {
    try {
      const filt = ext === 'pdf'
        ? [{ name: 'PDF 문서', extensions: ['pdf'] }]
        : [{ name: '파일', extensions: [ext || 'webm'] }];
      const r = await withDialog(() => dialog.showSaveDialog({
        defaultPath: filename || ('파일.' + (ext || 'webm')),
        filters: filt,
      }));
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, Buffer.from(bytes));
      return { ok: true };
    } catch (e) { return { ok: false, message: String(e) }; }
  });

  // AI 교수 보조 (Anthropic Claude, BYO Key)
  ipcMain.handle('ai-chat', async (_e, { prompt, apiKey }) => {
    try {
      if (!apiKey) return { ok: false, message: 'NO_KEY' };
      const res = await net.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: '당신은 한국 초등학교 교사를 돕는 수업 보조 AI입니다. 발문 만들기, 활동 아이디어, 즉석 퀴즈, 개념 설명 등을 돕습니다. 한국어로, 교실에서 바로 쓸 수 있게 간결하고 실용적으로 답하세요.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, status: res.status, message: (data.error && data.error.message) || '오류' };
      const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return { ok: true, text: out };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  });

  // 음성 인식 (Whisper 프록시, Pro 전용) — 오디오 바이너리 전송
  ipcMain.handle('stt-proxy', async (_e, { bytes, proKey }) => {
    try {
      const buf = Buffer.from(bytes);
      const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/stt?proKey=' + encodeURIComponent(proKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, message: data.message || ('HTTP ' + res.status) };
      return { ok: true, text: data.text };
    } catch (err) {
      return { ok: false, message: 'NET:' + String(err && err.message || err) };
    }
  });

  // AI 프록시 (Pro 전용, 회사 키로 서버가 대신 호출) — 키 입력 불필요
  ipcMain.handle('ai-proxy', async (_e, { prompt, system, proKey, max_tokens }) => {
    try {
      const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, proKey, max_tokens }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, message: data.message || ('HTTP ' + res.status) };
      return { ok: true, text: data.text };
    } catch (err) {
      return { ok: false, message: 'NET:' + String(err && err.message || err) };
    }
  });

  // 영역 OCR — Pro면 Worker(/api/ocr, 배포 필요: WORKER_ENDPOINTS.md 참고), 아니면 개인 키로 직접
  ipcMain.handle('ai-ocr', async (_e, { dataURL, proKey, apiKey }) => {
    try {
      const b64 = (dataURL || '').split(',')[1] || '';
      if (!b64) return { ok: false, message: 'NO_IMAGE' };
      if (proKey) {
        const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, proKey }),
        });
        if (res.status !== 404) { // 404 = 워커에 아직 미배포 → 개인 키로 폴백
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) return { ok: true, text: data.text };
          if (!apiKey) return { ok: false, message: data.message || ('HTTP ' + res.status) };
        } else if (!apiKey) return { ok: false, message: 'NO_ROUTE' };
      }
      if (!apiKey) return { ok: false, message: 'NO_KEY' };
      const res = await net.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
            { type: 'text', text: '이미지에 보이는 모든 텍스트를 원문 그대로, 줄바꿈을 유지해서 정확하게 추출해줘. 표나 목록의 구조도 최대한 유지하고, 설명 없이 추출한 텍스트만 출력해.' },
          ] }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, message: (data.error && data.error.message) || '오류' };
      const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return { ok: true, text: out };
    } catch (err) {
      return { ok: false, message: 'NET:' + String(err && err.message || err) };
    }
  });

  // 회의 녹음 → 화자분리 전사 제출. 오디오가 커서 업로드+분석에 시간이 걸리므로
  // 비동기 job으로 제출만 하고, meeting-status로 폴링한다.
  // proKey(회사 서버 경유)가 없거나 서버 라우트가 아직 미배포면, 개인 AssemblyAI
  // 키(apiKey)로 곧바로 호출 — Worker 배포 없이도 바로 쓸 수 있게 하기 위함.
  ipcMain.handle('meeting-submit', async (_e, { bytes, proKey, apiKey }) => {
    const buf = Buffer.from(bytes);
    if (proKey) {
      try {
        const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/meeting/submit?proKey=' + encodeURIComponent(proKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buf,
        });
        if (res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) return { ok: true, id: data.id };
          if (!apiKey) return { ok: false, message: data.message || ('HTTP ' + res.status) };
        } else if (!apiKey) return { ok: false, message: 'NO_ROUTE' };
      } catch (err) {
        if (!apiKey) return { ok: false, message: 'NET:' + String(err && err.message || err) };
      }
    }
    if (!apiKey) return { ok: false, message: 'NO_KEY' };
    try {
      const upRes = await net.fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { authorization: apiKey },
        body: buf,
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !upData.upload_url) return { ok: false, message: (upData.error) || ('업로드 실패 HTTP ' + upRes.status) };
      const trRes = await net.fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: upData.upload_url, speaker_labels: true, language_code: 'ko' }),
      });
      const trData = await trRes.json().catch(() => ({}));
      if (!trRes.ok || !trData.id) return { ok: false, message: (trData.error) || ('전사 요청 실패 HTTP ' + trRes.status) };
      return { ok: true, id: trData.id };
    } catch (err) {
      return { ok: false, message: 'NET:' + String(err && err.message || err) };
    }
  });
  ipcMain.handle('meeting-status', async (_e, { id, proKey, apiKey }) => {
    if (proKey) {
      try {
        const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/meeting/status?id=' + encodeURIComponent(id) + '&proKey=' + encodeURIComponent(proKey));
        if (res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) return { ok: true, status: data.status, utterances: data.utterances, text: data.text };
          if (!apiKey) return { ok: false, message: data.message || ('HTTP ' + res.status) };
        } else if (!apiKey) return { ok: false, message: 'NO_ROUTE' };
      } catch (err) {
        if (!apiKey) return { ok: false, message: 'NET:' + String(err && err.message || err) };
      }
    }
    if (!apiKey) return { ok: false, message: 'NO_KEY' };
    try {
      const stRes = await net.fetch('https://api.assemblyai.com/v2/transcript/' + encodeURIComponent(id), {
        headers: { authorization: apiKey },
      });
      const stData = await stRes.json().catch(() => ({}));
      if (!stRes.ok) return { ok: false, message: (stData.error) || ('상태 확인 실패 HTTP ' + stRes.status) };
      if (stData.status === 'error') return { ok: true, status: 'error', message: stData.error };
      if (stData.status !== 'completed') return { ok: true, status: stData.status };
      const utterances = (stData.utterances || []).map(u => ({ speaker: u.speaker, text: u.text }));
      return { ok: true, status: 'completed', utterances, text: stData.text };
    } catch (err) {
      return { ok: false, message: 'NET:' + String(err && err.message || err) };
    }
  });

  // Pro 라이선스 키 검증 (Cloudflare Worker)
  ipcMain.handle('verify-pro', async (_e, { key }) => {
    try {
      const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/pro-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data.valid === true, status: res.status, ...data };
    } catch (err) {
      return { ok: false, message: 'NET:' + String(err && err.message || err) };
    }
  });

  // 번역 (Anthropic API, BYO Key) — 메인 프로세스에서 호출해 CORS 회피
  ipcMain.handle('translate', async (_e, { text, lang, apiKey }) => {
    try {
      if (!apiKey) return { ok: false, message: 'NO_KEY' };
      const res = await net.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: `You are a translator for Korean elementary classrooms with multicultural students. Translate the user's text into ${lang}. Output ONLY the translation, no explanations, no quotes. Keep it natural and simple enough for a child to understand.`,
          messages: [{ role: 'user', content: text }],
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, status: res.status, message: (data.error && data.error.message) || '오류' };
      const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return { ok: true, text: out };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  });

  // 단축URL 생성 — 메인 프로세스에서 호출 (렌더러 CORS 제약 없음)
  ipcMain.handle('shorten', async (_e, { slug, target, ttl, token, key }) => {
    try {
      const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token || '' },
        body: JSON.stringify({ slug, target, ttl, key }),
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, message: text };
    } catch (err) {
      return { ok: false, status: 0, message: 'NET:' + String(err && err.message || err) };
    }
  });

  ipcMain.on('open-external', (_e, url) => { try { shell.openExternal(url); } catch (e) {} });

  const SU_API = 'https://classmate-links.suhun099.workers.dev';
  // 단축 URL 삭제 (생성자: 슬러그의 수정키로 인증)
  ipcMain.handle('su-delete', async (_e, { slug, key, token }) => {
    try {
      const res = await net.fetch(SU_API + '/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token || '' },
        body: JSON.stringify({ slug, key }),
      });
      return { ok: res.ok, status: res.status, message: await res.text() };
    } catch (err) { return { ok: false, status: 0, message: 'NET:' + String(err && err.message || err) }; }
  });
  // 관리자(코코아팹): 전체 목록 조회 — 관리자 토큰 필요
  ipcMain.handle('su-admin-list', async (_e, { admin }) => {
    try {
      const res = await net.fetch(SU_API + '/api/admin/list', { headers: { 'x-admin': admin || '' } });
      return { ok: res.ok, status: res.status, message: await res.text() };
    } catch (err) { return { ok: false, status: 0, message: 'NET:' + String(err && err.message || err) }; }
  });
  // 관리자: 임의 URL 삭제
  ipcMain.handle('su-admin-delete', async (_e, { slug, admin }) => {
    try {
      const res = await net.fetch(SU_API + '/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': admin || '' },
        body: JSON.stringify({ slug }),
      });
      return { ok: res.ok, status: res.status, message: await res.text() };
    } catch (err) { return { ok: false, status: 0, message: 'NET:' + String(err && err.message || err) }; }
  });

  // 명단 양식 다운로드
  ipcMain.handle('save-template', async () => {
    try {
      const src = require('path').join(__dirname, 'assets', 'roster_template.xlsx');
      const r = await withDialog(() => dialog.showSaveDialog({
        defaultPath: '코코메이트_명단양식.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      }));
      if (r.canceled || !r.filePath) return { ok: false };
      require('fs').copyFileSync(src, r.filePath);
      return { ok: true };
    } catch (err) { return { ok: false, message: String(err) }; }
  });

  // 업데이트 확인 — GitHub 'latest' 릴리스 게시 시각을 받아 렌더러가 빌드날짜와 비교
  ipcMain.handle('check-update', async () => {
    try {
      const res = await net.fetch('https://api.github.com/repos/Sooni95/classmate-desktop/releases/tags/latest', {
        headers: { 'User-Agent': 'ClassMate', 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      return { ok: true, publishedAt: data.published_at || '', url: data.html_url || 'https://github.com/Sooni95/classmate-desktop/releases/latest' };
    } catch (err) {
      return { ok: false, message: String(err && err.message || err) };
    }
  });

  ipcMain.on('quit-app', () => { app.isQuiting = true; app.quit(); });
  ipcMain.on('set-shortcuts', (_e, obj) => { scCustom = obj || {}; registerShortcuts(); }); // 렌더러가 저장된 사용자 단축키 적용
  // ✕(종료) 버튼 → 완전 종료 대신 트레이로 숨김 (백그라운드 유지)
  ipcMain.on('hide-to-tray', () => { if (win) win.hide(); });
  // 명단 파일 선택 (parent 없이 독립 창으로 열고, withDialog로 잠깐 최상위 해제 — 두 문제 모두 회피)
  ipcMain.handle('pick-roster', async () => {
    try {
      const r = await withDialog(() => dialog.showOpenDialog({
        title: '명단 파일 선택',
        filters: [{ name: '명단 (Excel/CSV)', extensions: ['xlsx', 'xls', 'csv'] }],
        properties: ['openFile'],
      }));
      if (r.canceled || !r.filePaths[0]) return null;
      return { name: path.basename(r.filePaths[0]), b64: fs.readFileSync(r.filePaths[0]).toString('base64') };
    } catch (e) { return { error: String(e && e.message || e) }; }
  });
  // 드래그앤드롭으로 받은 파일 경로 읽기
  ipcMain.handle('read-path', async (e, p) => {
    try { return { name: path.basename(p), b64: fs.readFileSync(p).toString('base64') }; }
    catch (err) { return null; }
  });
  // 백업(JSON) 파일 선택 → 텍스트로 반환
  ipcMain.handle('pick-backup', async () => {
    try {
      const r = await withDialog(() => dialog.showOpenDialog({
        title: '코코메이트 백업 파일 선택',
        filters: [{ name: '코코메이트 백업 (JSON)', extensions: ['json'] }],
        properties: ['openFile'],
      }));
      if (r.canceled || !r.filePaths[0]) return null;
      return { name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
    } catch (e) { return { error: String(e && e.message || e) }; }
  });
}

const SC_DEFAULT = {
  'hk-draw':'Control+Alt+P','hk-ring':'Control+Alt+R','hk-spot':'Control+Alt+O',
  'hk-lens':'Control+Alt+L','hk-lens-rect':'Control+Alt+K','hk-spotlens':'Control+Alt+M',
  'hk-zoom':'Control+Alt+Z',
  'hk-snip':'Control+Alt+S','hk-dock':'Control+Alt+`','hk-escape':'Control+Alt+0',
};
const SC_EXTRA = [['F6','hk-ring'],['F7','hk-spot'],['F8','hk-lens'],['F9','hk-draw'],
  ['Control+Alt+1','hk-ring'],['Control+Alt+2','hk-spot'],['Control+Alt+3','hk-lens'],['Control+Alt+4','hk-draw']];
let scCustom = {};
function registerShortcuts() {
  globalShortcut.unregisterAll();
  const send = ch => win && win.webContents.send(ch);
  const eff = { ...SC_DEFAULT, ...scCustom }; // 사용자 지정이 기본을 덮어씀
  const used = new Set();
  Object.entries(eff).forEach(([ch, k]) => { if (k) { try { if (globalShortcut.register(k, () => send(ch))) used.add(k); } catch (e) {} } });
  SC_EXTRA.forEach(([k, ch]) => { if (!used.has(k)) { try { globalShortcut.register(k, () => send(ch)); } catch (e) {} } }); // F6~9·레거시는 충돌 없을 때만
}

// 중복 실행 방지
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { win.show(); win.webContents.send('hk-dock'); } });
  app.whenReady().then(() => {
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));
    createOverlay();
    registerShortcuts();
    try {
      tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
      tray.setToolTip('코코메이트');
      const showWin = () => { if (win) { win.show(); win.webContents.send('bounds-changed'); } };
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '코코메이트 열기', click: showWin },
        { label: '툴바 보이기/숨기기 (Ctrl+Alt+`)', click: () => { showWin(); win.webContents.send('hk-dock'); } },
        { label: '모두 끄기 (Ctrl+Alt+0)', click: () => win.webContents.send('hk-escape') },
        { type: 'separator' },
        { label: '완전 종료', click: () => { app.isQuiting = true; app.quit(); } },
      ]));
      tray.on('click', showWin); // 트레이 아이콘 클릭 → 다시 표시
    } catch (e) {}
  });
}

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (app.isQuiting) app.quit(); });
