/**
 * Config.plist Service
 * 
 * Read and write OpenCore config.plist files using the plist npm package.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as plist from 'plist';

export interface SMBIOSConfig {
  SystemSerialNumber: string;
  MLB: string;
  SystemUUID: string;
  SystemProductName: string;
}

export interface KextEntry {
  BundlePath: string;
  Enabled: boolean;
  ExecutablePath?: string;
  PlistPath?: string;
}

export interface ConfigPlist {
  PlatformInfo?: {
    Generic?: Partial<SMBIOSConfig>;
  };
  Kernel?: {
    Add?: KextEntry[];
  };
  NVRAM?: {
    Add?: {
      [key: string]: {
        [key: string]: string | Buffer;
      };
    };
  };
  [key: string]: unknown;
}

/**
 * Read a config.plist file
 */
export function readConfig(configPath: string): ConfigPlist {
  const content = fs.readFileSync(configPath, 'utf8');
  return plist.parse(content) as ConfigPlist;
}

/**
 * Write a config.plist file
 */
export function writeConfig(configPath: string, config: ConfigPlist): void {
  const content = plist.build(config as plist.PlistValue);
  fs.writeFileSync(configPath, content, 'utf8');
}

/**
 * Inject SMBIOS data into config.plist
 */
export function injectSMBIOS(
  configPath: string,
  smbios: {
    serial: string;
    mlb: string;
    uuid: string;
    model: string;
  }
): void {
  const config = readConfig(configPath);

  // Ensure PlatformInfo.Generic exists
  if (!config.PlatformInfo) {
    config.PlatformInfo = {};
  }
  if (!config.PlatformInfo.Generic) {
    config.PlatformInfo.Generic = {};
  }

  // Inject SMBIOS values
  config.PlatformInfo.Generic.SystemSerialNumber = smbios.serial;
  config.PlatformInfo.Generic.MLB = smbios.mlb;
  config.PlatformInfo.Generic.SystemUUID = smbios.uuid;
  config.PlatformInfo.Generic.SystemProductName = smbios.model;

  writeConfig(configPath, config);
}

/**
 * Enable or disable a kext in config.plist
 */
export function setKextEnabled(
  configPath: string,
  kextName: string,
  enabled: boolean
): boolean {
  const config = readConfig(configPath);

  if (!config.Kernel?.Add) {
    return false;
  }

  const kext = config.Kernel.Add.find(
    (k) => k.BundlePath === kextName || k.BundlePath.includes(kextName)
  );

  if (!kext) {
    return false;
  }

  kext.Enabled = enabled;
  writeConfig(configPath, config);
  return true;
}

/**
 * Configure WiFi kexts based on macOS version
 * - Sonoma: Enable AirportItlwm, disable itlwm
 * - Sequoia: Enable itlwm, disable AirportItlwm
 */
export function configureWifiKexts(
  configPath: string,
  macosVersion: 'sonoma' | 'sequoia'
): void {
  const config = readConfig(configPath);

  if (!config.Kernel?.Add) {
    return;
  }

  for (const kext of config.Kernel.Add) {
    if (kext.BundlePath.includes('AirportItlwm')) {
      kext.Enabled = macosVersion === 'sonoma';
    }
    if (kext.BundlePath === 'itlwm.kext') {
      kext.Enabled = macosVersion === 'sequoia';
    }
  }

  writeConfig(configPath, config);
}

/**
 * Set boot arguments
 */
export function setBootArgs(configPath: string, bootArgs: string): void {
  const config = readConfig(configPath);

  if (!config.NVRAM) {
    config.NVRAM = {};
  }
  if (!config.NVRAM.Add) {
    config.NVRAM.Add = {};
  }

  const appleNvram = '7C436110-AB2A-4BBB-A880-FE41995C9F82';
  if (!config.NVRAM.Add[appleNvram]) {
    config.NVRAM.Add[appleNvram] = {};
  }

  config.NVRAM.Add[appleNvram]['boot-args'] = bootArgs;

  writeConfig(configPath, config);
}

/**
 * Get current boot arguments
 */
export function getBootArgs(configPath: string): string {
  const config = readConfig(configPath);
  const appleNvram = '7C436110-AB2A-4BBB-A880-FE41995C9F82';
  
  const bootArgs = config.NVRAM?.Add?.[appleNvram]?.['boot-args'];
  return typeof bootArgs === 'string' ? bootArgs : '';
}

export default {
  readConfig,
  writeConfig,
  injectSMBIOS,
  setKextEnabled,
  configureWifiKexts,
  setBootArgs,
  getBootArgs,
};
