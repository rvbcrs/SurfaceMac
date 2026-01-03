/**
 * Download Service (CommonJS)
 * 
 * Generic file downloader with progress tracking for Electron.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');
const { createWriteStream } = require('fs');

class DownloadService extends EventEmitter {
    constructor() {
        super();
        this.activeDownloads = new Map();
    }

    /**
     * Download a file with progress tracking
     */
    async download(options) {
        const { id, url, destPath, onProgress } = options;

        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;

            const request = protocol.get(url, {
                headers: { 'User-Agent': 'SurfaceMac Wizard' }
            }, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        this.download({ ...options, url: redirectUrl })
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed: HTTP ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedSize = 0;
                let lastTime = Date.now();
                let lastDownloaded = 0;

                const fileStream = createWriteStream(destPath);

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;

                    // Calculate speed
                    const now = Date.now();
                    const timeDiff = (now - lastTime) / 1000;
                    const speed = timeDiff > 0 ? (downloadedSize - lastDownloaded) / timeDiff : 0;

                    if (timeDiff >= 0.5) { // Update every 500ms
                        lastTime = now;
                        lastDownloaded = downloadedSize;

                        const progress = {
                            id,
                            percent: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
                            downloaded: downloadedSize,
                            total: totalSize,
                            speed,
                        };

                        if (onProgress) {
                            onProgress(progress);
                        }
                        this.emit('progress', progress);
                    }
                });

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    this.activeDownloads.delete(id);
                    resolve(destPath);
                });

                fileStream.on('error', (err) => {
                    fs.unlink(destPath, () => { }); // Clean up partial file
                    reject(err);
                });
            });

            request.on('error', (err) => {
                reject(err);
            });

            // Store abort controller logic (AbortController might need Node 16+)
            if (global.AbortController) {
                const controller = new AbortController();
                this.activeDownloads.set(id, controller);
            }
        });
    }

    /**
     * Cancel a download
     */
    cancel(id) {
        const controller = this.activeDownloads.get(id);
        if (controller) {
            if (controller.abort) controller.abort();
            this.activeDownloads.delete(id);
            return true;
        }
        return false;
    }

    /**
     * Extract PKG (Full Installer)
     */
    async extractPkg(pkgPath, destPath) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Clean up destination first (pkgutil fails if directory exists)
        if (fs.existsSync(destPath)) {
            console.log(`[Download] Cleaning up existing extract path: ${destPath}`);
            fs.rmSync(destPath, { recursive: true, force: true });
        }

        console.log(`[Download] Extracting PKG: ${pkgPath} -> ${destPath}`);

        if (process.platform === 'darwin') {
            // Use native pkgutil
            // Note: pkgutil --expand-full expands payload to actual files
            // It expects destPath to NOT exist
            await execAsync(`pkgutil --expand-full "${pkgPath}" "${destPath}"`);
        } else {
            // Windows: Assume 7-Zip (7z) is in PATH or bundled
            // Step 1: Extract xar (PKG)
            // Step 2: Extract Payload (if needed, but usually we just want to browse)
            // User requested .app, which is inside Payload.
            // 7z x "file.pkg" -o"dest"

            try {
                await execAsync(`7z x "${pkgPath}" -o"${destPath}" -y`);

                // If Payload exists, we might need to extract it too?
                // Keep it simple for now, extracting the PKG gives the Payload file.
                // If the user wants the .app, he needs to extract Payload.
                // Let's try to find Payload and extract it automatically if found.
                const payloadPath = path.join(destPath, 'Payload');
                if (fs.existsSync(payloadPath)) {
                    console.log('[Download] Found Payload, extracting...');
                    await execAsync(`7z x "${payloadPath}" -o"${destPath}/ExtractedPayload" -y`);
                }
            } catch (e) {
                console.error('Extraction failed. Is 7-Zip installed?');
                throw new Error(`Extraction failed: ${e.message}. Ensure 7-Zip is installed and in PATH.`);
            }
        }

        return destPath;
    }
}

module.exports = new DownloadService();
