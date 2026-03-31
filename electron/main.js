const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ─── Logging ────────────────────────────────────────────────
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// ─── Auto-updater config ────────────────────────────────────
autoUpdater.autoDownload = false;            // Ask user first
autoUpdater.autoInstallOnAppQuit = true;

const isDev = !app.isPackaged;
let mainWindow = null;

// ─── Send status to renderer ────────────────────────────────
function sendStatus(text) {
  log.info(text);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(
      `console.log('[AutoUpdate] ${text.replace(/'/g, "\\'")}')`
    ).catch(() => {});
  }
}

// ─── Auto-update events ─────────────────────────────────────
autoUpdater.on('checking-for-update', () => {
  sendStatus('Controleren op updates...');
});

autoUpdater.on('update-available', (info) => {
  sendStatus(`Update beschikbaar: v${info.version}`);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Beschikbaar',
    message: `PleKaim v${info.version} is beschikbaar.`,
    detail: 'Wil je de update nu downloaden?',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  sendStatus('App is up-to-date.');
});

autoUpdater.on('download-progress', (progress) => {
  sendStatus(`Downloaden: ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatus(`Update v${info.version} gedownload.`);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Klaar',
    message: `PleKaim v${info.version} is gedownload.`,
    detail: 'De app wordt nu herstart om de update te installeren.',
    buttons: ['Herstart Nu', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('error', (err) => {
  sendStatus(`Update error: ${err.message}`);
  log.error('AutoUpdater error:', err);
});

// ─── Window ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0b1020',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000/ple');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const plePath = path.join(__dirname, '..', 'renderer', 'out', 'ple', 'index.html');
    mainWindow.loadFile(plePath);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ─── App lifecycle ──────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // Check for updates after window loads (delay 3s to not block startup)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        log.error('Update check failed:', err);
      });
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
