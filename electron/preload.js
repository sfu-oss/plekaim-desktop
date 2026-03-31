const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateLicense: (payload) => ipcRenderer.invoke('generate-license', payload),
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
});
