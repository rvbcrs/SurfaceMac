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
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

// ========== IPC Handlers ==========

// Platform info
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-app-version', () => app.getVersion());

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
    }

    // Windows fallback
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
      }

      console.log(`[USB] Formatting as ${fsType} with name "${volumeName}"...`);

      // 3. Format disk
      await execAsync(`diskutil eraseDisk ${fsType} "${volumeName}" "${diskPath}"`);

      setStatus('Formatting complete!');
      return { success: true, volumeName, volumePath: `/Volumes/${volumeName}` };
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

  // Normalize path (ensure no double /dev/)
  let cleanPath = diskPath;
  if (cleanPath.startsWith('/dev/')) cleanPath = cleanPath.substring(5);
  cleanPath = cleanPath.replace(/\/+/g, '/'); // remove double slashes
  const devPath = `/dev/${cleanPath}`;

  // If input is a whole disk (e.g. disk8), append 's1' for standard EFI
  // We check if it ends with s<digit>
  if (!/disk\d+s\d+/.test(cleanPath)) {
    cleanPath = `${cleanPath}s1`;
  }
  const partitionPath = `/dev/${cleanPath}`;

  console.log(`[EFI] Mounting ${partitionPath}...`);

  // Check if already mounted
  try {
    const { stdout } = await execAsync(`diskutil info "${partitionPath}"`);
    const mountMatch = stdout.match(/Mount Point:\s+(.+)/);
    if (mountMatch && mountMatch[1].trim() !== 'Not Mounted' && mountMatch[1].trim() !== '') {
      console.log(`[EFI] Already mounted at ${mountMatch[1]}`);
      return mountMatch[1].trim();
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
ipcMain.handle('inject-config', async (_, { cpuType, smbios, macosVersion, diskPath, verbose }) => {
  const fs = require('fs');
  const path = require('path');

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
    console.error(`[Config] Debugging EFI structure at ${mountPoint}:`);
    try {
      const rootFiles = fs.readdirSync(mountPoint);
      console.error(`[Config] /Volumes/EFI root:`, rootFiles);

      const efiPath = path.join(mountPoint, 'EFI');
      if (fs.existsSync(efiPath)) {
        console.error(`[Config] /Volumes/EFI/EFI:`, fs.readdirSync(efiPath));
        const innerOcPath = path.join(efiPath, 'OC');
        if (fs.existsSync(innerOcPath)) {
          console.error(`[Config] /Volumes/EFI/EFI/OC:`, fs.readdirSync(innerOcPath));
        }
      }
    } catch (e) {
      console.error(`[Config] Failed to list files: ${e.message}`);
    }

    throw new Error(`OpenCore directory not found at ${ocPath}. Is EFI structure correct? Check debug logs.`);
  }

  const sourceConfig = path.join(ocPath, `config-${cpuType}.plist`);
  const destConfig = path.join(ocPath, 'config.plist');

  if (!fs.existsSync(sourceConfig)) {
    throw new Error(`Source config ${sourceConfig} not found.`);
  }

  // Step 1: Read Source as String
  let content = fs.readFileSync(sourceConfig, 'utf8');

  // Helpers for Regex Replacement
  const replaceStringValue = (key, value) => {
    // Looks for <key>KeyName</key> followed by whitespace then <string>Value</string>
    const regex = new RegExp(`(<key>${key}<\\/key>\\s*<string>)(.*?)(<\\/string>)`, 'g');
    content = content.replace(regex, `$1${value}$3`);
  };

  // Step 2: Inject SMBIOS
  if (smbios.serial) replaceStringValue('SystemSerialNumber', smbios.serial);
  if (smbios.mlb) replaceStringValue('MLB', smbios.mlb);
  if (smbios.uuid) replaceStringValue('SystemUUID', smbios.uuid);

  // Force Model to MacBookAir9,1 (Requested by user)
  replaceStringValue('SystemProductName', 'MacBookAir9,1');

  console.log('[Config] Injected SMBIOS data via Regex');

  // Step 3: Handle Verbose Mode (boot-args)
  // Extract current boot-args
  const bootArgsRegex = /(<key>boot-args<\/key>\s*<string>)(.*?)(<\/string>)/;
  const match = content.match(bootArgsRegex);

  if (match) {
    let currentArgs = match[2];
    let newArgs = currentArgs;
    const hasVerbose = currentArgs.includes('-v');

    if (verbose && !hasVerbose) {
      newArgs = `${currentArgs} -v`;
    } else if (!verbose && hasVerbose) {
      newArgs = currentArgs.replace('-v', '').replace(/\s+/g, ' ').trim();
    }

    if (newArgs !== currentArgs) {
      content = content.replace(bootArgsRegex, `$1${newArgs}$3`);
      console.log(`[Config] Updated boot-args: ${newArgs}`);
    }
  }

  // Step 4: Handle Kexts (AirportItlwm vs itlwm)
  // We need to look for the BundlePath and then the Enabled key in the SAME dict.
  // This is tricky with regex but possible if the structure is consistent.
  // Pattern: <string>KextName.kext</string> ... <key>Enabled</key> ... <true/>/<false/>
  // Note: OpenCore dict order is usually BundlePath then Enabled, or close.
  // We'll use a broader match that captures the surrounding Dict context if possible, 
  // or just assume standard order from the repo (BundlePath is usually early).

  // Actually, safe way: Split by <dict>, find the one with the kext name, replace Enabled inside it, join back.

  // Simple split by <dict> is risky due to nesting. 
  // But Kernel.Add is a simpler list.
  // Let's rely on the unique kext name proximity.

  const toggleKext = (kextName, shouldEnable) => {
    // Find the block containing the kext name
    // This regex looks for the kext name, then scans ahead for "Enabled" key and its value tag
    // It assumes they are relatively close (within 500 chars) to avoid jumping to next dict.
    const regex = new RegExp(`(<string>${kextName}<\\/string>[\\s\\S]{0,500}?<key>Enabled<\\/key>\\s*)<.*?\\/>`, 'g');

    if (regex.test(content)) {
      const replacementTag = shouldEnable ? '<true/>' : '<false/>';
      content = content.replace(regex, `$1${replacementTag}`);
      console.log(`[Config] Set ${kextName} to ${shouldEnable}`);
    } else {
      console.warn(`[Config] Could not find/toggle kext: ${kextName} (Order might vary)`);
    }
  };

  toggleKext('AirportItlwm.kext', macosVersion === 'sonoma');
  toggleKext('itlwm.kext', macosVersion === 'sequoia');


  // Step 5: Enforce Critical Quirks for Surface Pro 7 (CFG Lock Fix)
  // Surface BIOS usually locks MSR 0xE2, causing the "wake-failure" / "BM:R" hang.
  // We MUST enable AppleXcpmCfgLock and AppleCpuPmCfgLock.

  const ensureQuirk = (quirkName, enabled) => {
    // Regex to find <key>QuirkName</key> followed by <true/> or <false/>
    // We capture the tag to replace it.
    const regex = new RegExp(`(<key>${quirkName}<\\/key>\\s*)<(true|false)\\/>`, 'g');
    if (regex.test(content)) {
      const newVal = enabled ? '<true/>' : '<false/>';
      content = content.replace(regex, `$1${newVal}`);
      console.log(`[Config] Enforced Quirk ${quirkName}: ${enabled}`);
    } else {
      console.warn(`[Config] Quirk ${quirkName} not found to enforce.`);
    }
  };

  ensureQuirk('AppleXcpmCfgLock', true);
  ensureQuirk('AppleCpuPmCfgLock', false); // Working config has false
  ensureQuirk('DisableIoMapper', true);   // Fixes Vt-d issues if stuck
  ensureQuirk('DevirtualiseMmio', true);  // Recommended for Ice Lake (SP7)
  ensureQuirk('SetupVirtualMap', true);   // Critical for memory mapping

  // Reveal Auxiliary Entries (Fixes missing "Recovery" entry)
  // HideAuxiliary -> False
  const regexAux = /(<key>HideAuxiliary<\/key>\s*)<(true|false)\/>/g;
  if (regexAux.test(content)) {
    content = content.replace(regexAux, `$1<false/>`);
    console.log('[Config] Set HideAuxiliary to false');
  } else {
    console.warn('[Config] HideAuxiliary key not found');
  }

  // Disable SecureBootModel to prevent LKC (Load Kernel Cache) hangs on Recovery
  // Pattern: <key>SecureBootModel</key> ... <string>Default</string> -> <string>Disabled</string>
  const disableSecureBoot = () => {
    const regex = /(<key>SecureBootModel<\/key>\s*<string>)(.*?)(<\/string>)/g;
    if (regex.test(content)) {
      content = content.replace(regex, `$1Disabled$3`);
      console.log('[Config] Disabled SecureBootModel');
    } else {
      console.warn('[Config] SecureBootModel key not found.');
    }
  };
  disableSecureBoot();

  // Step 7: Relax ScanPolicy and DmgLoading (Fixes Recovery Boot)
  // ScanPolicy 0 = Scan everything (HFS+, NTFS, APFS, etc)
  const setInteger = (key, val) => {
    const regex = new RegExp(`(<key>${key}<\\/key>\\s*<integer>)(.*?)(<\\/integer>)`, 'g');
    content = content.replace(regex, `$1${val}$3`);
  };

  setInteger('ScanPolicy', 0);

  // DmgLoading -> Any (Allow any DMG)
  const regexDmg = /(<key>DmgLoading<\/key>\s*<string>)(.*?)(<\/string>)/g;
  content = content.replace(regexDmg, `$1Any$3`);
  console.log('[Config] Set ScanPolicy to 0 and DmgLoading to Any');

  // Step 6: Write Result
  fs.writeFileSync(destConfig, content, 'utf8');
  console.log(`[Config] Wrote config.plist to ${destConfig}`);

  return { success: true };
});

// Downloads
ipcMain.handle('download-file', async (event, url, destPath) => {
  const https = require('https');
  const http = require('http');

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const request = protocol.get(url, { headers: { 'User-Agent': 'SurfaceMac Wizard' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        resolve(ipcMain.handle('download-file', event, response.headers.location, destPath));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        mainWindow?.webContents.send('download-progress', {
          percent: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
          downloaded: downloadedSize,
          total: totalSize,
        });
      });

      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    });

    request.on('error', (err) => { file.close(); fs.unlinkSync(destPath); reject(err); });
  });
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

// Create bootable USB using createinstallmedia
// This finds the Install macOS app and runs Apple's createinstallmedia tool
ipcMain.handle('create-install-media', async (event, installerPkgPath, usbPath) => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const { exec, spawn } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const onStatus = (msg) => event.sender.send('format-status', msg);

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
  const plist = require('plist');
  const content = fs.readFileSync(configPath, 'utf8');
  return plist.parse(content);
});

ipcMain.handle('write-config', async (_, configPath, config) => {
  const plist = require('plist');
  const content = plist.build(config);
  fs.writeFileSync(configPath, content, 'utf8');
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
  let destEfiPath;
  if (dest === '/Volumes/EFI' || dest === '/Volumes/EFI/') {
    destEfiPath = path.join(dest, 'EFI');
  } else {
    destEfiPath = dest.endsWith('/EFI') ? dest : (!dest.endsWith('/') ? `${dest}/EFI` : `${dest}EFI`);
  }

  const sourceEfiPath = source.endsWith('/EFI') ? source : (!source.endsWith('/') ? `${source}/EFI` : `${source}EFI`);

  console.log(`[EFI] Copying from ${sourceEfiPath} to ${destEfiPath}`);

  if (process.platform === 'darwin') {
    // Remove existing destination if it exists
    // CRITICAL: Ensure we are not deleting a mount point or root
    if (destEfiPath === '/Volumes/EFI') {
      // Double safety check
      destEfiPath = '/Volumes/EFI/EFI';
    }

    if (fs.existsSync(destEfiPath)) {
      console.log(`[EFI] Clearing old files at ${destEfiPath}`);

      // Strategy: specific macOS "Directory not empty" / "Operation not permitted" fix.
      // Instead of fighting locks with rm -rf, we MOVE the folder out of the way first.
      const trashPath = `${destEfiPath}_TRASH_${Date.now()}`;

      try {
        fs.renameSync(destEfiPath, trashPath);
        console.log(`[EFI] Moved old EFI to ${trashPath}`);

        // Best effort: try to delete the trash data found
        // We do this asynchronously/later or just try and ignore failure
        // so it doesn't block the user's "Update" process.
        execAsync(`rm -rf "${trashPath}"`).catch(err => {
          console.warn(`[EFI] Could not fully delete trash ${trashPath} (non-fatal):`, err.message);
        });

      } catch (renameError) {
        console.warn(`[EFI] Rename failed (${renameError.message}). Trying direct sudo delete...`);

        try {
          await execAsync(`rm -rf "${destEfiPath}"`);
        } catch (e) {
          console.warn(`[EFI] Standard rm failed (code ${e.code}). Attempting sudo...`);
          // Fallback to sudo via AppleScript if standard rm fails
          try {
            await execAsync(`osascript -e 'do shell script "rm -rf \\"${destEfiPath}\\"" with administrator privileges'`);
          } catch (sudoError) {
            console.error(`[EFI] Sudo rm failed: ${sudoError.message}`);
            // Final attempt: Proceed anyway? No, we might merge mess.
            // But if rename failed AND delete failed, we are in trouble.
            throw sudoError;
          }
        }
      }
    }

    // Ensure parent directory exists first (e.g. /Volumes/EFI) if we deleted deeper
    const parentDir = path.dirname(destEfiPath);
    if (!fs.existsSync(parentDir)) {
      // Should be a mount point, so it must exist, but just in case
      console.warn(`[EFI] Parent ${parentDir} missing, creating...`);
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.mkdirSync(destEfiPath, { recursive: true });
  }

  // Recursive copy with progress (Async to avoid blocking UI)
  const copyRecursiveAsync = async (src, dest) => {
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
