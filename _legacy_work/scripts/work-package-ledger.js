#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const PACKAGES_DIR = 'work/packages';

async function findActivePackage() {
  const entries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true });
  const activeFiles = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('active-') && entry.name.endsWith('.md'))
    .map((entry) => path.join(PACKAGES_DIR, entry.name));
  if (activeFiles.length === 0) {
    throw new Error('No active package file found.');
  }
  if (activeFiles.length > 1) {
    throw new Error(`Multiple active packages found: ${activeFiles.join(', ')}`);
  }
  return activeFiles[0];
}

async function markNoLedger(packagePath) {
  const activePackage = packagePath || await findActivePackage();
  console.log(`Active package: ${activePackage}`);

  let content = await fs.readFile(activePackage, 'utf8');

  // 1. Ensure "theory-ledger: not-needed" is in the ## Execution Evidence section
  const lines = content.split('\n');
  let inEvidence = false;
  let hasNoLedgerFlag = false;
  let insertIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## Execution Evidence')) {
      inEvidence = true;
      insertIndex = i + 1;
      continue;
    }
    if (inEvidence && line.startsWith('## ')) {
      inEvidence = false;
    }
    if (inEvidence && /theory-ledger:\s*not-needed/iu.test(line)) {
      hasNoLedgerFlag = true;
    }
  }

  if (!hasNoLedgerFlag && insertIndex !== -1) {
    lines.splice(insertIndex, 0, '', 'theory-ledger: not-needed');
  }

  content = lines.join('\n');

  // 2. Clear theoryLedgerRefs in metadata JSON
  content = content.replace(/"theoryLedgerRefs":\s*\[[^\]]*\]/u, '"theoryLedgerRefs": []');

  await fs.writeFile(activePackage, content, 'utf8');
  console.log(`Successfully recorded no-ledger-update inside ${activePackage}!`);
}

async function main() {
  const args = process.argv.slice(2);
  const packagePath = args.includes('--package') ? args[args.indexOf('--package') + 1] : null;
  if (args.includes('--no-ledger')) {
    await markNoLedger(packagePath);
  } else {
    console.log('Work Package Ledger Mutation Tool');
    console.log('Usage: node scripts/work-package-ledger.js --no-ledger [--package <path>]');
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
