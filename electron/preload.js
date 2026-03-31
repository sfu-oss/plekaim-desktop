const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateLicense: (payload) => ipcRenderer.invoke('generate-license', payload),
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
  copyToClipboard: (text) => clipboard.writeText(text),
  exportLicenseFile: (payload) => ipcRenderer.invoke('export-license-file', payload),
});
