/**
 * Upgrade Pinterest image thumbnails to higher resolution.
 * Usage: node unused/upgrade_images.js
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load existing results
const resultsDir = path.join(__dirname, '..', 'results');
const inputFile = path.join(resultsDir, 'pinterest_1784257212546.json');

async function main() {
    const pins = await fs.readJson(inputFile);
    console.log(`📂 Loaded ${pins.length} pins from ${inputFile}`);

    // Upgrade image URLs: /236x/ → /originals/ for highest quality
    const upgraded = pins.map((pin, i) => {
        const img = pin.image;
        // Pinterest URL structure: .../236x/abc.jpg → .../originals/abc.jpg
        const hq = img.replace(/\/\d+x\//, '/originals/');
        const hq736 = img.replace(/\/\d+x\//, '/736x/');

        return {
            index: i + 1,
            thumbnail: img,
            hq: hq,
            hq_736: hq736,
        };
    });

    // Save upgraded results
    const timestamp = Date.now();
    const outputPath = path.join(resultsDir, `mirai_kuriyama_pinterest_${timestamp}.json`);
    await fs.writeJson(outputPath, upgraded, { spaces: 2 });
    console.log(`\n💾 Upgraded results saved to: ${outputPath}`);

    // Also save just the URLs as plain text for easy download
    const txtPath = path.join(resultsDir, `mirai_kuriyama_download_links.txt`);
    const txtContent = upgraded
        .map(
            (p, i) => `[${i + 1}] Thumb: ${p.thumbnail}\n    HQ:    ${p.hq}\n    HQ736: ${p.hq_736}`
        )
        .join('\n\n');
    await fs.writeFile(txtPath, txtContent);
    console.log(`💾 Download links saved to: ${txtPath}`);

    // Save just HQ URLs
    const urlsOnlyPath = path.join(resultsDir, `mirai_kuriyama_hq_urls.txt`);
    await fs.writeFile(urlsOnlyPath, upgraded.map((p) => p.hq).join('\n'));
    console.log(`💾 HQ URLs only saved to: ${urlsOnlyPath}`);

    // Display preview
    console.log('\n📌 Preview (15 HQ results):');
    upgraded.slice(0, 15).forEach((pin, i) => {
        console.log(`  [${i + 1}] ${pin.hq}`);
    });

    console.log(`\n✅ Total: ${upgraded.length} gambar`);
}

main().catch(console.error);
