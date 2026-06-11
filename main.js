// ClassMate Desktop v0.2 — main process
const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, Tray, Menu, clipboard, nativeImage } = require('electron');
const path = require('path');

let win = null, tray = null, origin = { x: 0, y: 0 };

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

  // 디스플레이 배치 정보 (창 기준 좌표) — 1/2/3모니터 어디서든 UI를 올바른 화면에 배치
  ipcMain.handle('get-displays', () => {
    const pid = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map(d => ({
      x: d.bounds.x - origin.x, y: d.bounds.y - origin.y,
      w: d.bounds.width, h: d.bounds.height, primary: d.id === pid,
    }));
  });

  // 커서가 있는 모니터를 캡처 → {dataURL, bounds(창 기준 좌표)}
  ipcMain.handle('capture-screen', async () => {
    const pt = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(pt);
    win.setOpacity(0);
    await new Promise(r => setTimeout(r, 120));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor },
    });
    win.setOpacity(1);
    let src = sources.find(s => s.display_id == String(d.id));
    if (!src) { // Windows에서 display_id가 비는 경우: 디스플레이 순서로 폴백
      const idx = screen.getAllDisplays().findIndex(x => x.id === d.id);
      src = sources[idx] || sources[0];
    }
    if (!src) return null;
    return {
      dataURL: src.thumbnail.toDataURL(),
      bounds: { x: d.bounds.x - origin.x, y: d.bounds.y - origin.y, w: d.bounds.width, h: d.bounds.height },
    };
  });

  // 캡처 이미지를 클립보드로 (Ctrl+V로 한글/PPT에 붙여넣기 가능)
  ipcMain.on('copy-image', (_e, dataURL) => {
    try { clipboard.writeImage(nativeImage.createFromDataURL(dataURL)); } catch (e) {}
  });

  // 단축URL 생성 — 메인 프로세스에서 호출 (렌더러 CORS 제약 없음)
  ipcMain.handle('shorten', async (_e, { slug, target, ttl, token }) => {
    try {
      const res = await fetch('https://코코아팹.kr/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ slug, target, ttl }),
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, message: text };
    } catch (err) {
      return { ok: false, status: 0, message: String(err) };
    }
  });

  ipcMain.on('quit-app', () => app.quit());
}

function registerShortcuts() {
  const send = ch => win && win.webContents.send(ch);
  // v0.2: 단일 F키 (F6~F9는 대부분의 프로그램에서 비어 있음)
  const map = [
    ['F6', 'hk-ring'], ['F7', 'hk-spot'], ['F8', 'hk-lens'], ['F9', 'hk-draw'],
    // 이전 조합도 호환 유지
    ['Control+Alt+1', 'hk-ring'], ['Control+Alt+2', 'hk-spot'],
    ['Control+Alt+3', 'hk-lens'], ['Control+Alt+4', 'hk-draw'],
    ['Control+Alt+S', 'hk-snip'], ['Control+Alt+`', 'hk-dock'], ['Control+Alt+0', 'hk-escape'],
  ];
  map.forEach(([k, ch]) => { try { globalShortcut.register(k, () => send(ch)); } catch (e) {} });
}

// 중복 실행 방지
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) win.webContents.send('hk-dock'); });
  app.whenReady().then(() => {
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));
    createOverlay();
    registerShortcuts();
    try {
      tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
      tray.setToolTip('ClassMate');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '툴바 보이기/숨기기 (Ctrl+Alt+`)', click: () => win.webContents.send('hk-dock') },
        { label: '모두 끄기 (Ctrl+Alt+0)', click: () => win.webContents.send('hk-escape') },
        { type: 'separator' },
        { label: '종료', click: () => app.quit() },
      ]));
    } catch (e) {}
  });
}

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
