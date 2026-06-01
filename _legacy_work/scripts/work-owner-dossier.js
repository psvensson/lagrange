#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {buildOwnerDossier} from './work-tracker.js';

const HELP_TEXT = [
  'Usage: npm run work:owner-dossier -- --owner <owner> --boundary <boundary> [--json]',
  '',
  'Assembles the full reasoning surface for one owner/boundary:',
  '  - the System Contract Record file (if any)',
  '  - the coupled invariants from the registry (id, kind, coupling)',
  '  - model status: proven | modeled | stalled | none',
  '  - the current artifact-bound representative residual',
  '  - recent closed-package outcomes (metricDelta, residualCount)',
  '  - the theory-ledger trail referenced by those packages',
].join('\n');

function parseArgs(args) {
  const parsed = {json: false, owner: null, boundary: null};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--owner') {
      parsed.owner = args[i + 1];
      i += 1;
    } else if (arg === '--boundary') {
      parsed.boundary = args[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function renderText(dossier) {
  const lines = [];
  lines.push(`Owner-dossier: ${dossier.owner} :: ${dossier.boundary}`);
  lines.push(`  contract record : ${dossier.contractRecord || '(none)'}`);
  lines.push(`  model status    : ${dossier.modelStatus}`);
  lines.push(`  current residual: ${
    dossier.currentResidual === null ? '(unknown)' : dossier.currentResidual
  }`);
  lines.push(`  invariants (${dossier.invariants.length}):`);
  for (const inv of dossier.invariants) {
    const coupling = inv.coupledWith.length > 0 ?
      ` coupledWith=[${inv.coupledWith.join(', ')}]` :
      '';
    lines.push(`    - ${inv.id} (${inv.kind})${coupling}`);
  }
  lines.push(`  proven routes (${dossier.provenRoutes.length}):`);
  for (const route of dossier.provenRoutes) {
    lines.push(
      `    - layer=${route.selectedLayer} evidence=${route.evidenceArtifact}`,
    );
  }
  lines.push(`  recent packages (${dossier.recentPackages.length}):`);
  for (const pkg of dossier.recentPackages) {
    lines.push(
      `    - ${pkg.fileName} outcome=${pkg.outcome || '(none)'} ` +
      `metricDelta=${pkg.metricDelta} residualCount=${pkg.residualCount}`,
    );
  }
  lines.push(`  ledger trail (${dossier.ledgerRefs.length}):`);
  for (const ref of dossier.ledgerRefs) {
    lines.push(`    - ${ref}`);
  }
  return `${lines.join('\n')}\n`;
}

export function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }
  const parsed = parseArgs(args);
  if (!parsed.owner || !parsed.boundary) {
    process.stderr.write(
      'owner-dossier: --owner and --boundary are required.\n\n',
    );
    process.stderr.write(`${HELP_TEXT}\n`);
    return 2;
  }
  const dossier = buildOwnerDossier(parsed.owner, parsed.boundary);
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(dossier, null, 2)}\n`);
  } else {
    process.stdout.write(renderText(dossier));
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
