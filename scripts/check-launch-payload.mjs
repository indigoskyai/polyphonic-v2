import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(repoRoot, 'dist');
const indexPath = join(distRoot, 'index.html');
const maxInitialGzipBytes = 500 * 1024;

if (!existsSync(indexPath)) {
  throw new Error('dist/index.html is missing. Run npm run build before checking launch payload.');
}

const html = readFileSync(indexPath, 'utf8');
const externalAssetPattern = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const initialAssetPaths = [
  ...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
]
  .map((match) => match[1].replace(/^\//, ''))
  .filter((assetPath) => !externalAssetPattern.test(assetPath))
  .filter((assetPath, index, all) => all.indexOf(assetPath) === index);

if (initialAssetPaths.length === 0) {
  throw new Error('No initial JS/CSS assets found in dist/index.html.');
}

const assets = initialAssetPaths.map((assetPath) => {
  const fullPath = join(distRoot, assetPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Referenced launch asset is missing: ${assetPath}`);
  }

  const raw = readFileSync(fullPath);
  const gzipBytes = gzipSync(raw, { level: 9 }).length;
  return {
    path: assetPath,
    rawBytes: statSync(fullPath).size,
    gzipBytes,
  };
});

const totalGzipBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const totalRawBytes = assets.reduce((sum, asset) => sum + asset.rawBytes, 0);

const summary = assets
  .map((asset) => `${asset.path}: ${(asset.gzipBytes / 1024).toFixed(1)} KiB gzip`)
  .join('\n');

console.log(summary);
console.log(`Initial payload total: ${(totalGzipBytes / 1024).toFixed(1)} KiB gzip (${(totalRawBytes / 1024).toFixed(1)} KiB raw)`);

if (totalGzipBytes > maxInitialGzipBytes) {
  throw new Error(
    `Initial payload exceeds launch budget: ${(totalGzipBytes / 1024).toFixed(1)} KiB gzip > ${maxInitialGzipBytes / 1024} KiB gzip`,
  );
}
