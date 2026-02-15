import { app, BrowserWindow, ipcMain, Menu, session, shell, WebContents } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedChatGptUrl } from '../src/lib/domainPolicy';

const CHATGPT_URL = 'https://chatgpt.com/';
const WINDOW_STATE_FILE = 'window-state.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_DIST = path.join(__dirname, '../dist');

type WindowState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

let mainWindow: BrowserWindow | null = null;

// Keep ChatGPT login/session usable inside webview by disabling Chromium's
// third-party cookie phaseout behavior in this app.
app.commandLine.appendSwitch(
  'disable-features',
  'BlockThirdPartyCookies,ThirdPartyStoragePartitioning'
);

function getStatePath(): string {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 360, height: 640 };
  const statePath = getStatePath();

  if (!existsSync(statePath)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as WindowState;

    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return fallback;
    }

    return parsed;
  } catch {
    return fallback;
  }
}

function saveWindowState(window: BrowserWindow): void {
  const bounds = window.getBounds();
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y
  };

  writeFileSync(getStatePath(), JSON.stringify(state));
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function openExternalIfSafe(rawUrl: string): void {
  if (isSafeExternalUrl(rawUrl)) {
    void shell.openExternal(rawUrl);
  }
}

function enforceNavigationPolicy(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedChatGptUrl(url)) {
      void contents.loadURL(url);
      return { action: 'deny' };
    }

    openExternalIfSafe(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isAllowedChatGptUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternalIfSafe(url);
  });
}

function triggerNewChat(targetWindow: BrowserWindow | null): void {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  targetWindow.webContents.send('app:new-chat');
}

const NEW_WINDOW_OFFSET = 30;

function triggerNewWindow(): void {
  const source = BrowserWindow.getFocusedWindow();
  mainWindow = createMainWindow(source);
}

function triggerToggleSidebar(targetWindow: BrowserWindow | null): void {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  targetWindow.webContents.send('app:toggle-sidebar');
}

function toggleDevTools(targetWindow: BrowserWindow | null): void {
  if (!process.env.VITE_DEV_SERVER_URL) {
    return;
  }
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  if (targetWindow.webContents.isDevToolsOpened()) {
    targetWindow.webContents.closeDevTools();
  } else {
    targetWindow.webContents.openDevTools();
  }
}

function triggerZoomIn(targetWindow: BrowserWindow | null): void {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  targetWindow.webContents.send('app:zoom-in');
}

function triggerZoomOut(targetWindow: BrowserWindow | null): void {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  targetWindow.webContents.send('app:zoom-out');
}

function handleCommandShortcut(input: Electron.Input, targetWindow: BrowserWindow): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

  const key = input.key.toLowerCase();

  if (input.meta && input.alt && key === 'l') {
    toggleDevTools(targetWindow);
    return true;
  }

  if (input.meta && !input.control && !input.alt) {
    if (key === '-' || key === '_') {
      triggerZoomOut(targetWindow);
      return true;
    }
    if (key === '=' || key === '+') {
      triggerZoomIn(targetWindow);
      return true;
    }
  }

  if (!input.meta || input.control || input.alt) {
    return false;
  }

  if (key === 'w') {
    targetWindow.close();
    return true;
  }

  if (key === 'n' && input.shift) {
    triggerNewChat(targetWindow);
    return true;
  }

  if (key === 'n' && !input.shift) {
    triggerNewWindow();
    return true;
  }
  return false;
}

function configureApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'Command+N',
          click: () => triggerNewWindow()
        },
        {
          label: 'New Chat',
          accelerator: 'Command+Shift+N',
          click: () => triggerNewChat(BrowserWindow.getFocusedWindow())
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    }
  ];

  if (process.env.VITE_DEV_SERVER_URL) {
    template.push({
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+Command+L',
          click: () => toggleDevTools(BrowserWindow.getFocusedWindow())
        }
      ]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(sourceWindow?: BrowserWindow | null): BrowserWindow {
  let width: number;
  let height: number;
  let x: number | undefined;
  let y: number | undefined;

  if (sourceWindow && !sourceWindow.isDestroyed()) {
    const bounds = sourceWindow.getBounds();
    width = bounds.width;
    height = bounds.height;
    x = bounds.x + NEW_WINDOW_OFFSET;
    y = bounds.y + NEW_WINDOW_OFFSET;
  } else {
    const state = loadWindowState();
    width = state.width;
    height = state.height;
    x = state.x;
    y = state.y;
  }

  const window = new BrowserWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 640,
    x,
    y,
    title: 'ChatGPT-Lite',
    backgroundColor: '#212121',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  enforceNavigationPolicy(window.webContents);
  window.webContents.on('before-input-event', (event, input) => {
    if (handleCommandShortcut(input, window)) {
      event.preventDefault();
    }
  });

  let saveTimer: NodeJS.Timeout | null = null;

  const persistWindowState = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveWindowState(window);
      saveTimer = null;
    }, 250);
  };

  window.on('resize', persistWindowState);
  window.on('move', persistWindowState);
  window.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveWindowState(window);
  });

  return window;
}

app.whenReady().then(() => {
  configureApplicationMenu();

  const persistedSession = session.fromPartition('persist:chatgptlite');
  persistedSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'storage-access') {
      callback(true);
      return;
    }
    callback(false);
  });

  persistedSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'storage-access') {
      return true;
    }
    return false;
  });

  mainWindow = createMainWindow();

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.on('before-input-event', (event, input) => {
        const host = contents.hostWebContents;
        const targetWindow = host ? BrowserWindow.fromWebContents(host) : null;
        if (!targetWindow) {
          return;
        }
        if (handleCommandShortcut(input, targetWindow)) {
          event.preventDefault();
        }
      });
      contents.on('did-fail-load', (_e, code, desc, url) => {
        console.error(`[webview] did-fail-load code=${code} desc=${desc} url=${url}`);
      });
      contents.on('console-message', (_e, level, message, line, sourceId) => {
        console.log(`[webview:console] level=${level} ${sourceId}:${line} ${message}`);
      });
      enforceNavigationPolicy(contents);
    }
  });

  ipcMain.handle('app:open-external', async (_event, rawUrl: string) => {
    if (isSafeExternalUrl(rawUrl)) {
      await shell.openExternal(rawUrl);
    }
  });

  ipcMain.on('app:reload-webview', (event) => {
    event.sender.send('app:reload-webview');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') {
    return;
  }

  contents.once('did-finish-load', () => {
    if (contents.getURL() === 'about:blank') {
      void contents.loadURL(CHATGPT_URL);
    }
  });
});
