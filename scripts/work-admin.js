#!/usr/bin/env node

import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import {THEORY_LEDGER_REFS_FIELD} from './work-package-schema.js';
import {
  parsePackageMetadata,
  replacePackageMetadata,
} from './work-tracker.js';

async function routePackage(packagePath, successor) {
  console.log(`Routing package ${packagePath} to successor ${successor}...`);
  execSync(`node scripts/work-package-route-after-rerun.js --successor ${successor} --package ${packagePath}`, { stdio: 'inherit' });
}

async function attachTrack(packagePath, trackName) {
  console.log(`Attaching track ${trackName} to package ${packagePath}...`);
  const content = await fs.readFile(packagePath, 'utf8');
  const metadata = parsePackageMetadata(content, packagePath);
  if (!metadata) {
    throw new Error(`work-package metadata not found in ${packagePath}`);
  }
  const refs = new Set(Array.isArray(metadata[THEORY_LEDGER_REFS_FIELD]) ?
    metadata[THEORY_LEDGER_REFS_FIELD] :
    []);
  refs.add(trackName);
  metadata[THEORY_LEDGER_REFS_FIELD] = [...refs];
  metadata.execution = {
    ...(metadata.execution || {}),
    [THEORY_LEDGER_REFS_FIELD]: metadata[THEORY_LEDGER_REFS_FIELD],
  };
  const updated = replacePackageMetadata(content, metadata);
  await fs.writeFile(packagePath, updated, 'utf8');
  console.log(`Successfully attached ${trackName} to ${packagePath}!`);
}

async function advanceSprint() {
  console.log('Advancing sprint...');
  execSync('node scripts/work-sprint-advance.js --write', { stdio: 'inherit' });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Work Admin Transaction Commands Tool');
    console.log('Usage:');
    console.log('  node scripts/work-admin.js --route --package <path> --successor <successor>');
    console.log('  node scripts/work-admin.js --attach-track --package <path> --track <track>');
    console.log('  node scripts/work-admin.js --advance-sprint');
    return;
  }

  if (args.includes('--route')) {
    const packageIdx = args.indexOf('--package');
    const successorIdx = args.indexOf('--successor');
    if (packageIdx === -1 || successorIdx === -1) {
      throw new Error('Both --package and --successor are required for routing');
    }
    await routePackage(args[packageIdx + 1], args[successorIdx + 1]);
  } else if (args.includes('--attach-track')) {
    const packageIdx = args.indexOf('--package');
    const trackIdx = args.indexOf('--track');
    if (packageIdx === -1 || trackIdx === -1) {
      throw new Error('Both --package and --track are required');
    }
    await attachTrack(packageIdx !== -1 ? args[packageIdx + 1] : null, args[trackIdx + 1]);
  } else if (args.includes('--advance-sprint')) {
    await advanceSprint();
  } else {
    console.log('Usage: node scripts/work-admin.js [--route|--attach-track|--advance-sprint] --help');
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
