/**
 * USB Drive Service
 * 
 * Cross-platform USB drive detection and formatting.
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface USBDrive {
  id: string;
  name: string;
  size: string;
  path: string;
  mountPoint?: string;
}

/**
 * List connected USB drives (macOS implementation)
 */
async function listUSBDrivesDarwin(): Promise<USBDrive[]> {
  try {
    const { stdout } = await execAsync('diskutil list -plist external physical');
    
    // Parse plist output (simplified - would use plist parser in production)
    const diskPattern = /disk\d+/g;
    const disks = stdout.match(diskPattern) || [];
    
    const drives: USBDrive[] = [];
    
    for (const disk of [...new Set(disks)]) {
      try {
        const { stdout: infoOutput } = await execAsync(`diskutil info -plist /dev/${disk}`);
        
        // Extract drive info (simplified parsing)
        const nameMatch = infoOutput.match(/<key>MediaName<\/key>\s*<string>([^<]+)<\/string>/);
        const sizeMatch = infoOutput.match(/<key>TotalSize<\/key>\s*<integer>(\d+)<\/integer>/);
        
        const name = nameMatch ? nameMatch[1] : 'USB Drive';
        const sizeBytes = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
        const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(1);
        
        drives.push({
          id: disk,
          name,
          size: `${sizeGB} GB`,
          path: `/dev/${disk}`,
        });
      } catch {
        // Skip disks we can't read
      }
    }
    
    return drives;
  } catch (error) {
    console.error('Failed to list USB drives:', error);
    return [];
  }
}

/**
 * List connected USB drives (Windows implementation)
 */
async function listUSBDrivesWindows(): Promise<USBDrive[]> {
  try {
    const { stdout } = await execAsync(
      'powershell -command "Get-WmiObject Win32_DiskDrive | Where-Object { $_.InterfaceType -eq \'USB\' } | Select-Object DeviceID, Model, Size | ConvertTo-Json"'
    );
    
    const disks = JSON.parse(stdout || '[]');
    const drives: USBDrive[] = [];
    
    for (const disk of Array.isArray(disks) ? disks : [disks]) {
      if (disk && disk.DeviceID) {
        const sizeGB = disk.Size ? (disk.Size / (1024 * 1024 * 1024)).toFixed(1) : '0';
        drives.push({
          id: disk.DeviceID.replace(/\\\\/g, ''),
          name: disk.Model || 'USB Drive',
          size: `${sizeGB} GB`,
          path: disk.DeviceID,
        });
      }
    }
    
    return drives;
  } catch (error) {
    console.error('Failed to list USB drives:', error);
    return [];
  }
}

/**
 * List connected USB drives (cross-platform)
 */
export async function listUSBDrives(): Promise<USBDrive[]> {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    return listUSBDrivesDarwin();
  } else if (platform === 'win32') {
    return listUSBDrivesWindows();
  }
  
  return [];
}

/**
 * Format USB drive for macOS installer (macOS host)
 */
async function formatUSBDarwin(
  diskPath: string,
  name: string = 'Install macOS'
): Promise<void> {
  // Unmount first
  await execAsync(`diskutil unmountDisk ${diskPath}`);
  
  // Format as Mac OS Extended (Journaled) with GUID partition table
  await execAsync(
    `diskutil eraseDisk JHFS+ "${name}" GPT ${diskPath}`
  );
  
  console.log(`Formatted ${diskPath} as JHFS+ with name "${name}"`);
}

/**
 * Format USB drive for macOS installer (Windows host)
 * Uses FAT32 since Windows can't create HFS+
 */
async function formatUSBWindows(
  diskPath: string,
  name: string = 'MACOS'
): Promise<void> {
  // Get disk number from path
  const diskNum = diskPath.match(/\d+/)?.[0];
  if (!diskNum) {
    throw new Error('Invalid disk path');
  }

  // Use diskpart to format
  const diskpartScript = `
select disk ${diskNum}
clean
create partition primary
select partition 1
format fs=fat32 quick label=${name.substring(0, 11)}
active
assign
exit
`;

  // Write script to temp file
  const tempPath = path.join(process.env.TEMP || 'C:\\Temp', 'diskpart.txt');
  fs.writeFileSync(tempPath, diskpartScript);

  await execAsync(`diskpart /s "${tempPath}"`);
  
  // Clean up
  fs.unlinkSync(tempPath);
  
  console.log(`Formatted disk ${diskNum} as FAT32 with name "${name}"`);
}

/**
 * Format USB drive (cross-platform)
 */
export async function formatUSB(
  diskPath: string,
  name: string = 'Install macOS'
): Promise<void> {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    return formatUSBDarwin(diskPath, name);
  } else if (platform === 'win32') {
    return formatUSBWindows(diskPath, name);
  }
  
  throw new Error('Unsupported platform');
}

/**
 * Mount EFI partition (macOS only)
 */
export async function mountEFI(diskPath: string): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error('EFI mounting only supported on macOS');
  }

  // Find EFI partition (usually s1)
  const efiPartition = `${diskPath}s1`;
  
  // Mount it
  await execAsync(`diskutil mount ${efiPartition}`);
  
  // Get mount point
  const { stdout } = await execAsync(`diskutil info ${efiPartition}`);
  const mountMatch = stdout.match(/Mount Point:\s+(.+)/);
  
  return mountMatch ? mountMatch[1].trim() : '/Volumes/EFI';
}

/**
 * Copy files to USB
 */
export async function copyToUSB(
  sourcePath: string,
  usbMountPoint: string,
  destFolder: string = ''
): Promise<void> {
  const destPath = path.join(usbMountPoint, destFolder);
  
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true });
  }
  
  if (process.platform === 'darwin') {
    await execAsync(`cp -R "${sourcePath}" "${destPath}"`);
  } else {
    await execAsync(`xcopy "${sourcePath}" "${destPath}" /E /H /I /Y`);
  }
}

export default {
  listUSBDrives,
  formatUSB,
  mountEFI,
  copyToUSB,
};
