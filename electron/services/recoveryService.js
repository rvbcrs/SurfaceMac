/**
 * macOS Recovery Download Service (CommonJS)
 * 
 * Dynamically fetches BaseSystem.dmg/chunklist using gibMacOS logic.
 */

const fs = require('fs');
const path = require('path');
const downloadService = require('./downloadService');
const gibMacOSService = require('./gibMacOSService');

const RecoveryService = {
    /**
     * Download macOS recovery image
     */
    async downloadRecovery(options) {
        const { macosVersion, outputDir, onProgress } = options;

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Create com.apple.recovery.boot folder
        const recoveryDir = path.join(outputDir, 'com.apple.recovery.boot');
        if (!fs.existsSync(recoveryDir)) {
            fs.mkdirSync(recoveryDir, { recursive: true });
        }

        console.log(`[RecoveryService] Finding recovery image for ${macosVersion}`);

        // 1. Fetch Catalog
        // Recovery updates are often in Public Seed or Public Release.
        // We check Public first, then Seed if not found?
        // Actually, gibMacOSService.fetchCatalog default is 'public'.
        let catalog = await gibMacOSService.fetchCatalog('public');
        let products = await gibMacOSService.getAvailableInstallers(catalog);

        const targetMajor = macosVersion === 'sequoia' ? 15 : 14;

        // Filter for Recovery type and Version
        // Note: Recovery updates usually have title "macOS Recovery" or similar, but gibMacOSService assigns title from .dist
        // We match version.
        let recoveryProduct = products.find(p =>
            p.type === 'recovery' &&
            (p.version.startsWith(`${targetMajor}.`) || p.title.toLowerCase().includes('recovery') || p.title.toLowerCase().includes(macosVersion)) &&
            p.packages.some(pkg => pkg.url.endsWith('BaseSystem.dmg'))
        );

        if (!recoveryProduct) {
            console.log('[RecoveryService] Not found in Public catalog, trying PublicSeed...');
            catalog = await gibMacOSService.fetchCatalog('publicseed');
            products = await gibMacOSService.getAvailableInstallers(catalog);
            recoveryProduct = products.find(p =>
                p.type === 'recovery' &&
                (p.version.startsWith(`${targetMajor}.`) || p.title.toLowerCase().includes('recovery') || p.title.toLowerCase().includes(macosVersion)) &&
                p.packages.some(pkg => pkg.url.endsWith('BaseSystem.dmg'))
            );
        }

        // Fallback: Use ANY latest recovery image if specific version is missing
        if (!recoveryProduct) {
            console.log(`[RecoveryService] Specific version match failed for ${macosVersion}. Falling back to latest available Recovery.`);
            recoveryProduct = products.find(p => p.type === 'recovery' && p.packages.some(pkg => pkg.url.endsWith('BaseSystem.dmg')));
        }

        if (!recoveryProduct) {
            throw new Error(`No Recovery image found for ${macosVersion} (14.x/15.x). Available: ${products.slice(0, 3).map(p => p.title).join(', ')}`);
        }

        console.log(`[RecoveryService] Selected: ${recoveryProduct.title} (${recoveryProduct.version})`);

        // Get URLs
        const basePkg = recoveryProduct.packages.find(p => p.url.endsWith('BaseSystem.dmg'));
        const chunkPkg = recoveryProduct.packages.find(p => p.url.endsWith('BaseSystem.chunklist'));

        if (!basePkg || !chunkPkg) {
            throw new Error('Missing BaseSystem.dmg or chunklist in selected product.');
        }

        // 2. Download BaseSystem.dmg
        const baseSystemPath = path.join(recoveryDir, 'BaseSystem.dmg');
        if (!fs.existsSync(baseSystemPath) || fs.statSync(baseSystemPath).size !== basePkg.size) {
            console.log(`[RecoveryService] Downloading BaseSystem.dmg (${(basePkg.size / 1024 / 1024).toFixed(1)} MB)...`);
            await downloadService.download({
                id: 'basesystem',
                url: basePkg.url,
                destPath: baseSystemPath,
                onProgress: (progress) => {
                    if (onProgress) {
                        // Rescale progress if needed, or just pass it
                        // We do 2 downloads.
                        // Let's just track BaseSystem as main progress (chunklist is small)
                        onProgress({ ...progress, id: 'recovery-base' });
                    }
                },
            });
        } else {
            console.log('[RecoveryService] BaseSystem.dmg already exists and matches size.');
            if (onProgress) onProgress({ percent: 100, downloaded: basePkg.size, total: basePkg.size, id: 'recovery-base' });
        }

        // 3. Download chunklist
        const chunklistPath = path.join(recoveryDir, 'BaseSystem.chunklist');
        console.log('[RecoveryService] Downloading BaseSystem.chunklist...');
        await downloadService.download({
            id: 'chunklist',
            url: chunkPkg.url,
            destPath: chunklistPath,
        });

        console.log('[RecoveryService] Download complete!');
        return { baseSystemPath, chunklistPath };
    },

    hasRecoveryFiles(outputDir) {
        const recoveryDir = path.join(outputDir, 'com.apple.recovery.boot');
        return fs.existsSync(path.join(recoveryDir, 'BaseSystem.dmg'));
    }
};

module.exports = RecoveryService;
