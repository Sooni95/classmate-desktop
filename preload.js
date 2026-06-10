// 렌더러 ↔ 메인 안전 브리지
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cm', {
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  quit: () => ipcRenderer.send('quit-app'),
  onHotkey: (handler) => {
    ['hk-ring','hk-spot','hk-lens','hk-draw','hk-snip','hk-dock','hk-escape']
      .forEach(ch => ipcRenderer.on(ch, () => handler(ch)));
  },
});
