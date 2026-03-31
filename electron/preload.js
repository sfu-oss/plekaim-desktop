const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateLicense: (payload) => ipcRenderer.invoke('generate-license', payload),
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
  copyToClipboard: (text) => clipboard.writeText(text),
  copyImageToClipboard: (dataUrl) => {
    const { nativeImage } = require('electron');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
    clipboard.writeImage(img);
  },
  exportLicenseFile: (payload) => ipcRenderer.invoke('export-license-file', payload),
});
