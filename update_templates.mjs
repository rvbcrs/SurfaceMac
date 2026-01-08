import fs from 'fs';
import path from 'path';

const rootDir = '/Users/rvbcrs/GitHub/SurfaceMac';
const masterConfigPath = path.join(rootDir, 'config.plist');
const i5Path = path.join(rootDir, 'config-i5.plist');
const i7Path = path.join(rootDir, 'config-i7.plist');

console.log(`Reading master config from: ${masterConfigPath}`);

try {
    let content = fs.readFileSync(masterConfigPath, 'utf8');

    // Identifiers for the blocks
    const i7Marker = '<key>#Surface Pro i7 ONLY</key>';
    const i5Marker = '<key>#Surface Pro i5 ONLY</key>';

    // Look for the PciRoot key specifically before the marker
    // We expect: <key>#?PciRoot(0x0)/Pci(0x2,0x0)</key> ...whitespace... <dict> ...whitespace... <key>#Surface Pro iX ONLY</key>

    // Function to generate content with specific block enabled
    const generateConfig = (enableType) => { // 'i5' or 'i7'
        let newContent = content;

        const processBlock = (type) => { // 'i5' or 'i7'
            const marker = type === 'i7' ? i7Marker : i5Marker;
            const shouldEnable = type === enableType;

            // Find the marker
            const markerIndex = newContent.indexOf(marker);
            if (markerIndex === -1) {
                console.error(`Marker not found for ${type}`);
                return;
            }

            // Search backwards for the PciRoot key
            // The key is <key>PciRoot(0x0)/Pci(0x2,0x0)</key> possibly with a # prefix
            const keyBase = 'PciRoot(0x0)/Pci(0x2,0x0)</key>';
            const searchLimit = 200; // Search locally before marker
            const subStr = newContent.substring(markerIndex - searchLimit, markerIndex);
            const keyIndexRelative = subStr.lastIndexOf(keyBase);

            if (keyIndexRelative === -1) {
                console.error(`PciRoot key not found preceding ${type} marker`);
                return;
            }

            const absolKeyIndexEnd = (markerIndex - searchLimit) + keyIndexRelative + keyBase.length; // End of </key>
            // Check start of tag
            const absolKeyIndexStart = newContent.substring(0, absolKeyIndexEnd).lastIndexOf('<key>');

            if (absolKeyIndexStart === -1) {
                console.error(`Tag start not found for ${type}`);
                return;
            }

            // Extract the full tag: <key>#?PciRoot...</key>
            const fullTag = newContent.substring(absolKeyIndexStart, absolKeyIndexEnd);

            let newTag = fullTag;
            if (shouldEnable) {
                // Remove # if present
                newTag = newTag.replace('<key>#', '<key>');
            } else {
                // Add # if not present
                if (!newTag.includes('<key>#')) {
                    newTag = newTag.replace('<key>', '<key>#');
                }
            }

            // Replace in content
            // We use string slicing to avoid global replace issues if key appears elsewhere (unlikely but safer)
            newContent = newContent.substring(0, absolKeyIndexStart) + newTag + newContent.substring(absolKeyIndexEnd);

            // Note: Since we modify newContent, indices for subsequent searches might shift if length changes.
            // But here adding/removing '#' changes length by 1. 
            // Since we do this logic inside a function that runs on distinct copies or handles it sequentially?
            // Actually, I am modifying `newContent`. If I modify the first block, the second block's index shifts.
            // Safer to do replaced content in one go or re-find.
            // Re-finding is safer.
        };

        // We run the logic sequentially on the accumulating content.
        // But the find logic needs to be run against the *current* content.

        // Let's rewrite processBlock to take current content and return new content
        return newContent;
    };

    // Re-implementation for safety/simplicity without index math complexity on shifting strings:
    // We treat the file as lines? Or regex replace?
    // Regex is safe if we match the context.

    const createVersion = (mode) => {
        let txt = content;

        // Regex for i7 Block
        // Matches: (<key>#?)PciRoot...(\s*<dict>\s*<key>#Surface Pro i7 ONLY</key>)
        const i7Regex = /(<key>#?)(PciRoot\(0x0\)\/Pci\(0x2,0x0\)<\/key>)(\s*<dict>\s*<key>#Surface Pro i7 ONLY<\/key>)/g;

        txt = txt.replace(i7Regex, (match, prefix, keyBody, suffix) => {
            const desiredPrefix = (mode === 'i7') ? '<key>' : '<key>#';
            return desiredPrefix + keyBody + suffix;
        });

        // Regex for i5 Block
        const i5Regex = /(<key>#?)(PciRoot\(0x0\)\/Pci\(0x2,0x0\)<\/key>)(\s*<dict>\s*<key>#Surface Pro i5 ONLY<\/key>)/g;

        txt = txt.replace(i5Regex, (match, prefix, keyBody, suffix) => {
            const desiredPrefix = (mode === 'i5') ? '<key>' : '<key>#';
            return desiredPrefix + keyBody + suffix;
        });

        return txt;
    }

    const i5Content = createVersion('i5');
    const i7Content = createVersion('i7');

    fs.writeFileSync(i5Path, i5Content);
    console.log(`Wrote config-i5.plist (${i5Content.length} bytes)`);

    fs.writeFileSync(i7Path, i7Content);
    console.log(`Wrote config-i7.plist (${i7Content.length} bytes)`);

} catch (e) {
    console.error("Error:", e);
}
