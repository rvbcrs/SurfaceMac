/**
 * SurfaceMac Wizard - Electron Main Process
 * 
 * Handles all native operations: SMBIOS generation, downloads, USB formatting, etc.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Import services (will be transpiled from TypeScript)
// For now, inline the implementations since we're running as JS

let mainWindow = null;

// ========== SMBIOS Generation ==========
const BASE34_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const LOCATION_CODES = ['C02', 'C07', 'C17', 'C1M', 'C2V', 'CK2', 'D25', 'DQG', 'DYJ', 'F5K', 'F5V', 'F17', 'FC2', 'FVF', 'G8W', 'GQ6', 'H2W', 'J9G'];
const MODEL_CODES = {
  'MacBookAir9,1': 'GQ6Y',
  'MacBookPro16,2': 'JWQ6',
  'MacBookPro16,1': 'HDWP',
};

function randomBase34() {
  return BASE34_CHARS[Math.floor(Math.random() * BASE34_CHARS.length)];
}

function randomAlphanumeric(length) {
  let result = '';
  for (let i = 0; i < length; i++) result += randomBase34();
  return result;
}

function generateSMBIOS(model = 'MacBookAir9,1') {
  const modelCode = MODEL_CODES[model] || 'GQ6Y';
  const location = LOCATION_CODES[Math.floor(Math.random() * LOCATION_CODES.length)];

  return {
    model,
    serial: `${location}${randomBase34()}${randomBase34()}${randomAlphanumeric(3)}${modelCode}`,
    mlb: `${location}${randomAlphanumeric(4)}${randomAlphanumeric(5)}${modelCode}${randomBase34()}`,
    uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16).toUpperCase();
    }),
  };
}

// ========== Window Creation ==========
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

// ========== IPC Handlers ==========

// Platform info
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-app-version', () => app.getVersion());

// Check for Admin Privileges (Windows)
ipcMain.handle('check-admin', () => {
  if (process.platform === 'win32') {
    try {
      require('child_process').execSync('net session', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }
  return true; // Assume true on macOS/Linux (sudo handled separately)
});

// Full Disk Access check (macOS only)
// Tests by trying to read a protected directory
ipcMain.handle('check-full-disk-access', async () => {
  if (process.platform !== 'darwin') return { hasAccess: true };

  const fs = require('fs');
  try {
    // Try to read a protected directory - this requires Full Disk Access
    fs.readdirSync('/Library/Application Support/com.apple.TCC');
    return { hasAccess: true };
  } catch (err) {
    // EACCES means no Full Disk Access
    return { hasAccess: false };
  }
});

// Open macOS System Settings to Full Disk Access
ipcMain.handle('open-full-disk-settings', async () => {
  const { shell } = require('electron');
  if (process.platform === 'darwin') {
    // Opens System Settings > Privacy & Security > Full Disk Access
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
    return { success: true };
  }
  return { success: false };
});

// SMBIOS Generation
ipcMain.handle('generate-smbios', (_, model) => {
  return generateSMBIOS(model || 'MacBookAir9,1');
});

// USB Operations
ipcMain.handle('list-usb-drives', async () => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('diskutil list external physical');
      const lines = stdout.split('\n');
      const drives = [];

      for (const line of lines) {
        const diskMatch = line.match(/^\/dev\/(disk\d+)/);
        if (diskMatch) {
          const disk = diskMatch[1];
          try {
            const { stdout: info } = await execAsync(`diskutil info /dev/${disk}`);
            const nameMatch = info.match(/Device \/ Media Name:\s+(.+)/);
            const sizeMatch = info.match(/Disk Size:\s+(\S+\s+\S+)/);

            drives.push({
              id: disk,
              name: nameMatch ? nameMatch[1].trim() : 'USB Drive',
              size: sizeMatch ? sizeMatch[1] : 'Unknown',
              path: `/dev/${disk}`,
            });
          } catch (e) {
            // Skip drives we can't read
          }
        }
      }

      return drives;
    } else if (process.platform === 'win32') {
      // Windows: Use Get-CimInstance with MediaType filter for reliable USB detection
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_DiskDrive | Where-Object MediaType -eq 'Removable Media' | Select-Object DeviceID, Model, Size | ConvertTo-Json -Compress"`
      );

      if (!stdout || stdout.trim() === '') {
        return [];
      }

      const disks = JSON.parse(stdout);
      const drives = [];

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
    }

    return [];
  } catch (error) {
    console.error('Failed to list USB drives:', error);
    return [];
  }
});

ipcMain.handle('format-usb', async (event, diskPath, format) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const path = require('path');
  const fs = require('fs');

  // Helper to send status updates
  const setStatus = (msg) => event.sender.send('format-status', msg);

  if (process.platform === 'darwin') {
    // SKIP FORMAT CHECK: If BOOT and INSTALL partitions already exist, skip formatting
    const bootVolumeExists = fs.existsSync('/Volumes/BOOT');
    const installVolumeExists = fs.existsSync('/Volumes/INSTALL');

    if (bootVolumeExists && installVolumeExists) {
      console.log('[USB] BOOT and INSTALL partitions already exist. Skipping format.');
      setStatus('USB already formatted (BOOT + INSTALL found). Skipping...');

      // Return immediately with the volume paths
      return {
        success: true,
        volumeName: 'INSTALL',
        volumePath: '/Volumes/INSTALL',
        bootVolumePath: '/Volumes/BOOT',
        skippedFormat: true
      };
    }

    setStatus('Unmounting disk...');
    console.log(`[USB] Attempting to unmount ${diskPath} with force...`);
    try {
      await execAsync(`diskutil unmountDisk force "${diskPath}"`);
    } catch (e) { /* ignore error if already unmounted */ }

    // Wait a moment after unmount
    await new Promise(r => setTimeout(r, 1000));

    setStatus('Erasing disk (this may take a while)...');
    console.log(`[USB] Erasing disk ${diskPath}...`);
    try {
      // Map friendly format names to diskutil codes
      // Map friendly format names to diskutil codes
      let fsType = 'JHFS+'; // Default
      let volumeName = 'Install macOS';

      if (format === 'MS-DOS (FAT32)' || format === 'FAT32') {
        fsType = 'FAT32';
        volumeName = 'INSTALL'; // FAT32 has strict limits
      } else if (format === 'Mac OS Extended (Journaled)') {
        fsType = 'JHFS+';
        volumeName = 'Install macOS';
      } else if (format === 'ExFAT') {
        fsType = 'ExFAT';
        volumeName = 'INSTALL';
      }

      console.log(`[USB] Formatting as ${fsType} with name "${volumeName}"...`);

      // 3. Format disk
      // For ExFAT (Hybrid Installer), use partitionDisk to create separate BOOT partition (300MB)
      // Layout: s1 = auto EFI (200MB for OpenCore), s2 = BOOT (300MB for recovery files), s3 = INSTALL (ExFAT for .app)
      // 3-Partition Power Method (User Requested)
      // 1. EFI (Hidden, Auto-created by GPT, ~200MB)
      // 2. BOOT (FAT32, 3GB) -> Hosts Recovery (BaseSystem.dmg)
      // 3. INSTALL (ExFAT, Rest) -> Hosts Payload (Install macOS.app with SharedSupport.dmg)

      console.log('[USB] Formatting with 3-Partition Power Layout (EFI, BOOT, INSTALL)...');

      // Command: diskutil partitionDisk /dev/diskX GPT FAT32 "BOOT" 3G ExFAT "INSTALL" R
      // This implicitly creates EFI as slice 1
      await execAsync(`diskutil partitionDisk "${diskPath}" GPT FAT32 "BOOT" 3G ExFAT "INSTALL" R`);

      setStatus('Formatting complete!');

      // Return details about the volumes
      return {
        success: true,
        volumeName: 'INSTALL',
        volumePath: '/Volumes/INSTALL',
        bootVolumePath: '/Volumes/BOOT'
      };
    } catch (error) {
      console.error(`[USB] HOST ERROR: ${error.message}`);
      throw error;
    }

    setStatus('Waiting for volume to mount...');
    console.log(`[USB] Erase complete. Waiting for volume to mount...`);
    // Wait for the volume to be mounted and ready
    await new Promise(r => setTimeout(r, 5000));

    // 4. Download Recovery Image
    setStatus('Downloading macOS Recovery...');
    // We can call the handler logic directly or via IPC if we refactor,
    // but here we'll just invoking the logic similarly since we are in main process
    try {
      // Reuse download-recovery logic via internal call or just client call
      // For simplicity, we assume client calls downloadRecovery separately?
      // NO, the requirement was "one click".
      // Use ipcMain handler logic directly:
      // Re-locate handler since we can't call ipcMain.handle from here easily without refactor.
      // Actually earlier code showed UsbStep calls these sequentially?
      // Ah, UsbStep.tsx: await window.electronAPI.formatUSB(...); await window.electronAPI.downloadRecovery(...);
      // So we don't need to do it HERE.
      // BUT user asked for progress bar info. UsbStep manages the sequence.
      // So we just return here.

      setStatus('Formatting complete!');
      return { success: true };
    } catch (error) {
      console.error('USB Preparation failed:', error);
      throw error;
    }
  } else {
    // Windows implementation (mock for now or external tool)
    return { success: true };
  }
});

// Unmount EFI
ipcMain.handle('unmount-efi', async (_, diskPath) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // Windows Implementation
  if (process.platform === 'win32') {
    try {
      console.log(`[EFI] Unmounting Windows EFI: ${diskPath}`);

      let driveLetter = '';

      // If passed a drive letter directly
      if (/^[A-Z]:\\?$/i.test(diskPath)) {
        driveLetter = diskPath.substring(0, 2);
      } else {
        // Assume PHYSICALDRIVE and find partition 1 letter
        const diskNumMatch = diskPath.match(/PHYSICALDRIVE(\d+)/i);
        if (diskNumMatch) {
          const diskNum = diskNumMatch[1];
          const psCommand = `powershell -NoProfile -Command "Get-Partition -DiskNumber ${diskNum} -PartitionNumber 1 | Select-Object -ExpandProperty DriveLetter"`;
          const { stdout } = await execAsync(psCommand);
          driveLetter = stdout ? stdout.trim() : '';

          if (driveLetter && driveLetter.length === 1) driveLetter += ':';
        }
      }

      if (driveLetter) {
        console.log(`[EFI] Removing drive letter ${driveLetter}...`);
        await execAsync(`mountvol ${driveLetter} /D`);
        return { success: true };
      }

      console.log('[EFI] No mounted drive letter found to unmount.');
      return { success: true }; // Nothing to unmount

    } catch (err) {
      console.error('[EFI] Unmount failed:', err);
      throw err;
    }
  }

  // macOS Implementation
  // Normalize path
  let cleanPath = diskPath;
  if (cleanPath.startsWith('/dev/')) cleanPath = cleanPath.substring(5);
  cleanPath = cleanPath.replace(/\/+/g, '/');

  // If input is a whole disk (e.g. disk8), append 's1'
  if (!/disk\d+s\d+/.test(cleanPath)) {
    cleanPath = `${cleanPath}s1`;
  }
  const partitionPath = `/dev/${cleanPath}`;

  console.log(`[EFI] Unmounting ${partitionPath}...`);
  try {
    await execAsync(`diskutil unmount "${partitionPath}"`);
    return { success: true };
  } catch (e) {
    console.error('Unmount failed:', e);
    // It might be already unmounted or force needed
    try {
      await execAsync(`diskutil unmount force "${partitionPath}"`);
      return { success: true };
    } catch (e2) {
      console.error('Force unmount failed:', e2);
      throw e2;
    }
  }
});

// Helper to mount EFI partition with retries and sudo fallback
// Returns the mount point path (e.g., /Volumes/EFI)
async function mountEfiPartition(diskPath) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const path = require('path');
  const os = require('os');

  // Windows Implementation
  if (process.platform === 'win32') {
    try {
      console.log(`[EFI] Mounting Windows drive: ${diskPath}`);
      // Extract disk number from \\.\PHYSICALDRIVE<N>
      const diskNumMatch = diskPath.match(/PHYSICALDRIVE(\d+)/i);
      if (!diskNumMatch) {
        // Maybe it's already a drive letter?
        if (/^[A-Z]:\\?$/i.test(diskPath)) return diskPath.substring(0, 2); // Return "E:"
        throw new Error(`Invalid Windows disk path: ${diskPath}`);
      }

      const diskNum = diskNumMatch[1];

      // Strategy: Get the first partition and its drive letter
      // Our formatting creates a single partition which acts as EFI+Data
      const psCommand = `powershell -NoProfile -Command "Get-Partition -DiskNumber ${diskNum} -PartitionNumber 1 | Select-Object -ExpandProperty DriveLetter"`;

      let { stdout } = await execAsync(psCommand);
      let driveLetter = stdout ? stdout.trim() : '';

      // If it has a letter (returned as char code 0 sometimes if empty, or just empty string), return it
      if (driveLetter && driveLetter.length === 1) {
        const mountPoint = `${driveLetter}:`;
        console.log(`[EFI] Already mounted at ${mountPoint}`);
        return mountPoint;
      }

      // If no letter, we must assign one. Let's try to assign next available.
      // Or simply use diskpart to assign usually picks one.
      console.log(`[EFI] Partition 1 has no letter. Assigning one...`);

      // Use diskpart to assign letter
      const script = `
select disk ${diskNum}
select partition 1
assign
exit
`;
      const tempScript = path.join(os.tmpdir(), `mount_efi_${Date.now()}.txt`);
      const fs = require('fs');
      fs.writeFileSync(tempScript, script);

      await execAsync(`diskpart /s "${tempScript}"`);
      fs.unlinkSync(tempScript); // Cleanup

      // Check again
      const { stdout: stdout2 } = await execAsync(psCommand);
      driveLetter = stdout2 ? stdout2.trim() : '';

      if (driveLetter && driveLetter.length === 1) {
        return `${driveLetter}:`;
      }

      throw new Error('Failed to get drive letter after assignment');

    } catch (err) {
      console.error('[EFI] Windows Mount Error:', err);
      throw err;
    }
  }

  // MacOS Implementation (Legacy logic)
  const devPath = diskPath.replace(/\/+$/, ''); // Remove trailing slashes
  const diskId = path.basename(devPath); // e.g. disk8 or disk8s1

  let partitionPath = devPath;

  // If input is a whole disk (e.g. disk8), we need to find the EFI partition dynamically
  // Our custom format logic might put EFI at s2 (after deleting s1), so 's1' assumption is wrong.
  if (!/disk\d+s\d+/.test(diskId)) {
    console.log(`[EFI] Searching for EFI partition on ${devPath}...`);
    try {
      const { stdout } = await execAsync(`diskutil list "${devPath}"`);
      // Look for partition with name "EFI" or type "EFI"
      // Example line:   1:    EFI EFI                     209.7 MB   disk8s1
      // Example line:   2:    Microsoft Basic Data EFI    300.0 MB   disk8s2

      const lines = stdout.split('\n');
      let targetSlice = '';

      for (const line of lines) {
        if (line.includes('EFI')) {
          const match = line.match(/(disk\d+s\d+)/);
          if (match) {
            targetSlice = match[1];
            // Prefer the one named EFI if multiple found (usually s1 is small auto, s2 is our big one)
            // But validation logic handles 300MB check elsewhere?
            // Actually, if we deleted s1, only s2 remains named EFI.
            // If we have s2 named EFI, use it.
            if (line.includes('EFI') && !targetSlice.endsWith('s1')) {
              // Prefer non-s1 if available (our custom one)
              break;
            }
          }
        }
      }

      if (targetSlice) {
        partitionPath = `/dev/${targetSlice}`;
        console.log(`[EFI] Found EFI partition at ${partitionPath}`);
      } else {
        // Fallback to s1 if scan fails
        partitionPath = `${devPath}s1`;
        console.warn(`[EFI] Could not find EFI in list, defaulting to ${partitionPath}`);
      }
    } catch (e) {
      console.warn(`[EFI] List failed: ${e.message}, defaulting to s1`);
      partitionPath = `${devPath}s1`;
    }
  }

  console.log(`[EFI] Mounting ${partitionPath}...`);

  // Check if already mounted
  try {
    const { stdout } = await execAsync(`diskutil info "${partitionPath}"`);
    const mountMatch = stdout.match(/Mount Point:\s+(.+)/);

    if (mountMatch && mountMatch[1].trim() !== 'Not Mounted' && mountMatch[1].trim() !== '') {
      const existingMount = mountMatch[1].trim();
      console.log(`[EFI] Partition already mounted at ${existingMount}. Checking write permissions...`);

      // Try to write a test file to verify permissions
      const testFile = path.join(existingMount, '.write_test');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`[EFI] Existing mount ${existingMount} is writable. Reusing it.`);
        return existingMount; // Return immediately, skipping unmount/remount
      } catch (writeErr) {
        console.log(`[EFI] Existing mount ${existingMount} is NOT writable (${writeErr.code}). Forcing remount...`);
        // Proceed to unmount below
        try {
          await execAsync(`diskutil unmount force "${partitionPath}"`);
          console.log(`[EFI] Unmounted stale/read-only ${existingMount}`);
        } catch (e) {
          console.warn(`[EFI] Unmount warning: ${e.message}`);
        }
      }
    }
  } catch (e) { /* ignore info error */ }

  // Try standard mount
  for (let i = 1; i <= 3; i++) {
    try {
      await execAsync(`diskutil mount "${partitionPath}"`);
      // Verify mount
      const { stdout } = await execAsync(`diskutil info "${partitionPath}"`);
      const mountMatch = stdout.match(/Mount Point:\s+(.+)/);
      if (mountMatch) return mountMatch[1].trim();
    } catch (e) {
      console.log(`[EFI] Retry mount attempt ${i}...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('[EFI] Standard mount failed. Attempting sudo mount via AppleScript...');

  // Fallback to sudo via AppleScript
  try {
    // Must use osascript to prompt user
    await execAsync(`osascript -e 'do shell script "diskutil mount ${partitionPath}" with administrator privileges'`);
    const { stdout } = await execAsync(`diskutil info "${partitionPath}"`);
    const mountMatch = stdout.match(/Mount Point:\s+(.+)/);
    if (mountMatch) return mountMatch[1].trim();
  } catch (e) {
    console.error('[EFI] Sudo mount failed:', e);
    // Debug: list disks
    try {
      const { stdout } = await execAsync(`diskutil list`);
      console.log('[EFI] Disk List Debug:\n', stdout);
    } catch (_) { }
  }

  throw new Error(`Failed to mount EFI partition ${partitionPath}`);
}

// Mount EFI Partition
ipcMain.handle('mount-efi', async (_, diskPath) => {
  return await mountEfiPartition(diskPath);
});

// Config Injection Handler
// Config Injection Handler
ipcMain.handle('inject-config', async (_, { cpuType, smbios, macosVersion, diskPath, verbose }) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { promisify } = require('util');
  const exec = promisify(require('child_process').exec);

  // Strategy: Regex Text Replacement (Cross-Platform & Robust)
  // We avoid parsing the file entirely to prevent "empty <data>" corruption or library errors.
  // We simply find the keys we need and replace their values in the raw string.

  // Ensure EFI is mounted
  console.log(`[Config] Ensuring EFI is mounted for ${diskPath}...`);
  if (!diskPath) throw new Error("Disk path not provided for config injection");

  const mountPoint = await mountEfiPartition(diskPath);
  console.log(`[Config] EFI mounted at ${mountPoint}`);

  const ocPath = path.join(mountPoint, 'EFI', 'OC');

  if (!fs.existsSync(ocPath)) {
    console.error(`[Config] ERROR: OC not found at ${ocPath}`);
    // ... extensive debug logging omitted for brevity in replacement ...
    throw new Error(`OpenCore directory not found at ${ocPath}. Is EFI structure correct? Check debug logs.`);
  }

  const destConfig = path.join(ocPath, 'config.plist');

  // STRATEGY: Copy Local "Golden" Template to USB
  // We expect templates to be in electron/templates/ relative to main.js
  const localTemplatePath = path.join(__dirname, 'templates', `config-${cpuType}.plist`);

  console.log(`[Config] Looking for local template: ${localTemplatePath}`);

  if (!fs.existsSync(localTemplatePath)) {
    throw new Error(`Local template not found at ${localTemplatePath}. Build error?`);
  }

  // Copy template to USB (Overwrite existing)
  try {
    fs.copyFileSync(localTemplatePath, destConfig);
    console.log(`[Config] Deployed Golden Template (${cpuType}) to USB: ${destConfig}`);
  } catch (copyErr) {
    throw new Error(`Failed to copy template to USB: ${copyErr.message}`);
  }

  // Helper: Safe Read (Now reading the file we just copied)
  let content = '';
  try {
    content = fs.readFileSync(destConfig, 'utf8');
  } catch (err) {
    if (process.platform === 'win32') {
      // Fallback logic for Windows locking issues...
      // (Keep existing Windows logic if needed, but for now standard read usually works after copy)
      console.warn(`[Config] Read failed, trying retry...`);
      // ... (simplified for this context, assume copy worked)
      throw err;
    } else {
      throw err;
    }
  }

  // Helper: Patch content string (Applied to all config files)
  const patchContent = (fileContent) => {
    let patched = fileContent;

    const replaceStringValue = (key, value) => {
      const regex = new RegExp(`(<key>${key}<\\/key>\\s*<string>)(.*?)(<\\/string>)`, 'g');
      patched = patched.replace(regex, `$1${value}$3`);
    };

    // Helper to set Integer values
    const setInteger = (key, val) => {
      const regex = new RegExp(`(<key>${key}<\\/key>\\s*<integer>)(.*?)(<\\/integer>)`, 'g');
      patched = patched.replace(regex, `$1${val}$3`);
    };

    // Helper to toggle properties/quirks
    const toggleBool = (key, enabled) => {
      const regex = new RegExp(`(<key>${key}<\\/key>\\s*)<(true|false)\\/>`, 'g');
      if (regex.test(patched)) {
        const newVal = enabled ? '<true/>' : '<false/>';
        patched = patched.replace(regex, `$1${newVal}`);
      }
    };

    // SMBIOS Injection
    if (smbios) {
      if (smbios.serial) replaceStringValue('SystemSerialNumber', smbios.serial);
      if (smbios.mlb) replaceStringValue('MLB', smbios.mlb);
      if (smbios.uuid) replaceStringValue('SystemUUID', smbios.uuid);
    }

    // Force Model to MacBookAir9,1 (Requested by user)
    replaceStringValue('SystemProductName', 'MacBookAir9,1');

    // [Fix] Force Security Settings for Robust Booting (Fixes "LoadImage Failed - Unsupported")
    replaceStringValue('SecureBootModel', 'Disabled');
    replaceStringValue('DmgLoading', 'Any');
    setInteger('ScanPolicy', 0); // Allow scanning everything

    // Boot Args
    const bootArgsRegex = /(<key>boot-args<\/key>\s*<string>)(.*?)(<\/string>)/s;
    const match = patched.match(bootArgsRegex);
    if (match) {
      let currentArgs = match[2];
      let newArgs = currentArgs;
      if (!newArgs.includes('debug=0x100')) newArgs += ' debug=0x100';
      if (!newArgs.includes('keepsyms=1')) newArgs += ' keepsyms=1';
      if (!newArgs.includes('-v')) newArgs += ' -v';
      newArgs = newArgs.replace(/\s+/g, ' ').trim();
      if (newArgs !== currentArgs) {
        patched = patched.replace(bootArgsRegex, `$1${newArgs}$3`);
      }
    }

    // Kext Toggling Helper (for generic kexts)
    const toggleKext = (kextName, shouldEnable) => {
      const regex = new RegExp(`(<string>${kextName}<\\/string>[\\s\\S]{0,500}?<key>Enabled<\\/key>\\s*)<.*?\\/>`, 'g');
      if (regex.test(patched)) {
        const newVal = shouldEnable ? '<true/>' : '<false/>';
        patched = patched.replace(regex, `$1${newVal}`);
      }
    };

    // Toggle AirportItlwm based on version
    if (macosVersion) {
      // Disable all first
      toggleKext('AirportItlwm-Catalina.kext', false);
      toggleKext('AirportItlwm-BigSur.kext', false);
      toggleKext('AirportItlwm-Monterey.kext', false);
      toggleKext('AirportItlwm-Ventura.kext', false);
      toggleKext('AirportItlwm-Sonoma.kext', false);
      toggleKext('AirportItlwm-Sonoma144.kext', false);

      // Enable specific
      if (macosVersion.startsWith('Catalina') || macosVersion.startsWith('10.15')) toggleKext('AirportItlwm-Catalina.kext', true);
      else if (macosVersion.startsWith('Big Sur') || macosVersion.startsWith('11.')) toggleKext('AirportItlwm-BigSur.kext', true);
      else if (macosVersion.startsWith('Monterey') || macosVersion.startsWith('12.')) toggleKext('AirportItlwm-Monterey.kext', true);
      else if (macosVersion.startsWith('Ventura') || macosVersion.startsWith('13.')) toggleKext('AirportItlwm-Ventura.kext', true);
      else if (macosVersion.startsWith('Sonoma') || macosVersion.startsWith('14.')) {
        toggleKext('AirportItlwm-Sonoma144.kext', true);
      }
      else if (macosVersion.startsWith('Sequoia') || macosVersion.startsWith('15.')) {
        toggleKext('AirportItlwm-Sonoma144.kext', true);
      }
    }

    // Enforce Critical Quirks (Surface Pro 7)
    toggleBool('AppleXcpmCfgLock', true);
    toggleBool('AppleCpuPmCfgLock', false);
    toggleBool('DisableIoMapper', true);
    toggleBool('DevirtualiseMmio', true);
    toggleBool('SetupVirtualMap', true);
    toggleBool('ProtectUefiServices', true);
    toggleBool('ProvideCustomSlide', true);
    setInteger('ProvideMaxSlide', 0);
    toggleBool('ReleaseUsbOwnership', false);
    toggleBool('RebuildAppleMemoryMap', true);
    toggleBool('SyncRuntimePermissions', true);
    toggleBool('EnableWriteUnprotector', false);

    // Logging
    setInteger('Target', 67);
    setInteger('DisplayLevel', 2147483714);
    setInteger('DisplayDelay', 0);
    setInteger('ResizeAppleGpuBars', -1);

    return patched;
  };

  // CLEANUP: Remove unused config files to avoid confusion
  // We only want 'config.plist' (which we just created/copied)
  const filesToDelete = ['config-i5.plist', 'config-i7.plist', 'config.plist.bak', 'sample.plist'];
  console.log('[Config] Cleaning up unused config files on USB...');

  for (const f of filesToDelete) {
    const fPath = path.join(ocPath, f);
    if (fs.existsSync(fPath)) {
      try {
        fs.unlinkSync(fPath);
        console.log(`[Config] Deleted unused file: ${f}`);
      } catch (e) {
        console.warn(`[Config] Failed to delete ${f}: ${e.message}`);
      }
    }
  }

  // PATCH: Only patch the definitive config.plist
  console.log(`[Config] Patching authoritative file: ${destConfig}`);

  try {
    let raw = fs.readFileSync(destConfig, 'utf8');

    // Drivers Block Synchronization (Exact match to config_v2.plist)
    // User Request: ExFatDxe.efi MUST be first in the list.
    const driversBlock = `		<key>Drivers</key>
		<array>
			<dict>
				<key>Arguments</key>
				<string></string>
				<key>Comment</key>
				<string></string>
				<key>Enabled</key>
				<true/>
				<key>LoadEarly</key>
				<true/>
				<key>Path</key>
				<string>ExFatDxe.efi</string>
			</dict>
			<dict>
				<key>Arguments</key>
				<string></string>
				<key>Comment</key>
				<string></string>
				<key>Enabled</key>
				<true/>
				<key>LoadEarly</key>
				<true/>
				<key>Path</key>
				<string>HfsPlus.efi</string>
			</dict>
			<dict>
				<key>Arguments</key>
				<string></string>
				<key>Comment</key>
				<string></string>
				<key>Enabled</key>
				<true/>
				<key>LoadEarly</key>
				<false/>
				<key>Path</key>
				<string>OpenRuntime.efi</string>
			</dict>
			<dict>
				<key>Arguments</key>
				<string></string>
				<key>Comment</key>
				<string></string>
				<key>Enabled</key>
				<true/>
				<key>LoadEarly</key>
				<false/>
				<key>Path</key>
				<string>OpenCanopy.efi</string>
			</dict>
			<dict>
				<key>Arguments</key>
				<string></string>
				<key>Comment</key>
				<string></string>
				<key>Enabled</key>
				<true/>
				<key>LoadEarly</key>
				<false/>
				<key>Path</key>
				<string>ResetNvramEntry.efi</string>
			</dict>
			<dict>
				<key>Arguments</key>
				<string></string>
				<key>Comment</key>
				<string></string>
				<key>Enabled</key>
				<true/>
				<key>LoadEarly</key>
				<false/>
				<key>Path</key>
				<string>ToggleSipEntry.efi</string>
			</dict>
		</array>`;

    // Replace the entire Drivers array
    const driversRegex = /<key>Drivers<\/key>\s*<array>[\s\S]*?<\/array>/;
    if (driversRegex.test(raw)) {
      raw = raw.replace(driversRegex, driversBlock);
      console.log('[Config] Replaced Drivers section with sync version (HfsPlus, ExFatDxe, etc.)');
    } else {
      console.warn('[Config] Warning: Could not find Drivers section to replace.');
    }

    // Force HideAuxiliary to False (Match config_v2.plist)
    if (raw.includes('<key>HideAuxiliary</key>')) {
      raw = raw.replace(/(<key>HideAuxiliary<\/key>\s*)<true\/>/, '$1<false/>');
      console.log(`[Config] Set HideAuxiliary to False`);
    }

    const patched = patchContent(raw);
    fs.writeFileSync(destConfig, patched, 'utf8');
    console.log(`[Config] SUCCESS: Patched config.plist`);
  } catch (e) {
    console.error(`[Config] Failed to patch config.plist: ${e.message}`);
    throw e;
  }


  return { success: true };

});

// Downloads
ipcMain.handle('download-file', async (event, url, destPath) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { promisify } = require('util');
  const exec = promisify(require('child_process').exec);

  // 1. Download to temporary file first
  const tempFile = path.join(os.tmpdir(), `dl_${Date.now()}_${path.basename(destPath)}`);

  await downloadUrl(url, tempFile, (p) => {
    mainWindow?.webContents.send('download-progress', p);
  });

  // 2. Move/Copy to destination with fallback
  try {
    const parent = path.dirname(destPath);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

    fs.copyFileSync(tempFile, destPath);
    fs.unlinkSync(tempFile);
  } catch (err) {
    if (process.platform === 'win32') {
      console.warn(`[Download] Standard copy failed (${err.message}). Trying Robocopy...`);

      // Robocopy requires file to have same name source/dest
      const targetName = path.basename(destPath);
      const tempDir = path.dirname(tempFile);
      const srcDirWin = tempDir.replace(/\//g, '\\');
      const destDirWin = path.dirname(destPath).replace(/\//g, '\\');

      // Rename temp file to target name in temp dir
      const preparedTemp = path.join(tempDir, targetName);
      if (fs.existsSync(preparedTemp)) fs.unlinkSync(preparedTemp);
      fs.renameSync(tempFile, preparedTemp);

      try {
        // Try standard robocopy /MOV (moves file)
        const cmd = `robocopy "${srcDirWin}" "${destDirWin}" "${targetName}" /IS /IT /MOV /Nj /NJS /NDL /NC /NS /NP`;
        await exec(cmd).catch(e => { if (e.code > 7) throw e; });
      } catch (roboErr) {
        console.warn('[Download] Robocopy failed. Trying Elevated Robocopy...');
        // Elevated fallback
        const psCmd = `powershell -NoProfile -Command "Start-Process -FilePath 'robocopy' -ArgumentList '\\"${srcDirWin}\\" \\"${destDirWin}\\" \\"${targetName}\\" /IS /IT /MOV' -Verb RunAs -Wait"`;
        await exec(psCmd);
      }

      // Cleanup if robocopy didn't move it (e.g. copy instead)
      if (fs.existsSync(preparedTemp)) fs.unlinkSync(preparedTemp);

    } else {
      throw err;
    }
  }

  return destPath;
});
// Helper for internal downloads with custom headers
async function downloadUrl(url, destPath, onProgress, headers = {}) {
  const https = require('https');
  const http = require('http');
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const requestHeaders = {
      'User-Agent': 'SurfaceMac Wizard',
      ...headers
    };

    const request = protocol.get(url, { headers: requestHeaders }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath); // Remove partial file
        resolve(downloadUrl(response.headers.location, destPath, onProgress, headers));
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress) {
          onProgress({
            percent: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
            downloaded: downloadedSize,
            total: totalSize,
          });
        }
      });

      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    });
    request.on('error', (err) => { file.close(); fs.unlinkSync(destPath); reject(err); });
  });
}

// Helper: Download using Electron's session fetch (browser-like behavior)
async function downloadUrlNet(url, destPath, onProgress, headers = {}) {
  const { session } = require('electron');
  const fs = require('fs');

  console.log('[DownloadNet] Fetching:', url);

  const response = await session.defaultSession.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': headers['User-Agent'] || 'InternetRecovery/1.0',
      'Cookie': headers['Cookie'] || '',
      'Connection': headers['Connection'] || 'close'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
  let downloadedSize = 0;

  // Stream response to file
  const reader = response.body.getReader();
  const file = fs.createWriteStream(destPath);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      file.write(value);
      downloadedSize += value.length;

      if (onProgress) {
        onProgress({
          percent: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
          downloaded: downloadedSize,
          total: totalSize,
        });
      }
    }
    file.end();
    return destPath;
  } catch (err) {
    file.close();
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    throw err;
  }
}

// Apple Recovery Protocol Helpers
function generateId(length) {
  const chars = '0123456789ABCDEF';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// Fetch Recovery URL using Node.js http (handshake works with http)
// Download will use Electron net to bypass fingerprinting blocks
const fetchRecoveryUrlWithCookie = async (boardId, retries = 3) => {
  const http = require('http');

  const performRequest = () => new Promise((resolve, reject) => {
    // 1. Get Session
    const reqSession = http.request('http://osrecovery.apple.com/', {
      method: 'GET',
      headers: {
        'Host': 'osrecovery.apple.com',
        'User-Agent': 'InternetRecovery/1.0'
      }
    }, (res) => {
      if (!res.headers['set-cookie']) {
        reject(new Error('No session cookie received from Apple Recovery Server'));
        return;
      }
      const sessionCookie = res.headers['set-cookie'][0].split(';')[0];
      console.log('[Recovery] Got session:', sessionCookie.substring(0, 15) + '...');

      // 2. Request Details - Note: Comma after fg is required by Apple's parser
      const body = `cid=${generateId(16)}\nsn=${'00000000000000000'}\nbid=${boardId}\nk=${generateId(64)}\nfg=${generateId(64)},\nos=default\n`;

      const reqDetails = http.request('http://osrecovery.apple.com/InstallationPayload/RecoveryImage', {
        method: 'POST',
        headers: {
          'Host': 'osrecovery.apple.com',
          'User-Agent': 'InternetRecovery/1.0',
          'Cookie': sessionCookie,
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (resDetails) => {
        let data = '';
        resDetails.on('data', chunk => data += chunk);
        resDetails.on('end', () => {
          if (resDetails.statusCode !== 200) {
            console.warn(`[Recovery] Details Request failed with ${resDetails.statusCode}`);
            reject(new Error(`Recovery Details HTTP ${resDetails.statusCode} Body: ${data}`));
            return;
          }

          const info = {};
          data.split('\n').forEach(line => {
            const [key, value] = line.split(': ');
            if (key && value) info[key.trim()] = value.trim();
          });

          if (info['AU']) {
            // CRITICAL: Use AT (image session) for CDN auth, NOT the session cookie
            // macrecovery.py: Cookie': '='.join(['AssetToken', sess]) where sess = info[INFO_IMAGE_SESS]
            resolve({
              url: info['AU'],
              imageSess: info['AT'], // AT = AssetToken for CDN
              chunklistSess: info['CT'] // CT = ChunklistToken for CDN
            });
          } else {
            reject(new Error('No Image URL (AU) in recovery response'));
          }
        });
      });

      reqDetails.on('error', (err) => {
        console.warn(`[Recovery] Details request error: ${err.message}`);
        reject(err);
      });

      reqDetails.write(body);
      reqDetails.end();
    });

    reqSession.on('error', (err) => {
      console.warn(`[Recovery] Session request error: ${err.message}`);
      reject(err);
    });

    reqSession.end();
  });

  // Retry Loop
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) console.log(`[Recovery] Retry attempt ${i + 1}/${retries}...`);
      return await performRequest();
    } catch (err) {
      lastError = err;
      console.warn(`[Recovery] Attempt ${i + 1} failed: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
};


// Services
// Services
const downloadService = require('./services/downloadService');
const recoveryService = require('./services/recoveryService');
const gibMacOSService = require('./services/gibMacOSService');

// ... existing code ...

// GibMacOS Handlers
ipcMain.handle('get-catalog', async (_, type) => {
  try {
    const catalog = await gibMacOSService.fetchCatalog(type || 'publicseed'); // Seed catalog often has more full installers
    const products = await gibMacOSService.getAvailableInstallers(catalog);
    return products;
  } catch (e) {
    console.error('Failed to get catalog:', e);
    throw e;
  }
});
ipcMain.handle('download-recovery', async (event, version, targetVolumePath) => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');

  // Provide defaults
  const macosVersion = (typeof version === 'string' ? version : 'sonoma');
  const targetVolume = (typeof targetVolumePath === 'string' ? targetVolumePath : '/Volumes/Install macOS');

  console.log(`[Recovery] Starting for ${macosVersion}, target: ${targetVolume}`);

  // Cache directory setup
  const cacheDir = path.join(os.homedir(), 'Downloads', 'SurfaceMac_Recovery', macosVersion);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const baseSystemCache = path.join(cacheDir, 'BaseSystem.dmg');
  const chunklistCache = path.join(cacheDir, 'BaseSystem.chunklist');

  const hasCache = fs.existsSync(baseSystemCache) && fs.statSync(baseSystemCache).size > 0 &&
    fs.existsSync(chunklistCache) && fs.statSync(chunklistCache).size > 0;

  const onProgress = (progress) => event.sender.send('download-progress', { ...progress, id: 'recovery' });

  // FORCE Re-download if size is suspicious (e.g. < 600MB for Sonoma)
  if (hasCache) {
    const size = fs.statSync(baseSystemCache).size;
    console.log(`[Recovery] Cache check: ${size} bytes`);
    if (size < 600 * 1024 * 1024) { // 600MB
      console.warn('[Recovery] Cached file seems too small (Catalina?). Deleting to force re-download.');
      fs.unlinkSync(baseSystemCache);
      if (fs.existsSync(chunklistCache)) fs.unlinkSync(chunklistCache);
    } else {
      console.log(`[Recovery] Found valid cached files in ${cacheDir}. Skipping download.`);
      onProgress({ percent: 100, downloaded: 0, total: 0 });
      // Proceed to copy...
      const recoveryDir = path.join(targetVolume, 'com.apple.recovery.boot');

      if (!fs.existsSync(targetVolume)) throw new Error(`Target volume ${targetVolume} not found. Ensure USB is formatted.`);
      if (!fs.existsSync(recoveryDir)) fs.mkdirSync(recoveryDir, { recursive: true });

      console.log(`[Recovery] Copying files from cache to USB (${targetVolume})...`);
      await fs.promises.copyFile(baseSystemCache, path.join(recoveryDir, 'BaseSystem.dmg'));
      await fs.promises.copyFile(chunklistCache, path.join(recoveryDir, 'BaseSystem.chunklist'));

      return { success: true };
    }
  }

  // Board IDs for authenticated fetch
  const BOARD_IDS = {
    'sonoma': 'Mac-827FAC58A8FDFA22',
    'sequoia': 'Mac-7BA5B2D9E42DDD94', // Using Sonoma ID if this fails? Or the one from MacRecoveryX
    'ventura': 'Mac-B4831CEBD52A0C4C',
    'monterey': 'Mac-E43C1C25D4880AD6'
  };

  const boardId = BOARD_IDS[macosVersion] || BOARD_IDS['sonoma'];
  console.log(`[Recovery] Fetching authenticated URL for ${macosVersion} (Board ID: ${boardId})...`);

  try {
    const { url: baseSystemUrl, imageSess, chunklistSess } = await fetchRecoveryUrlWithCookie(boardId);
    const chunklistUrl = baseSystemUrl.replace('BaseSystem.dmg', 'BaseSystem.chunklist');

    // Cookie format: AssetToken=<AT_value> (NOT session cookie!)
    // This is the image session token from Apple's response
    const imageHeaders = {
      'Cookie': `AssetToken=${imageSess}`,
      'User-Agent': 'InternetRecovery/1.0',
      'Connection': 'close'
    };

    const chunklistHeaders = {
      'Cookie': `AssetToken=${chunklistSess}`,
      'User-Agent': 'InternetRecovery/1.0',
      'Connection': 'close'
    };

    console.log(`[Recovery] Got URL: ${baseSystemUrl}`);
    console.log(`[Recovery] Got imageSess: ${imageSess ? imageSess.substring(0, 20) + '...' : 'NULL'}`);
    console.log(`[Recovery] Downloading BaseSystem.dmg to cache...`);
    await downloadUrlNet(baseSystemUrl, baseSystemCache, onProgress, imageHeaders);

    console.log(`[Recovery] Downloading BaseSystem.chunklist to cache...`);
    // Chunklist uses CT token
    await downloadUrlNet(chunklistUrl, chunklistCache, null, chunklistHeaders);

    // Copy to USB
    const recoveryDir = path.join(targetVolume, 'com.apple.recovery.boot');

    if (!fs.existsSync(targetVolume)) throw new Error(`Target volume ${targetVolume} not found.`);
    if (!fs.existsSync(recoveryDir)) fs.mkdirSync(recoveryDir, { recursive: true });

    console.log(`[Recovery] Copying files from cache to USB (${targetVolume})...`);
    await fs.promises.copyFile(baseSystemCache, path.join(recoveryDir, 'BaseSystem.dmg'));
    await fs.promises.copyFile(chunklistCache, path.join(recoveryDir, 'BaseSystem.chunklist'));

    return { success: true };

  } catch (err) {
    console.error(`[Recovery] Method failed: ${err.message}`);
    throw err;
  }
});



// ========== Full Installer Download ==========
// Downloads InstallAssistant.pkg (~13GB) from Apple's software catalog
// This is the same method used by gibMacOS

// Download full installer handler using gibMacOS Service
ipcMain.handle('download-full-installer', async (event, macosVersion) => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');

  const onProgress = (progress) => event.sender.send('download-progress', { ...progress, id: 'full-installer' });

  console.log(`[FullInstaller] Starting download for ${macosVersion}...`);

  try {
    // 1. Fetch Catalog via Service
    console.log('[FullInstaller] Fetching Apple software catalog (gibMacOS)...');
    const catalog = await gibMacOSService.fetchCatalog('publicseed'); // Use seed for best availability
    const products = await gibMacOSService.getAvailableInstallers(catalog);

    // 2. Find best match
    // Map 'sonoma' -> 14.x, 'sequoia' -> 15.x
    const targetMajor = macosVersion === 'sequoia' ? 15 : 14;

    // Find latest build matching target major version
    const installer = products.find(p => p.type === 'installassistant' &&
      (p.version.startsWith(`${targetMajor}.`) || p.title.toLowerCase().includes(macosVersion)));

    if (!installer) {
      throw new Error(`No Full Installer found for ${macosVersion} (Target: ${targetMajor}.x). Available: ${products.map(p => p.version).slice(0, 5).join(', ')}...`);
    }

    console.log(`[FullInstaller] Selected: ${installer.title} (${installer.version}) - ${installer.id}`);

    // InstallAssistant.pkg is usually the first package or specifically named
    const pkgUrl = installer.packages[0].url; // Usually only 1 package for InstallAssistant products in gibMacOS filter

    // Cache directory
    const cacheDir = path.join(os.homedir(), 'Downloads', 'SurfaceMac_Installer', macosVersion);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const installerPath = path.join(cacheDir, 'InstallAssistant.pkg');

    // 3. Download
    // Check if exists
    if (fs.existsSync(installerPath)) {
      const size = fs.statSync(installerPath).size;
      if (size > 10 * 1024 * 1024 * 1024) { // >10GB
        console.log(`[FullInstaller] Using valid cache: ${installerPath}`);
        onProgress({ percent: 100, downloaded: size, total: size });
      } else {
        console.log('[FullInstaller] Cache too small, re-downloading...');
        fs.unlinkSync(installerPath);
        await downloadService.download({
          id: 'full-installer',
          url: pkgUrl,
          destPath: installerPath,
          onProgress
        });
      }
    } else {
      await downloadService.download({
        id: 'full-installer',
        url: pkgUrl,
        destPath: installerPath,
        onProgress
      });
    }

    // 3b. NEW: HYBRID DOWNLOAD - Fetch Clean BaseSystem.dmg from Apple
    // We do this to guarantee a valid ~700MB recovery image, avoiding the RamDisk/Patch issues in the PKG
    console.log('[FullInstaller] Initiating Hybrid Strategy: Downloading verified Recovery Image...');
    onProgress({ percent: 0, downloaded: 0, total: 0, status: 'Fetching Recovery Image...' });

    // Board IDs for authenticated fetch (Same as recovery handler)
    const BOARD_IDS = {
      'sonoma': 'Mac-827FAC58A8FDFA22',
      'sequoia': 'Mac-7BA5B2D9E42DDD94',
      'ventura': 'Mac-B4831CEBD52A0C4C',
      'monterey': 'Mac-E43C1C25D4880AD6'
    };
    const boardId = BOARD_IDS[macosVersion] || BOARD_IDS['sonoma'];

    // Separate Cache for Recovery Files to avoid overwriting extracted ones
    const recoveryCacheDir = path.join(os.homedir(), 'Downloads', 'SurfaceMac_Recovery_Hybrid', macosVersion);
    if (!fs.existsSync(recoveryCacheDir)) fs.mkdirSync(recoveryCacheDir, { recursive: true });

    const bsCache = path.join(recoveryCacheDir, 'BaseSystem.dmg');
    const clCache = path.join(recoveryCacheDir, 'BaseSystem.chunklist');

    // Check if already exists valid
    let needRecoveryDl = true;
    if (fs.existsSync(bsCache) && fs.statSync(bsCache).size > 600 * 1024 * 1024) {
      console.log('[FullInstaller] Using valid cached Recovery Image.');
      needRecoveryDl = false;
    }

    if (needRecoveryDl) {
      try {
        const { url: baseSystemUrl, imageSess, chunklistSess } = await fetchRecoveryUrlWithCookie(boardId);
        const chunklistUrl = baseSystemUrl.replace('BaseSystem.dmg', 'BaseSystem.chunklist');
        const imgHeaders = { 'Cookie': `AssetToken=${imageSess}`, 'User-Agent': 'InternetRecovery/1.0', 'Connection': 'close' };
        const clHeaders = { 'Cookie': `AssetToken=${chunklistSess}`, 'User-Agent': 'InternetRecovery/1.0', 'Connection': 'close' };

        console.log(`[FullInstaller] Downloading BaseSystem.dmg (~700MB) from Apple...`);
        await downloadUrlNet(baseSystemUrl, bsCache, (p) => {
          // Scale progress visually for user (just show activity)
          onProgress({ ...p, status: 'Downloading Recovery Image...' });
        }, imgHeaders);

        console.log(`[FullInstaller] Downloading Chunklist...`);
        await downloadUrlNet(chunklistUrl, clCache, null, clHeaders);
      } catch (recErr) {
        console.warn('[FullInstaller] Warning: Failed to download hybrid recovery image. Will fall back to PKG extraction.', recErr);
        // We don't throw here, we let the extraction step handle fallback.
      }
    }

    // 4. Extract (requested by user for Windows usage)
    console.log('[FullInstaller] Extracting PKG to find .app...');
    onProgress({ percent: 100, downloaded: 0, total: 0, status: 'Extracting...' }); // Update UI status if possible

    const extractDir = path.join(cacheDir, 'Extracted');
    try {
      await downloadService.extractPkg(installerPath, extractDir);
      console.log(`[FullInstaller] Extracted to: ${extractDir}`);

      // Find the .app path
      // On macOS extraction yields the files directly or in a Payload folder?
      // pkgutil --expand-full structure:
      // ext/Install macOS Sonoma.app/...
      // On Windows 7z structure:
      // ext/Payload/Payload~ (cpio)/...

      return { success: true, installerPath, extractedPath: extractDir };
    } catch (e) {
      console.warn(`[FullInstaller] Extraction warning: ${e.message}. Returning PKG path only.`);
      return { success: true, installerPath };
    }

  } catch (err) {
    console.error(`[FullInstaller] Error: ${err.message}`);
    throw err;
  }
});

// NOTE: extract-basesystem-from-pkg has been REMOVED.
// We now use the Hybrid approach: BaseSystem.dmg is downloaded directly from Apple's
// Recovery servers during download-full-installer, stored in ~/Downloads/SurfaceMac_Recovery_Hybrid/
// UsbStep.tsx uses these pre-downloaded files instead of extracting from the PKG.
ipcMain.handle('copy-recovery-to-usb', async (event, { baseSystemPath, baseChunklistPath, usbVolumePath }) => {
  const path = require('path');
  const fs = require('fs');

  const onStatus = (msg) => event.sender.send('format-status', msg);

  // Target: FAT32 "BOOT" partition
  // Passed as usbVolumePath from the format result (which is actually bootVolumePath now)
  // But wait, UsbStep passes formatResult.volumePath for recovery?
  // We need to be careful. Let's assume the caller passes the path to the BOOT partition.
  // We will force check if "BOOT" is in the name, otherwise warn.

  const targetVolume = usbVolumePath;
  console.log(`[CopyRecovery] Copying to ${targetVolume} (BOOT Partition)`);

  try {
    const recoveryDir = path.join(targetVolume, 'com.apple.recovery.boot');
    if (!fs.existsSync(recoveryDir)) {
      console.log(`[CopyRecovery] Creating ${recoveryDir}...`);
      fs.mkdirSync(recoveryDir, { recursive: true });
    }

    // Helper to copy with PROGRESS updates (Stream based)
    const copyFileWithProgress = (src, dest, name) => {
      return new Promise((resolve, reject) => {
        if (!src || !fs.existsSync(src)) {
          console.warn(`[CopyRecovery] Skipped ${name} (not found)`);
          resolve();
          return;
        }

        const stat = fs.statSync(src);
        const totalBytes = stat.size;
        let copiedBytes = 0;
        let lastUpdate = 0;

        const reader = fs.createReadStream(src);
        const writer = fs.createWriteStream(dest);

        reader.on('error', (err) => reject(err));
        writer.on('error', (err) => reject(err));

        writer.on('finish', () => {
          console.log(`[CopyRecovery] Finished copying ${name}`);
          resolve();
        });

        reader.on('data', (chunk) => {
          copiedBytes += chunk.length;
          const now = Date.now();
          // Update UI every ~500ms or on completion
          if (now - lastUpdate > 500 || copiedBytes === totalBytes) {
            const percent = ((copiedBytes / totalBytes) * 100).toFixed(1);
            const copiedGB = (copiedBytes / 1024 / 1024 / 1024).toFixed(2);
            const totalGB = (totalBytes / 1024 / 1024 / 1024).toFixed(2);
            onStatus(`Copying ${name}... ${copiedGB} GB / ${totalGB} GB (${percent}%)`);
            lastUpdate = now;
          }
        });

        reader.pipe(writer);
      });
    };

    // 1. Copy BaseSystem.dmg (Show Progress)
    if (!baseSystemPath || !fs.existsSync(baseSystemPath)) {
      throw new Error('BaseSystem.dmg not found');
    }
    await copyFileWithProgress(baseSystemPath, path.join(recoveryDir, 'BaseSystem.dmg'), 'BaseSystem.dmg');

    // 2. Copy BaseSystem.chunklist (Small file, just copy)
    if (baseChunklistPath && fs.existsSync(baseChunklistPath)) {
      onStatus('Copying BaseSystem.chunklist...');
      await fs.promises.copyFile(baseChunklistPath, path.join(recoveryDir, 'BaseSystem.chunklist'));
    }

    // 3. (REMOVED) Copy SharedSupport.dmg (Moved to copy-app-to-usb to avoid ENOSPC on BOOT)
    // const sharedSupportPath = ...

    onStatus('Recovery files copied successfully!');
    return { success: true, recoveryDir };

  } catch (err) {
    console.error(`[CopyRecovery] Error: ${err.message}`);
    throw err;
  }
});

// Extract full key macOS App from PKG (Windows)
ipcMain.handle('extract-app-from-pkg', async (event, pkgPath) => {
  const path = require('path');
  const fs = require('fs');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const onStatus = (msg) => event.sender.send('format-status', msg);

  if (process.platform === 'darwin') {
    // macOS Implementation (pkgutil)
    console.log('[ExtractApp] Checking logic for macOS (pkgutil)...');

    const extractDir = path.join(path.dirname(pkgPath), 'extracted_pkg_macos');

    // Check if already extracted (optimization)
    if (fs.existsSync(extractDir)) {
      const findAppRecursive = (dir, depth = 0) => {
        if (depth > 4) return null;
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            const fullPath = path.join(dir, f);
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
              if (f.endsWith('.app')) return fullPath;
              const found = findAppRecursive(fullPath, depth + 1);
              if (found) return found;
            }
          }
        } catch (e) { }
        return null;
      };

      const appPath = findAppRecursive(extractDir);

      if (appPath) {
        console.log('[ExtractApp] Found existing extracted app, skipping re-expansion.');
        return { success: true, appPath: appPath };
      }
    }

    // Default: Extract
    onStatus('Expanding Installer Package (this takes a while, ~13GB)...');
    try {
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });

      await execAsync(`pkgutil --expand-full "${pkgPath}" "${extractDir}"`);

      // Helper directly inside to find app recursively
      const findAppRecursive = (dir, depth = 0) => {
        if (depth > 4) return null; // Don't go too deep
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            const fullPath = path.join(dir, f);
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
              if (f.endsWith('.app')) {
                return fullPath;
              }
              // Recurse
              const found = findAppRecursive(fullPath, depth + 1);
              if (found) return found;
            }
          }
        } catch (e) { }
        return null;
      };

      const appPath = findAppRecursive(extractDir);

      if (!appPath) {
        // Debug logging
        console.log('[ExtractApp] Structure dump:');
        const dump = fs.readdirSync(extractDir);
        console.log(dump);
        throw new Error(`Extraction successful but no "Install macOS*.app" found in ${extractDir}`);
      }

      console.log(`[ExtractApp] Found app at: ${appPath}`);
      return { success: true, appPath };
    } catch (e) {
      console.error('[ExtractApp] pkgutil failed:', e);
      throw e;
    }
  }

  // Windows Implementation (7-Zip)
  // Find 7-Zip (same logic as extract-basesystem)
  const sevenZipPaths = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'];
  let sevenZip = sevenZipPaths.find(p => fs.existsSync(p));

  if (!sevenZip) throw new Error('7-Zip not found (required to extract full app).');

  const extractRoot = path.join(path.dirname(pkgPath), 'ExtractedApp');
  if (!fs.existsSync(extractRoot)) fs.mkdirSync(extractRoot, { recursive: true });

  try {
    console.log(`[ExtractApp] Starting full extraction from ${pkgPath}...`);
    onStatus('Extracting full payload (this takes a while, ~13GB)...');

    // 7-Zip can usually recursively extract the App if we point it to the payload
    // But PKG structure varies. We try standard recursive extract of the App logic.
    // Command: 7z x "pkg" -o"out" "Install macOS*" -r -y
    // Using -r to find it nested

    const appNameGlob = "Install macOS*.app";
    const cmd = `"${sevenZip}" x "${pkgPath}" -o"${extractRoot}" "${appNameGlob}" -r -y`;

    // Execute (blocking, but we alerted user)
    await execAsync(cmd);

    // Verify result
    // Find the .app folder in extractRoot (might be nested)
    // We do a quick search provided it's not too deep
    // Helper to find .app
    const findApp = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        if (item.endsWith('.app') && fs.statSync(fullPath).isDirectory()) return fullPath;
        if (fs.statSync(fullPath).isDirectory()) {
          // Don't go too deep or into the app itself
          // But we might need to go into Payload folders?
          // 7z -r usually flattens or keeps structure.
          // If structure is kept: Install macOS Sonoma.app -> Contents...
          // Let's just check root of extractRoot first.
          const found = findApp(fullPath);
          if (found) return found;
        }
      }
      return null;
    };

    // Actually 7z might preserve path like Payload/Applications/Install App.app
    // Simple recursive search
    const findAppIterative = (startDir) => {
      // BFS or DFS to find .app
      let queue = [startDir];
      let counter = 0;
      while (queue.length > 0 && counter < 500) { // Limit depth/breadth
        const current = queue.shift();
        try {
          const files = fs.readdirSync(current);
          for (const f of files) {
            const fPath = path.join(current, f);
            if (f.endsWith('.app') && fs.statSync(fPath).isDirectory()) return fPath;
            if (fs.statSync(fPath).isDirectory()) queue.push(fPath);
          }
        } catch (e) { }
        counter++;
      }
      return null;
    }

    const appPath = findAppIterative(extractRoot);

    if (!appPath) {
      throw new Error('Extraction finished but "Install macOS*.app" was not found.');
    }

    console.log(`[ExtractApp] Found app at: ${appPath}`);
    return { success: true, appPath };

  } catch (err) {
    console.error(`[ExtractApp] Error: ${err.message}`);
    throw err;
  }
});

// Copy Full App to USB (Windows - Robocopy)
ipcMain.handle('copy-app-to-usb', async (event, { appPath, usbVolumePath, sharedSupportSource }) => {
  const path = require('path');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const appName = path.basename(appPath);
  const destPath = path.join(usbVolumePath, appName);
  const onStatus = (msg) => event.sender.send('format-status', msg);

  console.log(`[CopyApp] Copying from ${appPath} to ${destPath}`);

  // USB CACHE CHECK: Skip copy if app already exists on USB
  // Validate by checking for key directories (Contents/MacOS, Contents/Resources)
  const existingAppCheck = path.join(destPath, 'Contents', 'MacOS');
  const existingResourcesCheck = path.join(destPath, 'Contents', 'Resources');

  if (fs.existsSync(existingAppCheck) && fs.existsSync(existingResourcesCheck)) {
    console.log(`[CopyApp] App already exists on USB at ${destPath}. Skipping rsync/robocopy.`);
    onStatus('Install macOS.app already on USB, skipping copy...');

    // Still need to handle SharedSupport.dmg if provided and missing
    const existingSharedSupport = path.join(destPath, 'Contents', 'SharedSupport', 'SharedSupport.dmg');
    if (sharedSupportSource && fs.existsSync(sharedSupportSource) && !fs.existsSync(existingSharedSupport)) {
      console.log('[CopyApp] SharedSupport.dmg missing on USB, will copy it.');
      // Fall through to SharedSupport handling below
    } else {
      console.log('[CopyApp] SharedSupport.dmg also present (or not needed). Done.');
      return { success: true, skippedAppCopy: true };
    }
  } else {
    // Full copy needed
    if (process.platform === 'darwin') {
      // macOS Implementation (rsync)
      console.log('[CopyApp] Using rsync (macOS)');
      // -a: archive mode, -h: human readable, --info=progress2: total progress
      // Note: rsync needs dest to be the PARENT dir if we want to copy the folder itself,
      // OR we specify the full dest path if we copy contents.
      // Simplest: rsync -a "Source.app" "/Volumes/USB/" -> Creates Source.app in USB
      const cmd = `rsync -avh "${appPath}" "${usbVolumePath}/"`;
      try {
        await execAsync(cmd);
        // Fall through
      } catch (e) {
        console.error('[CopyApp] Rsync failed:', e);
        throw e;
      }
    } else {
      // Windows Implementation (Robocopy)
      console.log(`[CopyApp] Using Robocopy (Windows)`);
      const srcWin = appPath.replace(/\//g, '\\');
      const destWin = destPath.replace(/\//g, '\\');

      // Robocopy /J for unbuffered I/O (faster for large files), /E recursive
      const cmd = `robocopy "${srcWin}" "${destWin}" /E /J /IS /IT /NFL /NDL /NJH /NJS /NP`;

      try {
        await execAsync(cmd);

      } catch (e) {
        if (e.code > 7) throw e;
      }
    }
  }

  // Handle SharedSupport.dmg if provided (Cross-platform)
  if (sharedSupportSource && fs.existsSync(sharedSupportSource)) {
    console.log(`[CopyApp] Handling SharedSupport.dmg...`);
    // Target: usbVolumePath/Install macOS.app/Contents/SharedSupport/
    // destPath is .../Install macOS.app

    const sharedSupportDir = path.join(destPath, 'Contents', 'SharedSupport');
    if (!fs.existsSync(sharedSupportDir)) fs.mkdirSync(sharedSupportDir, { recursive: true });

    const destSharedSupport = path.join(sharedSupportDir, 'SharedSupport.dmg');
    console.log(`[CopyApp] Copying SharedSupport.dmg to ${destSharedSupport}`);

    // Use Robocopy for this file too (large file)
    // Robocopy needs directories
    const srcDir = path.dirname(sharedSupportSource).replace(/\//g, '\\');
    const dstDir = sharedSupportDir.replace(/\//g, '\\');
    const fileName = 'SharedSupport.dmg';

    if (process.platform === 'darwin') {
      // macOS: Use manual stream copy for PROGRESS updates
      await new Promise((resolve, reject) => {
        const src = sharedSupportSource;
        const dest = destSharedSupport;

        if (!src || !fs.existsSync(src)) { resolve(); return; }

        const stat = fs.statSync(src);
        const totalBytes = stat.size;
        let copiedBytes = 0;
        let lastUpdate = 0;

        const reader = fs.createReadStream(src);
        const writer = fs.createWriteStream(dest);

        reader.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);

        reader.on('data', (chunk) => {
          copiedBytes += chunk.length;
          const now = Date.now();
          if (now - lastUpdate > 500 || copiedBytes === totalBytes) {
            const percent = ((copiedBytes / totalBytes) * 100).toFixed(1);
            const copiedGB = (copiedBytes / 1024 / 1024 / 1024).toFixed(2);
            const totalGB = (totalBytes / 1024 / 1024 / 1024).toFixed(2);
            onStatus(`Copying SharedSupport.dmg... ${copiedGB} GB / ${totalGB} GB (${percent}%)`);
            lastUpdate = now;
          }
        });
        reader.pipe(writer);
      });
    } else {
      const roboCmd = `robocopy "${srcDir}" "${dstDir}" "${fileName}" /J /IS /IT /Nj /NJS /NDL /NC /NS /NP`;
      try {
        await execAsync(roboCmd);
      } catch (e) {
        if (e.code > 7) throw e;
      }
    }
    console.log('[CopyApp] SharedSupport.dmg copied successfully.');
  }

  return { success: true };
});
// This finds the Install macOS app and runs Apple's createinstallmedia tool
// NOTE: This is macOS-only functionality
ipcMain.handle('create-install-media', async (event, installerPkgPath, usbPath) => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const { exec, spawn } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const onStatus = (msg) => event.sender.send('format-status', msg);

  // Platform check - createinstallmedia is macOS-only
  if (process.platform !== 'darwin') {
    throw new Error(
      'Full Installer (createinstallmedia) is only supported on macOS.\n\n' +
      'On Windows, please use "Recovery Image" mode instead, which downloads a ~800MB recovery image that can boot and install macOS over the internet.'
    );
  }

  console.log(`[CreateInstallMedia] Starting USB creation...`);
  console.log(`[CreateInstallMedia] Proposed Installer: ${installerPkgPath}`);
  console.log(`[CreateInstallMedia] USB Target: ${usbPath}`);
  console.log(`[CreateInstallMedia] Path '${installerPkgPath}' exists? ${fs.existsSync(installerPkgPath)}`);

  try {
    let installApp = null;

    // Step 1: Check provided path first (from download service)
    if (installerPkgPath && fs.existsSync(installerPkgPath)) {
      console.log(`[CreateInstallMedia] Checking provided path: ${installerPkgPath}`);
      // Check if it IS the .app or contains it
      if (installerPkgPath.endsWith('.app')) {
        installApp = installerPkgPath;
      } else if (fs.statSync(installerPkgPath).isDirectory()) {
        // Search inside
        const contents = fs.readdirSync(installerPkgPath);
        console.log(`[CreateInstallMedia] Directory contents: ${contents.join(', ')}`);

        const subs = contents.filter(f => f.endsWith('.app') && f.startsWith('Install macOS'));
        if (subs.length > 0) {
          installApp = path.join(installerPkgPath, subs[0]);
        } else {
          // Deep search? maybe it's in Applications subdir?
          // Check 'Applications' or 'Payload/Applications'
          let foundAppDir = null;

          if (contents.includes('Applications')) {
            foundAppDir = path.join(installerPkgPath, 'Applications');
          } else if (contents.includes('Payload')) {
            const payloadDir = path.join(installerPkgPath, 'Payload');
            if (fs.existsSync(path.join(payloadDir, 'Applications'))) {
              foundAppDir = path.join(payloadDir, 'Applications');
            }
          }

          if (foundAppDir) {
            const deepSubs = fs.readdirSync(foundAppDir).filter(f => f.endsWith('.app') && f.startsWith('Install macOS'));
            if (deepSubs.length > 0) {
              installApp = path.join(foundAppDir, deepSubs[0]);
              console.log(`[CreateInstallMedia] Found in subdirectory: ${installApp}`);
            }
          }
        }
      }
    }

    if (installApp) {
      console.log(`[CreateInstallMedia] Using provided installer: ${installApp}`);
      onStatus(`Using local installer: ${path.basename(installApp)}`);
    } else {
      // Step 2: Fallback to /Applications
      onStatus('Looking for macOS installer in /Applications...');
      const appsDir = '/Applications';

      const appFiles = fs.readdirSync(appsDir)
        .filter(f => f.startsWith('Install macOS') && f.endsWith('.app'))
        .filter(f => {
          const createPath = path.join(appsDir, f, 'Contents', 'Resources', 'createinstallmedia');
          return fs.existsSync(createPath);
        })
        .map(f => ({ name: f, mtime: fs.statSync(path.join(appsDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);

      if (appFiles.length > 0) {
        installApp = path.join(appsDir, appFiles[0].name);
        console.log(`[CreateInstallMedia] Found /Applications installer: ${installApp}`);
        onStatus(`Using existing: ${appFiles[0].name}`);
      } else {
        // If we just downloaded it, maybe it is in Downloads?
        // But usually logic flow should have passed it.
        console.log('[CreateInstallMedia] No Install macOS app found');
        throw new Error(
          'No "Install macOS" app found. Download it first.'
        );
      }
    }

    // Detect if we should use Hybrid Mode (Extracted App) or Standard Mode (Official App)
    const isStandardApp = installApp.startsWith('/Applications');

    // Check if we are forced to use file-copy (e.g. on Windows or if Standard failed previously)
    if (!isStandardApp) {
      console.log('[CreateInstallMedia] Detected Extracted App. Using Hybrid (Windows-Compatible) Method.');
      onStatus('Refusing Apple tool. Using Hybrid Method (Recovery + Full Installer)...');

      // 1. Determine Version
      const version = installApp.toLowerCase().includes('sequoia') ? 'sequoia' : 'sonoma';

      // 2. Download Recovery (BaseSystem)
      const recoveryCacheDir = path.join(require('os').homedir(), 'Downloads', 'SurfaceMac_Recovery', version);

      onStatus(`Downloading Recovery Image for ${version}...`);

      // We need recoveryService here. Ensure it is imported or require it.
      // Assuming recoveryService is available in scope (declared at top).

      const recoveryFiles = await recoveryService.downloadRecovery({
        macosVersion: version,
        outputDir: recoveryCacheDir,
        onProgress: (p) => event.sender.send('download-progress', { ...p, id: 'recovery-hybrid' })
      });

      // 3. Prepare USB Structure
      // Ensure volume is mounted
      const targetVolume = usbPath.startsWith('/Volumes/') ? usbPath : `/Volumes/${usbPath}`;
      if (!fs.existsSync(targetVolume)) throw new Error(`Target volume not found at ${targetVolume}`);

      const bootDir = path.join(targetVolume, 'com.apple.recovery.boot');
      if (!fs.existsSync(bootDir)) fs.mkdirSync(bootDir, { recursive: true });

      // 4. Copy Recovery Files
      onStatus('Copying Recovery files to USB...');
      console.log(`[CreateInstallMedia] Copying BaseSystem to ${bootDir}`);
      fs.copyFileSync(recoveryFiles.baseSystemPath, path.join(bootDir, 'BaseSystem.dmg'));
      fs.copyFileSync(recoveryFiles.chunklistPath, path.join(bootDir, 'BaseSystem.chunklist'));

      // 5. Copy Full Installer App
      onStatus('Copying Full Installer to USB (this may take a while)...');
      console.log(`[CreateInstallMedia] Copying ${installApp} to ${targetVolume}`);

      const destAppPath = path.join(targetVolume, path.basename(installApp));

      // Using cp -R for speed and recursion (Mac/Linux)
      if (process.platform === 'darwin') {
        await execAsync(`cp -R "${installApp}" "${targetVolume}/"`);
      } else {
        // Fallback
        // Node 16.7.0+ has fs.cp
        if (fs.cp) {
          await fs.promises.cp(installApp, destAppPath, { recursive: true });
        } else {
          throw new Error('fs.cp not supported on this Node version');
        }
      }

      // 6. Success!
      console.log('[CreateInstallMedia] Hybrid creation complete.');
      return { success: true };

    } else {
      // STANDARD METHOD (Legacy / Official)
      // Verify createinstallmedia exists
      const createInstallMediaPath = path.join(installApp, 'Contents', 'Resources', 'createinstallmedia');
      if (!fs.existsSync(createInstallMediaPath)) {
        if (process.platform !== 'darwin') {
          throw new Error('Running createinstallmedia requires macOS. On Windows, please use the provided .app files manually.');
        }
        throw new Error(`createinstallmedia not found at ${createInstallMediaPath}. Image might be corrupted.`);
      }

      // Step 3: Run via external Terminal.app
      onStatus('Launching Terminal for USB creation...');
      console.log('[CreateInstallMedia] Launching external Terminal...');

      const volumePath = usbPath.startsWith('/Volumes/') ? usbPath : `/Volumes/${usbPath}`;
      const tempDir = require('os').tmpdir();
      const commandPath = path.join(tempDir, 'surfacemac_usb.command');
      const resultPath = path.join(tempDir, 'surfacemac_usb_result');

      // Cleanup previous result
      if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

      const scriptContent = `#!/bin/bash
clear
echo "=========================================="
echo "SurfaceMac USB Installer Creator"
echo "=========================================="
echo "Installer: ${path.basename(installApp)}"
echo "Target: ${volumePath}"
echo "=========================================="
echo ""
echo "Creating bootable USB. This requires Admin privileges."
echo "Please enter your password if prompted."
echo ""
sudo "${createInstallMediaPath}" --volume "${volumePath}" --nointeraction
EXIT_CODE=$?
echo $EXIT_CODE > "${resultPath}"

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! USB created successfully."
    echo "You can close this window now."
else
    echo ""
    echo "❌ FAILED! Error code: $EXIT_CODE"
    echo "Check the error message above."
fi
# Keep window open so user can see output
read -p "Press [Enter] to exit..."
exit $EXIT_CODE
`;

      fs.writeFileSync(commandPath, scriptContent, { mode: 0o755 });

      // Open the .command file - this launches Terminal.app
      await execAsync(`open "${commandPath}"`);

      onStatus('Please follow instructions in the opened Terminal window...');

      // Poll for result file
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (fs.existsSync(resultPath)) {
            clearInterval(checkInterval);
            const exitCode = parseInt(fs.readFileSync(resultPath, 'utf8').trim());
            // Cleanup
            try { fs.unlinkSync(commandPath); } catch (e) { }
            try { fs.unlinkSync(resultPath); } catch (e) { }

            if (exitCode === 0) {
              resolve({ success: true }); // Resolve with success object
            } else {
              reject(new Error(`Terminal script failed with exit code ${exitCode}. Check Terminal window for details.`));
            }
          }
        }, 1000);

        // Timeout after 45 minutes
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Timed out waiting for Terminal script to complete'));
        }, 45 * 60 * 1000);
      });
    }

  } catch (err) {
    console.error(`[CreateInstallMedia] Error: ${err.message}`);
    throw err;
  }
});

// Helper to fetch text content from a URL
async function fetchText(url) {
  const { session } = require('electron');
  const response = await session.defaultSession.fetch(url, {
    headers: {
      'User-Agent': 'SurfaceMac-Wizard/1.0',
      'Accept': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

// Helper to resolve latest release from GitHub
async function resolveLatestRelease(repoIdentifier) {
  const repo = repoIdentifier.replace('repo:', '');
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  try {
    const json = await fetchText(url);
    const release = JSON.parse(json);

    // Find asset: prefer .7z, then .zip
    const assets = release.assets || [];
    const asset = assets.find(a => a.name.endsWith('.7z')) || assets.find(a => a.name.endsWith('.zip'));

    if (!asset) throw new Error(`No .7z or .zip asset found in latest release of ${repo}`);
    return asset.browser_download_url;
  } catch (err) {
    throw new Error(`Failed to resolve latest release for ${repo}: ${err.message}`);
  }
}

// Download and Prepare EFI
ipcMain.handle('download-efi', async (event, url) => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const tmpDir = path.join(os.tmpdir(), 'surfacemac-efi');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  // Handle dynamic repo URL
  if (url.startsWith('repo:')) {
    console.log(`[EFI] Resolving latest release for ${url}...`);
    url = await resolveLatestRelease(url);
    console.log(`[EFI] Resolved to: ${url}`);
  }

  const is7z = url.toLowerCase().endsWith('.7z');
  const archiveName = is7z ? 'efi.7z' : 'efi.zip';
  const archivePath = path.join(tmpDir, archiveName);

  console.log(`[EFI] Downloading from ${url}...`);
  // Use curl for reliability
  await execAsync(`curl -L -o "${archivePath}" "${url}"`);

  console.log(`[EFI] Extracting ${archiveName}...`);
  if (is7z) {
    // macOS tar (bsdtar) supports 7z auto-detection
    await execAsync(`tar -xf "${archivePath}" -C "${tmpDir}"`);
  } else {
    await execAsync(`unzip -q "${archivePath}" -d "${tmpDir}"`);
  }

  // Debug output
  console.log('[EFI] Searching for EFI folder in:', tmpDir);
  try {
    const { stdout } = await execAsync(`find "${tmpDir}" -maxdepth 3`);
    console.log('[EFI] Extracted structure:', stdout);
  } catch (e) { /* ignore */ }

  // Find the EFI folder within the extracted content
  const findEFI = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Case-insensitive check
        if (entry.name.toUpperCase() === 'EFI') return fullPath;

        // Recurse, skipping hidden folders (like __MACOSX)
        if (!entry.name.startsWith('.')) {
          const found = findEFI(fullPath);
          if (found) return found;
        }
      }
    }
    return null;
  };

  const efiPath = findEFI(tmpDir);
  if (!efiPath) {
    throw new Error('No EFI folder found in the downloaded archive. Check logs for structure.');
  }

  console.log(`[EFI] Found EFI at ${efiPath}`);
  return efiPath;
});

// Config.plist operations
ipcMain.handle('read-config', async (_, configPath) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const plist = require('plist');
  const { promisify } = require('util');
  const exec = promisify(require('child_process').exec);

  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return plist.parse(content);
  } catch (err) {
    if (process.platform === 'win32') {
      try {
        const srcDir = path.dirname(configPath).replace(/\//g, '\\');
        const destDir = os.tmpdir().replace(/\//g, '\\');
        const fileName = path.basename(configPath);

        const cmd = `robocopy "${srcDir}" "${destDir}" "${fileName}" /IS /IT /Nj /NJS /NDL /NC /NS /NP`;
        await exec(cmd).catch(e => { if (e.code > 7) throw e; });

        const tempFile = path.join(os.tmpdir(), fileName);
        if (fs.existsSync(tempFile)) {
          const content = fs.readFileSync(tempFile, 'utf8');
          fs.unlinkSync(tempFile);
          return plist.parse(content);
        }

        // Try elevated fallback
        const psCmd = `powershell -NoProfile -Command "Start-Process -FilePath 'robocopy' -ArgumentList '\\"${srcDir}\\" \\"${destDir}\\" \\"${fileName}\\" /IS /IT' -Verb RunAs -Wait"`;
        await exec(psCmd);

        if (fs.existsSync(tempFile)) {
          const content = fs.readFileSync(tempFile, 'utf8');
          fs.unlinkSync(tempFile);
          return plist.parse(content);
        }
      } catch (e2) {
        console.error('[Config] Safe read failed:', e2);
      }
    }
    throw err;
  }
});

ipcMain.handle('write-config', async (_, configPath, config) => {
  const plist = require('plist');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');
  const { promisify } = require('util');
  const exec = promisify(require('child_process').exec);

  const content = plist.build(config);

  // Write to temporary file first
  const tempFile = path.join(os.tmpdir(), `cfg_${Date.now()}_config.plist`);
  fs.writeFileSync(tempFile, content, 'utf8');

  // Move to destination with fallback
  try {
    fs.copyFileSync(tempFile, configPath);
    fs.unlinkSync(tempFile);
  } catch (err) {
    if (process.platform === 'win32') {
      console.warn(`[Config] Standard write failed (${err.message}). Trying Robocopy...`);

      const targetName = path.basename(configPath);
      const tempDir = path.dirname(tempFile);
      const srcDirWin = tempDir.replace(/\//g, '\\');
      const destDirWin = path.dirname(configPath).replace(/\//g, '\\');

      // Rename temp file to target name
      const preparedTemp = path.join(tempDir, targetName);
      if (fs.existsSync(preparedTemp)) fs.unlinkSync(preparedTemp);
      fs.renameSync(tempFile, preparedTemp);

      try {
        // Robocopy /MOV
        const cmd = `robocopy "${srcDirWin}" "${destDirWin}" "${targetName}" /IS /IT /MOV /Nj /NJS /NDL /NC /NS /NP`;
        await exec(cmd).catch(e => { if (e.code > 7) throw e; });
      } catch (roboErr) {
        console.warn('[Config] Robocopy failed. Trying Elevated Robocopy...');
        const psCmd = `powershell -NoProfile -Command "Start-Process -FilePath 'robocopy' -ArgumentList '\\"${srcDirWin}\\" \\"${destDirWin}\\" \\"${targetName}\\" /IS /IT /MOV' -Verb RunAs -Wait"`;
        await exec(psCmd);
      }

      if (fs.existsSync(preparedTemp)) fs.unlinkSync(preparedTemp);
    } else {
      throw err;
    }
  }

  console.log(`[Config] Wrote config.plist to ${configPath}`);
  return { success: true };
});

// Helper to patch EFI with Drivers (ExFatDxe + HfsPlus)
ipcMain.handle('patch-efi-exfat', async (_, efiRootPath) => {
  const fs = require('fs');
  const path = require('path');
  const https = require('https');
  const { promisify } = require('util');
  const exec = promisify(require('child_process').exec);

  console.log(`[EFI Patch] Downloading Drivers to ${efiRootPath}`);

  // 1. Locate EFI/OC path
  let ocPath = path.join(efiRootPath, 'EFI', 'OC');
  if (!fs.existsSync(ocPath)) {
    ocPath = path.join(efiRootPath, 'OC');
  }
  if (!fs.existsSync(ocPath)) {
    if (fs.existsSync(path.join(efiRootPath, 'OpenCore'))) {
      ocPath = path.join(efiRootPath, 'OpenCore');
    } else {
      console.warn('[EFI Patch] Could not find OC folder. Skipping patch.');
      return { success: false, reason: 'OC folder not found' };
    }
  }

  const driversPath = path.join(ocPath, 'Drivers');
  if (!fs.existsSync(driversPath)) fs.mkdirSync(driversPath, { recursive: true });

  // 2. Download Drivers
  const drivers = [
    { name: 'ExFatDxe.efi', url: 'https://github.com/acidanthera/OcBinaryData/raw/master/Drivers/ExFatDxe.efi' },
    { name: 'HfsPlus.efi', url: 'https://github.com/acidanthera/OcBinaryData/raw/master/Drivers/HfsPlus.efi' }
  ];

  try {
    for (const driver of drivers) {
      const dest = path.join(driversPath, driver.name);
      console.log(`[EFI Patch] Downloading ${driver.name}...`);
      await downloadUrl(driver.url, dest, null);
    }
    console.log('[EFI Patch] Drivers downloaded successfully.');
  } catch (e) {
    console.error('[EFI Patch] Download failed:', e);
    return { success: false, error: e.message };
  }

  // 3. (REMOVED) Config.plist patching
  // We no longer patch config.plist here because inject-config handles it authoritatively.

  return { success: true };
});

// ========== EFI Operations ==========

// List all disks and their EFI partitions
ipcMain.handle('list-efi-partitions', async () => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const partitions = [];

  if (process.platform === 'darwin') {
    try {
      // Get list of all disks
      const { stdout } = await execAsync('diskutil list');
      const lines = stdout.split('\n');

      let currentDisk = null;

      for (const line of lines) {
        // Match disk header (e.g., /dev/disk0 (internal):)
        const diskMatch = line.match(/^\/dev\/(disk\d+)\s+\((\w+)/);
        if (diskMatch) {
          currentDisk = {
            id: diskMatch[1],
            type: diskMatch[2], // internal, external, etc.
          };
        }

        // Match EFI partition (e.g., 1: EFI EFI 209.7 MB disk0s1)
        const efiMatch = line.match(/\d+:\s+EFI\s+(\S+)?\s+[\d.]+\s+\w+\s+(disk\d+s\d+)/);
        if (efiMatch && currentDisk) {
          const partition = efiMatch[2];

          // Check if mounted
          let mountPoint = null;
          try {
            const { stdout: mountInfo } = await execAsync(`diskutil info ${partition}`);
            const mountMatch = mountInfo.match(/Mount Point:\s+(.+)/);
            if (mountMatch && mountMatch[1].trim() !== 'Not Mounted') {
              mountPoint = mountMatch[1].trim();
            }
          } catch (e) { }

          // Get disk info for name
          let diskName = 'Unknown';
          try {
            const { stdout: diskInfo } = await execAsync(`diskutil info /dev/${currentDisk.id}`);
            const nameMatch = diskInfo.match(/Device \/ Media Name:\s+(.+)/);
            if (nameMatch) diskName = nameMatch[1].trim();
          } catch (e) { }

          partitions.push({
            id: partition,
            diskId: currentDisk.id,
            diskType: currentDisk.type,
            diskName: diskName,
            label: efiMatch[1] || 'EFI',
            mounted: !!mountPoint,
            mountPoint: mountPoint,
          });
        }
      }
    } catch (error) {
      console.error('Failed to list EFI partitions:', error);
    }
  } else if (process.platform === 'win32') {
    try {
      // Get all partitions that are either EFI (System) or FAT32/Partition1 on Removable
      const psCommand = `
        powershell -NoProfile -Command "Get-Disk | ForEach-Object { 
            $disk = $_; 
            Get-Partition -DiskNumber $disk.Number | Where-Object { 
                ($_.GptType -eq '{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}') -or 
                ($disk.BusType -eq 'USB' -and $_.PartitionNumber -eq 1) 
            } | Select-Object -Property @{N='DiskId';E={$disk.Number}}, @{N='DiskModel';E={$disk.Model}}, @{N='PartitionId';E={'Partition' + $_.PartitionNumber}}, @{N='DriveLetter';E={$_.DriveLetter}}, @{N='BusType';E={$disk.BusType}}, @{N='Size';E={$_.Size}} 
        } | ConvertTo-Json -Compress"
      `;

      const { stdout } = await execAsync(psCommand);

      if (stdout && stdout.trim()) {
        const items = JSON.parse(stdout);
        const list = Array.isArray(items) ? items : [items];

        for (const item of list) {
          const driveLetter = item.DriveLetter ? String.fromCharCode(item.DriveLetter) + ':' : null;
          partitions.push({
            id: `PHYSICALDRIVE${item.DiskId}`, // Simplified ID tracking
            diskId: `Disk ${item.DiskId}`,
            diskType: item.BusType === 'USB' ? 'external' : 'internal',
            diskName: item.DiskModel,
            label: 'EFI',
            mounted: !!driveLetter,
            mountPoint: driveLetter
          });
        }
      }
    } catch (error) {
      console.error('[EFI] Failed to list partitions on Windows:', error);
    }
  }

  return partitions;
});



// Copy EFI folder from source to destination
ipcMain.handle('copy-efi', async (event, source, dest) => {
  const fs = require('fs');
  const path = require('path');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // Ensure destination EFI folder exists
  // Handle ambiguity where mount point is named "EFI" (e.g. /Volumes/EFI)
  let destEfiPath = dest;
  // If destination is a Volume root (e.g. /Volumes/EFI), we MUST append EFI to create /Volumes/EFI/EFI
  // (Standard EFI structure: Partition -> EFI folder -> BOOT/OC)
  const isVolumeRoot = path.dirname(dest) === '/Volumes';

  if (isVolumeRoot) {
    destEfiPath = path.join(dest, 'EFI');
  } else if (path.basename(dest).toUpperCase() !== 'EFI' && !dest.match(/[\\/]EFI[\\/]?$/i)) {
    destEfiPath = path.join(dest, 'EFI');
  }

  // Source path handling
  let sourceEfiPath = source;
  // If source doesn't end with EFI, maybe we need to append it?
  // But download-efi returns the EFI folder directly.
  // We only append if we are sure it's missing (e.g. user passed parent dir)
  if (path.basename(source).toUpperCase() !== 'EFI' && !source.match(/[\\/]EFI[\\/]?$/i)) {
    sourceEfiPath = path.join(source, 'EFI');
  }

  console.log(`[EFI] Copying from ${sourceEfiPath} to ${destEfiPath}`);

  // Helper for mkdir retry (Windows locking mitigation + Elevation)
  const mkdirRetry = async (dir) => {
    if (fs.existsSync(dir)) return;
    for (let i = 0; i < 5; i++) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        return;
      } catch (e) {
        if ((e.code === 'EPERM' || e.code === 'EACCES') && i < 4) {
          console.log(`[EFI] mkdir ${path.basename(dir)} locked, retrying (${i + 1}/5)...`);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          // If checking last attempt logic below, just continue or break
          if (i === 4) break;
          throw e;
        }
      }
    }

    // Final attempt with Elevation fallback for Windows
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (eFinal) {
      if (process.platform === 'win32' && (eFinal.code === 'EPERM' || eFinal.code === 'EACCES')) {
        console.warn(`[EFI] Node mkdir failed for ${dir}. Trying elevated Shell...`);
        try {
          // Use explicit backslashes for cmd
          const winDir = dir.replace(/\//g, '\\');
          const cmd = `powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c if not exist \\"${winDir}\\" mkdir \\"${winDir}\\"' -Verb RunAs -Wait"`;
          await execAsync(cmd);
          // Check success
          if (!fs.existsSync(dir)) throw eFinal;
        } catch (eElevated) {
          throw eFinal; // Throw original error if elevation failed or user said no
        }
      } else {
        throw eFinal;
      }
    }
  };

  // Cross-platform cleanup and preparation
  try {
    // Determine what to clean. 
    // If we are targeting a Volume root (isVolumeRoot), we must clean everything IN that volume (debris from previous runs).
    // If targeting a subfolder, just clean that subfolder.
    if (isVolumeRoot) {
      console.log(`[EFI] Cleaning volume root content at ${dest}`);
      // Fast cleanup using native shell command on macOS (rmSync is slow for thousands of files)
      if (process.platform === 'darwin') {
        try {
          // Safety check: ensure we are in /Volumes
          if (dest.startsWith('/Volumes/')) {
            // Delete all visible files/folders (ignoring dotfiles which are fine to keep or hard to glob)
            // Using specific rm -rf on the content to avoid unmounting/detaching
            // NOTE: We rely on shell glob expansion.
            // IMPORTANT: Exclude com.apple.recovery.boot which contains boot files for Hybrid installer
            const items = fs.readdirSync(dest).filter(i =>
              !i.startsWith('.') && i !== 'com.apple.recovery.boot'
            );
            for (const item of items) {
              await execAsync(`rm -rf "${path.join(dest, item)}"`);
            }
          }
        } catch (e) {
          console.warn(`[EFI] Fast clean failed, falling back: ${e.message}`);
        }
      }

      // Fallback / standard recursive clean for stubborn items or dotfiles we might have missed (and Windows)
      if (fs.existsSync(dest)) {
        const items = fs.readdirSync(dest);
        for (const item of items) {
          // Skip system hidden trash/spots and recovery boot folder
          if (item === '.Trashes' || item === '.Spotlight-V100' || item === '.fseventsd' || item === 'com.apple.recovery.boot') continue;
          const itemPath = path.join(dest, item);
          if (fs.existsSync(itemPath)) {
            try {
              fs.rmSync(itemPath, { recursive: true, force: true });
            } catch (e) { /* ignore */ }
          }
        }
      }
    } else {
      // Standard behavior: clean specific target folder
      if (fs.existsSync(destEfiPath)) {
        console.log(`[EFI] Cleaning existing EFI at ${destEfiPath}`);
        fs.rmSync(destEfiPath, { recursive: true, force: true });
      }
    }

    // Create fresh structure
    // We already calculated destEfiPath (e.g. .../EFI)
    // Ensure parent exists (should be the volume root which exists)
    if (!fs.existsSync(path.dirname(destEfiPath))) {
      await mkdirRetry(path.dirname(destEfiPath));
    }
    await mkdirRetry(destEfiPath);

  } catch (err) {
    console.error(`[EFI] Failed to prepare destination: ${err.message}`);
    throw err;
  }

  // Windows Optimization: Use Robocopy
  if (process.platform === 'win32') {
    console.log('[EFI] Using Robocopy for Windows...');
    try {
      // Robocopy syntax: robocopy source dest /E (recursive) /IS (include same) /IT (include tweaked) /NFL (no file list logging) /NDL (no dir logging)
      // Note: Robocopy returns weird exit codes (0-7 are success).
      // We use explicit backslashes.
      const srcWin = sourceEfiPath.replace(/\//g, '\\');
      const destWin = destEfiPath.replace(/\//g, '\\');

      // First try standard robocopy
      try {
        const cmd = `robocopy "${srcWin}" "${destWin}" /E /IS /IT /Nj /NJS /NDL /NC /NS /NP`;
        await execAsync(cmd).catch(err => {
          // Robocopy throws error if exit code != 0, but 1-7 are success/partial success.
          if (err.code && err.code <= 7) return; // Success
          throw err;
        });
      } catch (firstErr) {
        console.warn(`[EFI] Standard Robocopy failed (${firstErr.code}). Trying Elevated Robocopy...`);
        // Fallback to Elevated Robocopy
        const psCmd = `powershell -NoProfile -Command "Start-Process -FilePath 'robocopy' -ArgumentList '\\"${srcWin}\\" \\"${destWin}\\" /E /IS /IT' -Verb RunAs -Wait"`;
        await execAsync(psCmd);
      }

      console.log('[EFI] Robocopy complete');
      return { success: true };

    } catch (roboErr) {
      console.error('[EFI] Robocopy failed globally:', roboErr);
      throw roboErr;
    }
  }

  // macOS Optimization: Use rsync (Much faster for EFI / small files)
  if (process.platform === 'darwin') {
    console.log('[EFI] Using rsync for macOS...');
    try {
      const srcRsync = sourceEfiPath.endsWith('/') ? sourceEfiPath : `${sourceEfiPath}/`;
      const destRsync = destEfiPath.endsWith('/') ? destEfiPath : `${destEfiPath}/`;

      // Use spawn to capture output for progress bar
      const { spawn } = require('child_process');

      await new Promise((resolve, reject) => {
        // Use full path. 
        // We add --progress to FORCE output flushing (so the UI updates), 
        // but we verify the output to send only filenames (user preference).
        const rsync = spawn('/usr/bin/rsync', ['-av', '--progress', srcRsync, destRsync]);

        rsync.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            // Logic: If line contains '%' or 'xfer#' it is a progress stat. We skip it.
            // If it ends with '/', it's a directory (often boring), but we can show it or skip.
            // We want "EFI/OC/Config.plist" etc.

            if (trimmed && !trimmed.includes('%') && !trimmed.includes('xfer#') && !trimmed.includes('sending incremental')) {
              // Log sparingly to terminal to avoid spam (or commented out)
              // console.log(`[rsync] ${trimmed}`);

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('copy-progress', trimmed);
              }
            }
          }
        });

        rsync.stderr.on('data', (data) => {
          console.error(`[rsync] ${data}`);
        });

        rsync.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`rsync process exited with code ${code}`));
        });

        rsync.on('error', (err) => reject(err));
      });

      console.log('[EFI] Rsync complete');
      return { success: true };
    } catch (err) {
      console.warn(`[EFI] Rsync failed (${err.message}), falling back to standard copy...`);
    }
  }

  // Recursive copy with progress (MacOS / Linux fallback)
  const copyRecursiveAsync = async (src, dest) => {
    // ... existing logic ...
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          await fs.promises.mkdir(destPath);
        }
        await copyRecursiveAsync(srcPath, destPath);
      } else {
        // Emit progress
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('copy-progress', entry.name);
          }
        } catch (e) { /* ignore ipc error */ }

        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  };

  try {
    await copyRecursiveAsync(sourceEfiPath, destEfiPath);
    console.log('[EFI] Copy complete');
    return { success: true };
  } catch (error) {
    console.error('[EFI] Copy failed:', error);
    throw error;
  }
});

// Unmount entire disk (Safe Eject)
ipcMain.handle('unmount-disk', async (_, diskPath) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  console.log(`[USB] Ejecting ${diskPath}...`);

  try {
    if (process.platform === 'darwin') {
      // unmountDisk unmounts all volumes on the disk (EFI, INSTALL, etc.)
      await execAsync(`diskutil unmountDisk "${diskPath}"`);
    }
    return { success: true };
  } catch (error) {
    console.error('[USB] Eject failed:', error);
    throw new Error(`Failed to eject ${diskPath}: ${error.message}`);
  }
});

// Dialog operations
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// External links
ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
});

// ========== App Lifecycle ==========
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
