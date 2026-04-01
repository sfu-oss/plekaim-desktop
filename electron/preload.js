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
  importsList: () => ipcRenderer.invoke('imports-list'),
  importsSave: (payload) => ipcRenderer.invoke('imports-save', payload),
  importsGet: (id) => ipcRenderer.invoke('imports-get', { id }),
  importsDelete: (id) => ipcRenderer.invoke('imports-delete', { id }),
  // Native FEM engine (complete C++ pipeline)
  nativeSolverAvailable: () => ipcRenderer.invoke('native-solver-available'),
  nativeEngineSolve: (input) => ipcRenderer.invoke('native-engine-solve', input),
});
