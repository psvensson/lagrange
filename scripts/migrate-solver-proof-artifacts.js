#!/usr/bin/env node

import {
  migrateProofArtifacts,
  validateProofArtifactMigration,
} from './solve/proof-artifact-migration.js';

const PROBLEM_SEPARATOR = '; ';
const PASS_PREFIX = 'solver proof artifact migration: PASS — ';
const PERCENT_MULTIPLIER = 100;

const checkOnly = process.argv.includes('--check');
try {
  const result = checkOnly ?
    validateProofArtifactMigration(process.cwd()) :
    migrateProofArtifacts(process.cwd());
  if (checkOnly && !result.valid) {
    throw new Error(result.problems.join(PROBLEM_SEPARATOR));
  }
  const receipt = result.receipt;
  process.stdout.write(
    PASS_PREFIX +
    `${receipt.migratedArtifacts} artifacts, ` +
    `${(receipt.duplicateReduction * PERCENT_MULTIPLIER).toFixed(2)}% duplicate reduction\n`,
  );
} catch (error) {
  process.stderr.write(`solver proof artifact migration: FAIL — ${error.message}\n`);
  process.exitCode = 1;
}
