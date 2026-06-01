#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const PACKAGES_DIR = 'work/packages';
const DEFAULT_OWNER = 'workflow_tooling_owner';

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

async function updateEvidence(options) {
  const activePackage = options.package || await findActivePackage();
  console.log(`Active package: ${activePackage}`);

  let content = await fs.readFile(activePackage, 'utf8');
  const lines = content.split('\n');

  let inEvidence = false;
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## Execution Evidence')) {
      inEvidence = true;
      continue;
    }
    if (inEvidence && line.startsWith('## ')) {
      inEvidence = false;
    }

    if (inEvidence && line.includes(`action: ${options.action}`)) {
      const outcome = options.outcome || 'validated';
      const checkChar = outcome === 'validated' || outcome === 'not-needed' ? 'x' : ' ';
      
      lines[i] = buildEvidenceLine({
        ...options,
        checkChar,
      });
      updated = true;
      break;
    }
  }

  if (!updated) {
    // Append to the end of the ## Execution Evidence section
    let insertIndex = -1;
    let inEvidenceSection = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## Execution Evidence')) {
        inEvidenceSection = true;
        continue;
      }
      if (inEvidenceSection && (lines[i].startsWith('## ') || i === lines.length - 1)) {
        insertIndex = i === lines.length - 1 ? i + 1 : i;
        break;
      }
    }

    if (insertIndex !== -1) {
      const outcome = options.outcome || 'validated';
      const checkChar = outcome === 'validated' || outcome === 'not-needed' ? 'x' : ' ';
      const newline = buildEvidenceLine({
        ...options,
        checkChar,
      });
      
      lines.splice(insertIndex, 0, newline);
      updated = true;
    }
  }

  if (updated) {
    await fs.writeFile(activePackage, lines.join('\n'), 'utf8');
    console.log(`Successfully updated execution evidence in ${activePackage}!`);
  } else {
    throw new Error('Could not find or append to Execution Evidence section.');
  }
}

function buildEvidenceLine(options) {
  const outcome = options.outcome || 'validated';
  const files = options.files || 'none';
  const validation = options.validation || 'none';
  const owner = options.owner || DEFAULT_OWNER;
  const checkChar = options.checkChar ||
    (outcome === 'validated' || outcome === 'not-needed' ? 'x' : ' ');
  const parentProof =
    options.parentRevalidated === true ||
    options.parentRevalidated === 'yes' ||
    options.parentRevalidated === 'true';
  return `- [${checkChar}] action: ${options.action}; owner: ${owner}; ` +
    `files-changed: ${files}; validation: ${validation}; ` +
    `${parentProof ? 'parent revalidated focused proof: yes; ' : ''}` +
    `outcome: ${outcome}.`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Work Package Evidence Mutation Tool');
    console.log('Usage: node scripts/work-package-evidence.js --action <action> [--owner <owner>] [--outcome <outcome>] [--files <files>] [--validation <validation>] [--parent-revalidated]');
    return;
  }

  const actionIdx = args.indexOf('--action');
  if (actionIdx === -1 || !args[actionIdx + 1]) {
    console.log('Usage: node scripts/work-package-evidence.js --action <action> [--owner <owner>] [--outcome <outcome>] [--files <files>] [--validation <validation>] [--parent-revalidated]');
    return;
  }

  const options = {
    action: args[actionIdx + 1],
    package: args.includes('--package') ? args[args.indexOf('--package') + 1] : null,
    owner: args.includes('--owner') ? args[args.indexOf('--owner') + 1] : DEFAULT_OWNER,
    outcome: args.includes('--outcome') ? args[args.indexOf('--outcome') + 1] : 'validated',
    files: args.includes('--files') ? args[args.indexOf('--files') + 1] : 'none',
    validation: args.includes('--validation') ? args[args.indexOf('--validation') + 1] : 'none',
    parentRevalidated: args.includes('--parent-revalidated') || args.includes('--parent-revalidated-focused-proof'),
  };

  await updateEvidence(options);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
