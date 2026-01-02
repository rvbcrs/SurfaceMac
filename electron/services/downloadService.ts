/**
 * Download Service
 * 
 * Generic file downloader with progress tracking for Electron.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

export interface DownloadProgress {
  id: string;
  percent: number;
  downloaded: number;
  total: number;
  speed: number; // bytes per second
}

export interface DownloadOptions {
  id: string;
  url: string;
  destPath: string;
  onProgress?: (progress: DownloadProgress) => void;
}

export class DownloadService extends EventEmitter {
  private activeDownloads: Map<string, AbortController> = new Map();

  /**
   * Download a file with progress tracking
   */
  async download(options: DownloadOptions): Promise<string> {
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

        response.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length;

          // Calculate speed
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          const speed = timeDiff > 0 ? (downloadedSize - lastDownloaded) / timeDiff : 0;
          
          if (timeDiff >= 0.5) { // Update every 500ms
            lastTime = now;
            lastDownloaded = downloadedSize;

            const progress: DownloadProgress = {
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
          fs.unlink(destPath, () => {}); // Clean up partial file
          reject(err);
        });
      });

      request.on('error', (err) => {
        reject(err);
      });

      // Store abort controller for cancellation
      const abortController = new AbortController();
      this.activeDownloads.set(id, abortController);
    });
  }

  /**
   * Download and extract a zip file
   */
  async downloadAndExtract(
    options: DownloadOptions,
    extractDir: string
  ): Promise<string> {
    const zipPath = await this.download(options);
    
    // Use built-in unzip on macOS/Linux, PowerShell on Windows
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    const platform = process.platform;
    
    if (platform === 'win32') {
      await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);
    } else {
      await execAsync(`unzip -o "${zipPath}" -d "${extractDir}"`);
    }

    // Optionally delete the zip file
    fs.unlinkSync(zipPath);

    return extractDir;
  }

  /**
   * Cancel a download
   */
  cancel(id: string): boolean {
    const controller = this.activeDownloads.get(id);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get list of active downloads
   */
  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }
}

// Singleton instance
export const downloadService = new DownloadService();

export default downloadService;
