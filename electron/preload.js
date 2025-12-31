const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Platform info
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // USB Operations
    listUSBDrives: () => ipcRenderer.invoke('list-usb-drives'),
    formatUSB: (drivePath, format) => ipcRenderer.invoke('format-usb', drivePath, format),

    // Downloads
    downloadFile: (url, dest) => ipcRenderer.invoke('download-file', url, dest),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, progress) => callback(progress)),

    // Recovery
    downloadRecovery: (macosVersion) => ipcRenderer.invoke('download-recovery', macosVersion),

    // SMBIOS
    generateSMBIOS: () => ipcRenderer.invoke('generate-smbios'),

    // Config
    readConfig: (configPath) => ipcRenderer.invoke('read-config', configPath),
    writeConfig: (configPath, config) => ipcRenderer.invoke('write-config', configPath, config),

    // EFI Operations
    mountEFI: (diskPath) => ipcRenderer.invoke('mount-efi', diskPath),
    copyEFI: (source, dest) => ipcRenderer.invoke('copy-efi', source, dest),

    // File system
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectUSBDrive: () => ipcRenderer.invoke('select-usb-drive'),

    // Shell
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
