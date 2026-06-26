// ClassMate Desktop — main process (Electron)
const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, Tray, Menu, clipboard, nativeImage, dialog, shell, net } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null, tray = null, origin = { x: 0, y: 0 };

// Windows에서 desktopCapturer가 빈(투명) 화면으로 잡히는 GPU 합성 경로 문제 방지.
// 오버레이 렌더링이 눈에 띄게 느려지면 이 한 줄만 지우면 원복됩니다.
app.disableHardwareAcceleration();

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
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      let src = sources.find(s => s.display_id == String(d.id));
      if (!src) {
        const idx = screen.getAllDisplays().findIndex(x => x.id === d.id);
        src = sources[idx] || sources[0];
      }
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
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor },
      });
      let src = sources.find(s => s.display_id == String(d.id));
      if (!src) { // Windows에서 display_id가 비는 경우: 디스플레이 순서로 폴백
        const idx = screen.getAllDisplays().findIndex(x => x.id === d.id);
        src = sources[idx] || sources[0];
      }
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
      const r = await dialog.showSaveDialog(win, {
        defaultPath: filename || '메모.txt',
        filters: [{ name: '텍스트 파일', extensions: ['txt'] }],
      });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, '\uFEFF' + text, 'utf8'); // BOM: 한글 메모장 호환
      return { ok: true };
    } catch (e) { return { ok: false, message: String(e) }; }
  });

  ipcMain.handle('save-image', async (_e, { dataURL, filename }) => {
    try {
      const r = await dialog.showSaveDialog(win, {
        defaultPath: filename || 'QR.png',
        filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
      });
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
      const r = await dialog.showSaveDialog(win, {
        defaultPath: filename || ('파일.' + (ext || 'webm')),
        filters: filt,
      });
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
      const r = await dialog.showSaveDialog(win, {
        defaultPath: 'ClassMate_명단양식.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
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
  // 명단 파일 선택 (메인 프로세스 dialog → 투명/클릭통과 오버레이에서도 확실히 동작)
  ipcMain.handle('pick-roster', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '명단 파일 선택',
      filters: [{ name: '명단 (Excel/CSV)', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try { return { name: path.basename(r.filePaths[0]), b64: fs.readFileSync(r.filePaths[0]).toString('base64') }; }
    catch (e) { return null; }
  });
  // 드래그앤드롭으로 받은 파일 경로 읽기
  ipcMain.handle('read-path', async (e, p) => {
    try { return { name: path.basename(p), b64: fs.readFileSync(p).toString('base64') }; }
    catch (err) { return null; }
  });
  // 백업(JSON) 파일 선택 → 텍스트로 반환
  ipcMain.handle('pick-backup', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'ClassMate 백업 파일 선택',
      filters: [{ name: 'ClassMate 백업 (JSON)', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try { return { name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') }; }
    catch (e) { return null; }
  });
  // 사용자 의견 보내기 → 워커가 ksh0502@nepes.co.kr 로 메일 발송
  ipcMain.handle('feedback', async (_e, { message, contact, meta }) => {
    try {
      const res = await net.fetch('https://classmate-links.suhun099.workers.dev/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, contact, meta }),
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, message: text };
    } catch (err) {
      return { ok: false, status: 0, message: 'NET:' + String(err && err.message || err) };
    }
  });
}

const SC_DEFAULT = {
  'hk-draw':'Control+Alt+P','hk-ring':'Control+Alt+R','hk-spot':'Control+Alt+O',
  'hk-lens':'Control+Alt+L','hk-snip':'Control+Alt+S','hk-dock':'Control+Alt+`','hk-escape':'Control+Alt+0',
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
      tray.setToolTip('ClassMate');
      const showWin = () => { if (win) { win.show(); win.webContents.send('bounds-changed'); } };
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'ClassMate 열기', click: showWin },
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
