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
    <input id="email" type="email" placeholder="je@email.com" style="margin-bottom:8px" />
    <input id="key" type="text" placeholder="KAIM-PRO-20270331-xxxx" autofocus />
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
      const email = document.getElementById('email').value.trim();
      if (!email) { document.getElementById('error').textContent = 'Vul je email in'; document.getElementById('error').style.display = 'block'; return; }
      ipcRenderer.send('license-activate', { key, email });
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
    ipcMain.once('license-activate', (event, data) => {
      const { key, email } = data;
      const result = validateKey(key, email);
      if (result.valid) {
        saveLicense(key, email);
        log.info(`License activated: ${email} (${result.payload.plan}, expires ${result.payload.expiresAt})`);
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


// ─── Admin: License generation IPC ─────────────────────────
const ADMIN_EMAILS = ['skuu@kaimple.com', 'desktop@kaimple.com', 'admin@kaimple.com'];
// Look for private key in multiple locations (env var, userData, relative)
const PRIVATE_KEY_PATH = (() => {
  const candidates = [
    process.env.LICENSE_PRIVATE_KEY_PATH,
    process.env.KAIM_PRIVATE_KEY_PATH,
    path.join(app.getPath('userData'), 'private.pem'),
    path.join(require('os').homedir(), '.kaimple', 'private.pem'),
    path.join(__dirname, '..', 'license-tools', 'private.pem'),
  ].filter(Boolean);
  const fs = require('fs');
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0] || '';
})();

ipcMain.handle('generate-license', async (event, payload) => {
  const fs = require('fs');
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error('Private key niet gevonden. Alleen beschikbaar op admin machines.');
  }
  
  const crypto = require('crypto');
  const secret = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
  
  const expiryStr = payload.expiresAt.split('T')[0].replace(/-/g, '');
  const data = [payload.plan, expiryStr, payload.email].join('|');
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('base64url').slice(0, 16);
  const licenseKey = 'KAIM-' + payload.plan.toUpperCase() + '-' + expiryStr + '-' + hmac;
  
  log.info('License generated for ' + payload.email + ' (' + payload.plan + ', expires ' + payload.expiresAt + ')');
  return licenseKey;
});

ipcMain.handle('get-license-info', async () => {
  const status = checkLicense();
  return status;
});

ipcMain.handle('export-license-file', async (event, payload) => {
  const { dialog } = require('electron');
  const fs = require('fs');
  
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = payload.expiresAt ? payload.expiresAt.split('T')[0] : 'onbekend';
  
  const content = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '       KaimPLE Licentie Gegevens',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Naam:          ${payload.name || '(niet opgegeven)'}`,
    `Email:         ${payload.email}`,
    `Plan:          ${payload.plan.toUpperCase()}`,
    `Geldig:        ${payload.days} dagen`,
    `Ingangsdatum:  ${startDate}`,
    `Einddatum:     ${endDate}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  Licentie Key (kopieer deze):',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    payload.key,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Instructies:',
    '1. Open KaimPLE',
    '2. Ga naar het licentie scherm',
    '3. Voer je email in en plak de key',
    '4. Klik op Activeren',
    '',
    'Vragen? Neem contact op via support@kaimple.com',
  ].join('\n');
  
  const safeName = (payload.name || payload.email).replace(/[^a-zA-Z0-9]/g, '_');
  const defaultPath = `KaimPLE_Licentie_${safeName}.txt`;
  
  const result = await dialog.showSaveDialog({
    title: 'Licentie exporteren',
    defaultPath: defaultPath,
    filters: [{ name: 'Tekstbestand', extensions: ['txt'] }],
  });
  
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, path: result.filePath };
  }
  return { success: false };
});


// ─── Local imports storage (replaces /api/dhstress/imports) ─────────
const IMPORTS_DIR = path.join(app.getPath('userData'), 'imports');

ipcMain.handle('imports-list', async () => {
  const fs = require('fs');
  if (!fs.existsSync(IMPORTS_DIR)) fs.mkdirSync(IMPORTS_DIR, { recursive: true });
  const files = fs.readdirSync(IMPORTS_DIR).filter(f => f.endsWith('.json'));
  const items = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(IMPORTS_DIR, f), 'utf-8'));
      return { id: f.replace('.json', ''), ...data };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { items };
});

ipcMain.handle('imports-save', async (event, { name, data }) => {
  const fs = require('fs');
  if (!fs.existsSync(IMPORTS_DIR)) fs.mkdirSync(IMPORTS_DIR, { recursive: true });
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const record = { name, date: new Date().toISOString(), data };
  fs.writeFileSync(path.join(IMPORTS_DIR, id + '.json'), JSON.stringify(record));
  return { id, ...record };
});

ipcMain.handle('imports-get', async (event, { id }) => {
  const fs = require('fs');
  const filePath = path.join(IMPORTS_DIR, id + '.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

ipcMain.handle('imports-delete', async (event, { id }) => {
  const fs = require('fs');
  const filePath = path.join(IMPORTS_DIR, id + '.json');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { success: true };
});

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
    title: 'KaimPLE Desktop',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
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
