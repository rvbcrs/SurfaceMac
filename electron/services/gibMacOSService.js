/**
 * gibMacOS Service (CommonJS)
 * 
 * Port of CorpNewt's gibMacOS logic.
 * Responsible for fetching Apple's sucatalog and finding valid macOS installers.
 */

const https = require('https');
const plist = require('plist');
const { EventEmitter } = require('events');

// Catalog URLs from gibMacOS
const CATALOG_URL_BASE = 'https://swscan.apple.com/content/catalogs/others/';
const CATALOG_SUFFIX = '.merged-1.sucatalog';

const CATALOGS = {
    public: 'index-14-13-12-10.16-10.15-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard' + CATALOG_SUFFIX,
    publicseed: 'index-14seed-14-13-12-10.16-10.15-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard' + CATALOG_SUFFIX,
    developer: 'index-1413seed-14-13-12-10.16-10.15-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard' + CATALOG_SUFFIX,
};

class GibMacOSService extends EventEmitter {
    /**
     * Fetch and parse the catalog
     */
    async fetchCatalog(catalogType = 'public') {
        const url = CATALOG_URL_BASE + (CATALOGS[catalogType] || CATALOGS.public);
        console.log(`[gibMacOS] Fetching catalog: ${url}`);

        return new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'SurfaceMac Wizard' } }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = plist.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error('Failed to parse catalog plist: ' + e));
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    /**
     * Fetch .dist file to get product metadata (Title, Version, Build)
     */
    async getProductDetails(distUrl) {
        return new Promise((resolve) => {
            https.get(distUrl, { headers: { 'User-Agent': 'SurfaceMac Wizard' } }, (res) => {
                if (res.statusCode !== 200) {
                    resolve({ title: 'Unknown', version: 'Unknown', build: 'Unknown' });
                    return;
                }
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    const titleMatch = data.match(/<title>(.*?)<\/title>/);
                    const versionMatch = data.match(/macOS Product Version: ([\d\.]+)/) || data.match(/<key>VERSION<\/key>\s*<string>([\d\.]+)<\/string>/);
                    const buildMatch = data.match(/<key>BUILD<\/key>\s*<string>(\w+)<\/string>/);

                    let title = titleMatch ? titleMatch[1] : 'Unknown macOS';
                    const version = versionMatch ? versionMatch[1] : 'Unknown';
                    const build = buildMatch ? buildMatch[1] : 'Unknown';

                    resolve({ title, version, build });
                });
                res.on('error', () => resolve({ title: 'Unknown', version: 'Unknown', build: 'Unknown' }));
            }).on('error', () => resolve({ title: 'Unknown', version: 'Unknown', build: 'Unknown' }));
        });
    }

    /**
     * Find available macOS installers in the catalog
     */
    async getAvailableInstallers(catalog) {
        const products = catalog.Products;
        console.log(`[gibMacOS] Scanning ${Object.keys(products).length} products...`);

        // Convert to array for processing
        const productEntries = Object.entries(products);
        const candidates = [];

        for (const [productId, productData] of productEntries) {
            const pData = productData;
            const packages = pData.Packages || [];

            let hasInstallAssistant = false;
            let hasRecovery = false;

            for (const pkg of packages) {
                if (pkg.URL.endsWith('InstallAssistant.pkg')) hasInstallAssistant = true;
                if (pkg.URL.endsWith('BaseSystem.dmg')) hasRecovery = true;
            }

            if (hasInstallAssistant || hasRecovery) {
                const dists = pData.Distributions || {};
                const distUrl = dists['English'] || dists['en'] || Object.values(dists)[0];

                if (distUrl) {
                    candidates.push({
                        productId,
                        pData,
                        packages,
                        distUrl,
                        type: hasInstallAssistant ? 'installassistant' : 'recovery'
                    });
                }
            }
        }

        console.log(`[gibMacOS] Found ${candidates.length} candidates. Fetching metadata...`);

        const promises = candidates.map(async (c) => {
            const details = await this.getProductDetails(c.distUrl);
            return {
                id: c.productId,
                version: details.version,
                build: details.build,
                title: details.title,
                date: c.pData.PostDate,
                packages: c.packages.map((p) => ({ url: p.URL, size: p.Size, name: p.URL.split('/').pop() })),
                distUrl: c.distUrl,
                type: c.type
            };
        });

        const productsFound = await Promise.all(promises);

        // Sort by version descending
        return productsFound.sort((a, b) => {
            if (a.version === 'Unknown') return 1;
            if (b.version === 'Unknown') return -1;
            return b.version.localeCompare(a.version, undefined, { numeric: true });
        });
    }
}

module.exports = new GibMacOSService();
