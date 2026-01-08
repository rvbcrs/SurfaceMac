const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Path from your logs
const PKG_PATH = '/Users/rvbcrs/Downloads/SurfaceMac_Installer/sonoma/InstallAssistant.pkg';
const EXTRACT_DIR = '/Users/rvbcrs/Downloads/SurfaceMac_Installer/sonoma/Test_Extraction_RamDisk_Priority';

async function testExtraction() {
    console.log('--- TEST EXTRACTION (RAMDISK PRIORITY) ---');
    console.log(`PKG: ${PKG_PATH}`);
    console.log(`OUT: ${EXTRACT_DIR}`);
    console.log('------------------------------------------');

    if (fs.existsSync(EXTRACT_DIR)) {
        console.log('Cleaning previous test dir...');
        fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });

    const pkgExtractDir = path.join(EXTRACT_DIR, 'pkg_content');

    console.log('1. Expanding PKG (pkgutil)... takes a minute...');
    await execAsync(`pkgutil --expand-full "${PKG_PATH}" "${pkgExtractDir}"`);

    // Helper to find file recursively
    const findFileRecursive = (dir, filename, depth = 0) => {
        if (depth > 6) return null;
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const fullPath = path.join(dir, f);
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    const found = findFileRecursive(fullPath, filename, depth + 1);
                    if (found) return found;
                } else if (f === filename) {
                    return fullPath;
                }
            }
        } catch (e) { }
        return null;
    };

    console.log('2. Search for SharedSupport.dmg...');
    let sharedSupportDmg = findFileRecursive(pkgExtractDir, 'SharedSupport.dmg');

    if (sharedSupportDmg && fs.existsSync(sharedSupportDmg)) {
        console.log(`Found SharedSupport: ${sharedSupportDmg}`);
        console.log('Mounting...');

        const { stdout } = await execAsync(`hdiutil attach -nobrowse -readonly "${sharedSupportDmg}"`);
        const match = stdout.match(/\/Volumes\/[^\\n]+/);

        if (match) {
            const mountPoint = match[0].trim();
            console.log(`Mounted at: ${mountPoint}`);

            // ZIP Finder
            const findZipRecursive = (d, dpt = 0) => {
                if (dpt > 3) return null;
                try {
                    const items = fs.readdirSync(d);
                    for (const i of items) {
                        const fp = path.join(d, i);
                        const st = fs.statSync(fp);
                        if (st.isDirectory()) {
                            const res = findZipRecursive(fp, dpt + 1);
                            if (res) return res;
                        } else if (i.endsWith('.zip') && st.size > 500 * 1024 * 1024) { // > 500MB
                            return fp;
                        }
                    }
                } catch (e) { }
                return null;
            };

            const assetZip = findZipRecursive(mountPoint);

            if (assetZip) {
                console.log(`📦 Found Large ZIP: ${assetZip}`);
                const unzipDir = path.join(EXTRACT_DIR, 'temp_unzip');
                if (fs.existsSync(unzipDir)) fs.rmSync(unzipDir, { recursive: true, force: true });
                fs.mkdirSync(unzipDir);

                console.log('🍏 Using DITTO to extract zip...');
                try {
                    // ditto -x -k <src_zip> <dst_dir>
                    await execAsync(`ditto -x -k "${assetZip}" "${unzipDir}"`);
                    console.log('✅ Extraction complete.');

                    // SEARCH PRIORITY
                    console.log('🔍 Searching for Recovery Images (Priority: SURamDisk > BaseSystem)');

                    // Logic: Find SURamDisk first. 
                    // Note: Exclude "patches" folder implicitly by accepting first robust match or explicitly checking path?
                    // Let's list all candidates first for debug

                    const potentialNames = ['x86_64SURamDisk.dmg', 'BaseSystem.dmg'];

                    // Custom recursive finder that prioritizes SURamDisk
                    const findPriorityImage = (d) => {
                        let bestMatch = null;

                        const walk = (currentDir) => {
                            const items = fs.readdirSync(currentDir);
                            for (const i of items) {
                                const fp = path.join(currentDir, i);
                                const st = fs.statSync(fp);

                                if (st.isDirectory()) {
                                    walk(fp);
                                } else {
                                    if (i === 'x86_64SURamDisk.dmg') {
                                        // High priority - override anything else
                                        // But check it's not in a "patch" folder?
                                        if (!fp.includes('patch')) {
                                            console.log(`   Found PRIORITY candidate: ${fp} (${(st.size / 1024 / 1024).toFixed(1)} MB)`);
                                            bestMatch = fp;
                                        }
                                    } else if (i === 'BaseSystem.dmg' && !bestMatch) {
                                        // Lower priority
                                        console.log(`   Found FALLBACK candidate: ${fp} (${(st.size / 1024 / 1024).toFixed(1)} MB)`);
                                        bestMatch = fp;
                                    }
                                }
                            }
                        }
                        walk(d);
                        return bestMatch;
                    };

                    let finalImage = findPriorityImage(unzipDir);

                    if (finalImage) {
                        const size = (fs.statSync(finalImage).size / 1024 / 1024).toFixed(2);
                        console.log('------------------------------------------');
                        console.log(`🏆 WINNER: ${finalImage}`);
                        console.log(`📏 Size: ${size} MB`);
                        console.log('------------------------------------------');

                        console.log('Checking with hdiutil imageinfo...');
                        try {
                            await execAsync(`hdiutil imageinfo "${finalImage}"`);
                            console.log('✅ VALID DISK IMAGE (hdiutil recognized it)');
                            if (size < 400) {
                                console.log('✅ Small size is EXPECTED for RamDisk.');
                            }
                        } catch (e) {
                            console.log('❌ INVALID/CORRUPT IMAGE (hdiutil failed)');
                        }

                        // Also check chunklist
                        const clName = path.basename(finalImage).replace('.dmg', '.chunklist');
                        const chunklistCandidates = [clName, 'BaseSystem.chunklist', 'x86_64SURamDisk.chunklist'];

                        console.log(`Searching for chunklist (candidates: ${chunklistCandidates.join(', ')})...`);
                        // ... logic to find chunklist ...

                    } else {
                        console.log('❌ No valid recovery image found.');
                    }

                } catch (e) {
                    console.log('❌ ditto failed:', e.message);
                }

            } else {
                console.log('❌ No large ZIP found in DMG.');
            }

            await execAsync(`hdiutil detach "${mountPoint}" -force`);
        }
    } else {
        console.log('❌ SharedSupport.dmg not found.');
    }
}

testExtraction().catch(console.error);
