/// <reference types="vite/client" />

// Electron API types
interface ElectronAPI {
  getPlatform: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  checkFullDiskAccess: () => Promise<{ hasAccess: boolean }>;
  openFullDiskSettings: () => Promise<{ success: boolean }>;
  listUSBDrives: () => Promise<USBDrive[]>;
  formatUSB: (drivePath: string, format: string) => Promise<{ success: boolean; volumeName: string; volumePath: string }>;
  downloadFile: (url: string, dest: string) => Promise<void>;
  onDownloadProgress: (callback: (progress: any) => void) => void;
  downloadRecovery: (version: string, targetPath?: string) => Promise<{ success: boolean }>;
  downloadFullInstaller: (version: string) => Promise<{ success: boolean; installerPath: string }>;
  createInstallMedia: (installerPath: string, volumePath: string) => Promise<{ success: boolean }>;
  generateSMBIOS: (model?: string) => Promise<SMBIOSData>;
  readConfig: (path: string) => Promise<any>;
  writeConfig: (path: string, config: any) => Promise<{ success: boolean }>;
  listEFIPartitions: () => Promise<EFIPartition[]>;
  mountEFI: (diskPath: string) => Promise<string>;
  unmountEFI: (diskPath: string) => Promise<{ success: boolean }>;
  unmountDisk: (diskPath: string) => Promise<{ success: boolean }>;
  copyEFI: (source: string, dest: string) => Promise<{ success: boolean }>;
  onCopyProgress: (callback: (file: string) => void) => void;
  downloadDefaultEFI: (url: string) => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  selectUSBDrive: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  onFormatStatus: (callback: (message: string) => void) => void;
  injectConfig: (details: { cpuType: string, smbios: any, macosVersion: string, diskPath: string, verbose?: boolean }) => Promise<{ success: boolean }>;
}

interface EFIPartition {
  id: string; // disk0s1
  diskId: string; // disk0
  diskType: string; // internal, external
  diskName: string; // "Macintosh HD", etc
  label: string; // "EFI"
  mounted: boolean;
  mountPoint: string | null;
}



declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }

  interface EFIPartition {
    id: string; // disk0s1
    diskId: string; // disk0
    diskType: string; // internal, external
    diskName: string; // "Macintosh HD", etc
    label: string; // "EFI"
    mounted: boolean;
    mountPoint: string | null;
  }

  interface USBDrive {
    id: string;
    name: string;
    size: string;
    path: string;
  }

  interface DownloadProgress {
    id: string;
    percent: number;
    totalBytes: number;
    downloadedBytes: number;
  }

  interface SMBIOSData {
    model: string;
    serial: string;
    mlb: string;
    uuid: string;
  }

  interface ConfigPlist {
    PlatformInfo?: {
      Generic?: {
        SystemSerialNumber?: string;
        MLB?: string;
        SystemUUID?: string;
        SystemProductName?: string;
      };
    };
    Kernel?: {
      Add?: Array<{ BundlePath: string }>;
    };
    NVRAM?: {
      Add?: Record<string, Record<string, string>>;
    };
  }
}

export {};
