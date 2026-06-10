// ClassMate Desktop — main process
// 투명 풀스크린 오버레이 + 클릭 통과(click-through) + 전역 단축키 + 화면 캡처
const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, Tray, Menu } = require('electron');
const path = require('path');

let win = null, tray = null;

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true,        // 배경 투명 → 다른 앱이 그대로 보임
    frame: false,             // 창 테두리 없음
    alwaysOnTop: true,        // 항상 위
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver'); // 전체화면 PPT 위에도 뜨도록
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 기본: 마우스 이벤트 통과 (forward:true → 렌더러는 mousemove를 계속 받음)
  win.setIgnoreMouseEvents(true, { forward: true });

  // 렌더러가 "지금 커서가 위젯 위/밖"을 알려주면 통과 여부 전환
  ipcMain.on('set-ignore', (_e, ignore) => {
    if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // 화면 스냅샷 (돋보기·영역캡처용) — 오버레이 자신은 잠시 숨겨서 제외
  ipcMain.handle('capture-screen', async () => {
    const d = screen.getPrimaryDisplay();
    win.setOpacity(0);
    await new Promise(r => setTimeout(r, 120)); // 합성 반영 대기
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor },
    });
    win.setOpacity(1);
    const src = sources.find(s => s.display_id == String(d.id)) || sources[0];
    return src ? src.thumbnail.toDataURL() : null;
  });

  ipcMain.on('quit-app', () => app.quit());
}

function registerShortcuts() {
  const send = (ch) => win && win.webContents.send(ch);
  // 전역 단축키 — 다른 앱에 포커스가 있어도 작동
  globalShortcut.register('Control+Alt+1', () => send('hk-ring'));      // 포인터 링
  globalShortcut.register('Control+Alt+2', () => send('hk-spot'));      // 스포트라이트 순환
  globalShortcut.register('Control+Alt+3', () => send('hk-lens'));      // 돋보기 (화면 정지 확대)
  globalShortcut.register('Control+Alt+4', () => send('hk-draw'));      // 화면 주석
  globalShortcut.register('Control+Alt+S', () => send('hk-snip'));      // 영역 캡처 → 핀
  globalShortcut.register('Control+Alt+`', () => send('hk-dock'));      // 툴바 토글
  globalShortcut.register('Control+Alt+0', () => send('hk-escape'));    // 모두 끄기
}

app.whenReady().then(() => {
  createOverlay();
  registerShortcuts();
  // 트레이 아이콘 (아이콘 파일 없으면 기본 빈 이미지로도 메뉴는 동작)
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
    tray.setToolTip('ClassMate');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '툴바 보이기/숨기기 (Ctrl+Alt+`)', click: () => win.webContents.send('hk-dock') },
      { label: '모두 끄기 (Ctrl+Alt+0)', click: () => win.webContents.send('hk-escape') },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]));
  } catch (e) { /* 트레이 아이콘 없어도 앱은 동작 */ }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
