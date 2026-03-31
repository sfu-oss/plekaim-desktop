const { app, BrowserWindow, shell, dialog, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { pathToFileURL } = require('url');
const { validateKey, saveLicense, loadLicense, checkLicense, removeLicense } = require('./license');

// ─── Logging ────────────────────────────────────────────────
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// ─── Auto-updater config ────────────────────────────────────
autoUpdater.autoDownload = false;
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
autoUpdater.on('checking-for-update', () => sendStatus('Controleren op updates...'));

autoUpdater.on('update-available', (info) => {
  sendStatus(`Update beschikbaar: v${info.version}`);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Beschikbaar',
    message: `KaimPLE v${info.version} is beschikbaar.`,
    detail: 'Wil je de update nu downloaden?',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});

autoUpdater.on('update-not-available', () => sendStatus('App is up-to-date.'));

autoUpdater.on('download-progress', (progress) => {
  sendStatus(`Downloaden: ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatus(`Update v${info.version} gedownload.`);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Klaar',
    message: `KaimPLE v${info.version} is gedownload.`,
    detail: 'De app wordt nu herstart om de update te installeren.',
    buttons: ['Herstart Nu', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall(false, true);
  });
});

autoUpdater.on('error', (err) => {
  sendStatus(`Update error: ${err.message}`);
  log.error('AutoUpdater error:', err);
});

// ─── License activation dialog ──────────────────────────────
async function showActivationDialog() {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'KaimPLE - Licentie Activatie',
    message: 'Welkom bij KaimPLE!',
    detail: 'Voer je licentiesleutel in om de software te activeren.\n\nNeem contact op voor een licentie.',
    buttons: ['Licentie Invoeren', 'Afsluiten'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 1) {
    app.quit();
    return false;
  }

  // Show input dialog (use a simple prompt approach)
  return await promptLicenseKey();
}

async function promptLicenseKey() {
  // Create a small activation window
  const activationWin = new BrowserWindow({
    width: 520,
    height: 380,
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#0b1020',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    }
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .container { width: 440px; padding: 32px; }
    h2 { font-size: 20px; margin-bottom: 8px; color: #38bdf8; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
    input { width: 100%; padding: 12px 14px; border: 1px solid #334155; border-radius: 8px; background: #1e293b; color: #f1f5f9; font-size: 14px; font-family: 'JetBrains Mono', monospace; outline: none; }
    input:focus { border-color: #38bdf8; }
    input::placeholder { color: #475569; }
    .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 12px; }
    .btn-primary { background: #0ea5e9; color: white; }
    .btn-primary:hover { background: #0284c7; }
    .btn-secondary { background: transparent; color: #94a3b8; border: 1px solid #334155; }
    .btn-secondary:hover { background: #1e293b; }
    .error { color: #f87171; font-size: 12px; margin-top: 8px; display: none; }
    .success { color: #4ade80; font-size: 12px; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🔑 Licentie Activatie</h2>
    <p>Voer je KaimPLE licentiesleutel in om de software te activeren.</p>
    <input id="key" type="text" placeholder="KAIM-xxxx..." autofocus />
    <div class="error" id="error"></div>
    <div class="success" id="success"></div>
    <button class="btn btn-primary" id="activate" onclick="activate()">Activeren</button>
    <button class="btn btn-secondary" onclick="require('electron').ipcRenderer.send('license-cancel')">Annuleren</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    function activate() {
      const key = document.getElementById('key').value.trim();
      if (!key) return;
      document.getElementById('error').style.display = 'none';
      document.getElementById('activate').textContent = 'Valideren...';
      ipcRenderer.send('license-activate', key);
    }
    document.getElementById('key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') activate();
    });
    ipcRenderer.on('license-result', (_, result) => {
      if (result.valid) {
        document.getElementById('success').textContent = 'Licentie geactiveerd! ✅';
        document.getElementById('success').style.display = 'block';
        document.getElementById('error').style.display = 'none';
        setTimeout(() => ipcRenderer.send('license-ok'), 1000);
      } else {
        document.getElementById('error').textContent = result.error;
        document.getElementById('error').style.display = 'block';
        document.getElementById('activate').textContent = 'Activeren';
      }
    });
  </script>
</body>
</html>`;

  activationWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  activationWin.setMenuBarVisibility(false);

  return new Promise((resolve) => {
    ipcMain.once('license-activate', (event, key) => {
      const result = validateKey(key);
      if (result.valid) {
        saveLicense(key);
        log.info(`License activated: ${result.payload.email} (${result.payload.plan}, expires ${result.payload.expiresAt})`);
      }
      event.sender.send('license-result', result);
    });

    ipcMain.once('license-ok', () => {
      activationWin.close();
      resolve(true);
    });

    ipcMain.once('license-cancel', () => {
      activationWin.close();
      resolve(false);
    });

    activationWin.on('closed', () => {
      resolve(false);
    });
  });
}

// ─── Custom protocol: serve renderer/out as app:// ──────────
const RENDERER_OUT_REL = path.join('renderer', 'out');

function getRendererOut() {
  if (isDev) return path.join(__dirname, '..', RENDERER_OUT_REL);
  return path.join(process.resourcesPath, 'app.asar', RENDERER_OUT_REL);
}

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
    mainWindow.loadURL('app://renderer/ple/');
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

// ─── App lifecycle ──────────────────────────────────────────
app.whenReady().then(async () => {
  // Register custom protocol
  const rendererOut = getRendererOut();
  protocol.handle('app', (request) => {
    let url = request.url.replace('app://renderer', '');
    url = url.split('?')[0].split('#')[0];
    url = decodeURIComponent(url);
    if (url.endsWith('/') || !path.extname(url)) {
      url = url.endsWith('/') ? url + 'index.html' : url + '/index.html';
    }
    const filePath = path.join(rendererOut, url);
    return net.fetch(pathToFileURL(filePath).href);
  });

  createWindow();

  // Check license
  if (!isDev) {
    const status = checkLicense();
    if (!status.licensed) {
      log.info(`License check: ${status.error}`);
      const activated = await promptLicenseKey();
      if (!activated) {
        app.quit();
        return;
      }
    } else {
      log.info(`Licensed: ${status.payload.email} (${status.payload.plan}, ${status.daysLeft} days left)`);
      
      // Warn if expiring soon
      if (status.daysLeft <= 14) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Licentie Verloopt Binnenkort',
          message: `Je KaimPLE licentie verloopt over ${status.daysLeft} dagen.`,
          detail: 'Neem contact op om je licentie te verlengen.',
          buttons: ['OK'],
        });
      }
    }

    // Check for updates
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
