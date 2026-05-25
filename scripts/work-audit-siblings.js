import fs from 'fs';
import path from 'path';
import {normalizeMetadata} from './work-package-schema.js';

function parseMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const openMarker = '<!-- work-package';
    const closeMarker = '-->';
    const openIndex = content.indexOf(openMarker);
    const closeIndex = content.indexOf(closeMarker, openIndex);
    if (openIndex === -1 || closeIndex === -1) return null;
    const jsonText = content.slice(openIndex + openMarker.length, closeIndex).trim();
    return normalizeMetadata(JSON.parse(jsonText), filePath);
  } catch (err) {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const thresholdArgIdx = args.indexOf('--threshold');
  const threshold = thresholdArgIdx !== -1 ? parseFloat(args[thresholdArgIdx + 1]) : 0.8;

  console.log('=== Sibling Packages Consolidation Audit Report ===');
  console.log(`Matching packages with scope overlap >= ${threshold * 100}%\n`);

  const packagesDir = 'work/packages';
  if (!fs.existsSync(packagesDir)) {
    console.log('No packages directory found.');
    return;
  }

  const files = fs.readdirSync(packagesDir)
    .filter((f) => f.startsWith('done-') && f.endsWith('.md'));

  const packages = [];

  for (const file of files) {
    const filePath = path.join(packagesDir, file);
    const metadata = parseMetadata(filePath);
    if (!metadata) continue;

    const writeScope = metadata.writeScope || [];
    if (writeScope.length === 0) continue;

    packages.push({
      file,
      scope: new Set(writeScope.map((p) => p.trim())),
    });
  }

  const matches = [];

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const pkgA = packages[i];
      const pkgB = packages[j];

      // Calculate intersection and union size
      let intersectionSize = 0;
      for (const item of pkgA.scope) {
        if (pkgB.scope.has(item)) {
          intersectionSize++;
        }
      }

      const unionSize = pkgA.scope.size + pkgB.scope.size - intersectionSize;
      const minSize = Math.min(pkgA.scope.size, pkgB.scope.size);
      const overlapRatio = intersectionSize / minSize;

      if (overlapRatio >= threshold) {
        matches.push({
          pkgA: pkgA.file,
          pkgB: pkgB.file,
          overlapRatio,
          intersectionSize,
        });
      }
    }
  }

  if (matches.length === 0) {
    console.log('No highly-overlapping sibling packages found.');
  } else {
    console.log(`Found ${matches.length} pairs of sibling packages with high overlap:`);
    console.log('==================================================');
    for (const match of matches) {
      console.log(`- Pair:       ${match.pkgA}`);
      console.log(`              ${match.pkgB}`);
      console.log(`  Overlap:    ${(match.overlapRatio * 100).toFixed(1)}% (${match.intersectionSize} shared files)`);
      console.log(`  Suggestion: Consolidated epic candidate`);
      console.log('--------------------------------------------------');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
