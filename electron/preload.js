/**
 * SurfaceMac Wizard - Preload Script
 * 
 * Exposes safe IPC bridge between renderer and main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Platform info
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Permission checks (macOS)
    checkFullDiskAccess: () => ipcRenderer.invoke('check-full-disk-access'),
    openFullDiskSettings: () => ipcRenderer.invoke('open-full-disk-settings'),

    // SMBIOS Generation (native TypeScript implementation)
    generateSMBIOS: (model) => ipcRenderer.invoke('generate-smbios', model),

    // USB Operations
    listUSBDrives: () => ipcRenderer.invoke('list-usb-drives'),
    formatUSB: (drivePath, format) => ipcRenderer.invoke('format-usb', drivePath, format),
    onFormatStatus: (callback) => ipcRenderer.on('format-status', (_, message) => callback(message)),

    // Downloads with progress
    downloadFile: (url, destPath) => ipcRenderer.invoke('download-file', url, destPath),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    downloadRecovery: (macosVersion, targetPath) => ipcRenderer.invoke('download-recovery', macosVersion, targetPath),
    downloadFullInstaller: (macosVersion) => ipcRenderer.invoke('download-full-installer', macosVersion),
    createInstallMedia: (installerPath, usbPath) => ipcRenderer.invoke('create-install-media', installerPath, usbPath),
    downloadDefaultEFI: (url) => ipcRenderer.invoke('download-efi', url),

    // Config Operations
    injectConfig: (details) => ipcRenderer.invoke('inject-config', details),
    readConfig: (path) => ipcRenderer.invoke('read-config', path),
    writeConfig: (path, config) => ipcRenderer.invoke('write-config', path, config),

    // EFI Operations (native implementation - no MountEFI Python needed)
    listEFIPartitions: () => ipcRenderer.invoke('list-efi-partitions'),
    mountEFI: (diskPath) => ipcRenderer.invoke('mount-efi', diskPath),
    unmountEFI: (diskPath) => ipcRenderer.invoke('unmount-efi', diskPath),
    unmountDisk: (diskPath) => ipcRenderer.invoke('unmount-disk', diskPath),
    copyEFI: (source, dest) => ipcRenderer.invoke('copy-efi', source, dest),
    onCopyProgress: (callback) => ipcRenderer.on('copy-progress', (_, file) => callback(file)),
    downloadDefaultEFI: (url) => ipcRenderer.invoke('download-efi', url),

    // Dialog operations
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});

console.log('SurfaceMac preload script loaded');
