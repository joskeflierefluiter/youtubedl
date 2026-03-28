const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  downloadVideo: (payload) => ipcRenderer.invoke('download-video', payload),
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  }
});
