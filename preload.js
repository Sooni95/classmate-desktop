const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cm', {
  setIgnore: (ig) => ipcRenderer.send('set-ignore', ig),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  copyImage: (dataURL) => ipcRenderer.send('copy-image', dataURL),
  copyText: (text) => ipcRenderer.send('copy-text', text),
  shorten: (p) => ipcRenderer.invoke('shorten', p),
  saveImage: (p) => ipcRenderer.invoke('save-image', p),
  quit: () => ipcRenderer.send('quit-app'),
  onHotkey: (h) => ['hk-ring','hk-spot','hk-lens','hk-draw','hk-snip','hk-dock','hk-escape']
    .forEach(ch => ipcRenderer.on(ch, () => h(ch))),
  onBoundsChanged: (h) => ipcRenderer.on('bounds-changed', h),
});
