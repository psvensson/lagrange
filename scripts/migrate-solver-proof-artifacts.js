#!/usr/bin/env node

import {
  migrateProofArtifacts,
  validateProofArtifactMigration,
} from './solve/proof-artifact-migration.js';

const checkOnly = process.argv.includes('--check');
try {
  const result = checkOnly ?
    validateProofArtifactMigration(process.cwd()) :
    migrateProofArtifacts(process.cwd());
  if (checkOnly && !result.valid) {
    throw new Error(result.problems.join('; '));
  }
  const receipt = result.receipt;
  process.stdout.write(
    'solver proof artifact migration: PASS — ' +
    `${receipt.migratedArtifacts} artifacts, ` +
    `${(receipt.duplicateReduction * 100).toFixed(2)}% duplicate reduction\n`,
  );
} catch (error) {
  process.stderr.write(`solver proof artifact migration: FAIL — ${error.message}\n`);
  process.exitCode = 1;
}
