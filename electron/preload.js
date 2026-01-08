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
    getAppVersion: () => ipcRenderer.invoke('get-app-version'), // Fixed back to get-app-version
    checkAdmin: () => ipcRenderer.invoke('check-admin'),
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
    extractBaseSystemFromPkg: (pkgPath) => ipcRenderer.invoke('extract-basesystem-from-pkg', pkgPath),
    copyRecoveryToUsb: (options) => ipcRenderer.invoke('copy-recovery-to-usb', options),

    // Windows Hybrid Extensions
    extractAppFromPkg: (pkgPath) => ipcRenderer.invoke('extract-app-from-pkg', pkgPath),
    copyAppToUsb: (options) => ipcRenderer.invoke('copy-app-to-usb', options),

    // Config Operations
    injectConfig: (details) => ipcRenderer.invoke('inject-config', details),
    readConfig: (path) => ipcRenderer.invoke('read-config', path),
    writeConfig: (path, config) => ipcRenderer.invoke('write-config', path, config),

    // EFI Operations (native implementation - no MountEFI Python needed)
    // EFI Operations (native implementation - no MountEFI Python needed)
    listEFIPartitions: () => ipcRenderer.invoke('list-efi-partitions'),
    downloadDefaultEFI: (repoOrUrl) => ipcRenderer.invoke('download-efi', repoOrUrl),
    mountEFI: (diskPath) => ipcRenderer.invoke('mount-efi', diskPath),
    copyEFI: (source, dest) => ipcRenderer.invoke('copy-efi', source, dest),
    patchEfiExFat: (efiPath) => ipcRenderer.invoke('patch-efi-exfat', efiPath),
    unmountEFI: (diskPath) => ipcRenderer.invoke('unmount-efi', diskPath),
    unmountDisk: (diskPath) => ipcRenderer.invoke('unmount-disk', diskPath),
    onCopyProgress: (callback) => ipcRenderer.on('copy-progress', (_, file) => callback(file)),

    // Dialog operations
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});

console.log('SurfaceMac preload script loaded');
