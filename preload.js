const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cm', {
  setIgnore: (ig) => ipcRenderer.send('set-ignore', ig),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  copyImage: (dataURL) => ipcRenderer.send('copy-image', dataURL),
  shorten: (p) => ipcRenderer.invoke('shorten', p),
  quit: () => ipcRenderer.send('quit-app'),
  onHotkey: (h) => ['hk-ring','hk-spot','hk-lens','hk-draw','hk-snip','hk-dock','hk-escape']
    .forEach(ch => ipcRenderer.on(ch, () => h(ch))),
  onBoundsChanged: (h) => ipcRenderer.on('bounds-changed', h),
});
