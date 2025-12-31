/// <reference types="vite/client" />

// Electron API types
interface ElectronAPI {
  getPlatform: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  listUSBDrives: () => Promise<USBDrive[]>;
  formatUSB: (drivePath: string, format: string) => Promise<void>;
  downloadFile: (url: string, dest: string) => Promise<void>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void;
  downloadRecovery: (macosVersion: string) => Promise<void>;
  generateSMBIOS: () => Promise<SMBIOSData>;
  readConfig: (configPath: string) => Promise<ConfigPlist>;
  writeConfig: (configPath: string, config: ConfigPlist) => Promise<void>;
  mountEFI: (diskPath: string) => Promise<string>;
  copyEFI: (source: string, dest: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  selectUSBDrive: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
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

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
