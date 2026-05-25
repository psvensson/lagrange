import fs from 'fs';
import path from 'path';

function parseMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const openMarker = '<!-- work-package';
    const closeMarker = '-->';
    const openIndex = content.indexOf(openMarker);
    const closeIndex = content.indexOf(closeMarker, openIndex);
    if (openIndex === -1 || closeIndex === -1) return null;
    const jsonText = content.slice(openIndex + openMarker.length, closeIndex).trim();
    return JSON.parse(jsonText);
  } catch (err) {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sinceArgIdx = args.indexOf('--since');
  const sinceDate = sinceArgIdx !== -1 ? args[sinceArgIdx + 1] : null;

  console.log('=== Ceremony Audit Report ===');
  if (sinceDate) {
    console.log(`Filtering packages closed since: ${sinceDate}`);
  }

  const packagesDir = 'work/packages';
  if (!fs.existsSync(packagesDir)) {
    console.log('No packages directory found.');
    return;
  }

  const files = fs.readdirSync(packagesDir)
    .filter((f) => f.startsWith('done-') && f.endsWith('.md'));

  const ceremonyPackages = [];

  for (const file of files) {
    const filePath = path.join(packagesDir, file);
    const metadata = parseMetadata(filePath);
    if (!metadata) continue;

    // Check since filter
    if (sinceDate && metadata.closed && metadata.closed < sinceDate) {
      continue;
    }

    const refs = metadata.execution && metadata.execution.theoryLedgerRefs || [];
    const hasNoTheoryRefs = refs.length === 0;

    const writeScope = metadata.scope && metadata.scope.writeScope || [];
    const hasNoRuntimeChanges = !writeScope.some((p) => p.includes('src/'));

    if (hasNoTheoryRefs && hasNoRuntimeChanges) {
      ceremonyPackages.push({
        file,
        owner: metadata.intent && metadata.intent.owner || 'unknown',
        lane: metadata.intent && metadata.intent.lane || 'unknown',
        closed: metadata.closed || 'unknown',
      });
    }
  }

  if (ceremonyPackages.length === 0) {
    console.log('\nNo pure-ceremony packages detected (all packages either touched runtime code or cited a theory ledger entry). Great work!');
  } else {
    console.log(`\nDetected ${ceremonyPackages.length} pure-ceremony packages (no runtime changes AND no theory ledger refs):`);
    console.log('--------------------------------------------------');
    for (const pkg of ceremonyPackages) {
      console.log(`- Package:  ${pkg.file}`);
      console.log(`  Owner:    ${pkg.owner}`);
      console.log(`  Lane:     ${pkg.lane}`);
      console.log(`  Closed:   ${pkg.closed}`);
      console.log('--------------------------------------------------');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
