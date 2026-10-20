const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("roomfit", {
  preferences: (value) => ipcRenderer.invoke("preferences", value),
  restore: () => ipcRenderer.invoke("restore"),
  checkpoint: (json, variants) =>
    ipcRenderer.invoke("checkpoint", json, variants),
  save: (json, saveAs = false) => ipcRenderer.invoke("save", json, saveAs),
  open: () => ipcRenderer.invoke("open"),
  render: (manifest) => ipcRenderer.invoke("render", manifest),
  cancel: () => ipcRenderer.invoke("cancel"),
  status: () => ipcRenderer.invoke("render-status"),
  configure: () => ipcRenderer.invoke("configure-blender"),
  result: () => ipcRenderer.invoke("render-result"),
  exportImage: () => ipcRenderer.invoke("export-image"),
  print: (html) => ipcRenderer.invoke("print-report", html),
});
