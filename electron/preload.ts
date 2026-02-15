import { contextBridge, ipcRenderer } from 'electron';

type AppBridge = {
  openExternal: (url: string) => Promise<void>;
  reloadChat: () => void;
};

const appBridge: AppBridge = {
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  reloadChat: () => ipcRenderer.send('app:reload-webview')
};

ipcRenderer.on('app:reload-webview', () => {
  window.dispatchEvent(new CustomEvent('app:reload-webview'));
});

ipcRenderer.on('app:new-chat', () => {
  window.dispatchEvent(new CustomEvent('app:new-chat'));
});

ipcRenderer.on('app:open-switcher', () => {
  window.dispatchEvent(new CustomEvent('app:open-switcher'));
});

ipcRenderer.on('app:toggle-sidebar', () => {
  window.dispatchEvent(new CustomEvent('app:toggle-sidebar'));
});

ipcRenderer.on('app:zoom-in', () => {
  window.dispatchEvent(new CustomEvent('app:zoom-in'));
});

ipcRenderer.on('app:zoom-out', () => {
  window.dispatchEvent(new CustomEvent('app:zoom-out'));
});

contextBridge.exposeInMainWorld('app', appBridge);
