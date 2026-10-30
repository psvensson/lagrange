#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
  assertSupportedGlobalIndexDefinition,
  isReadableByPlanner,
  isValidGlobalIndexStateTransition,
  maintainsOnWrite,
} from '../../src/index-management/global-index-catalog-contract.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';

const REQUIREMENTS_PATH = 'solve/specs/global-secondary-indexes/requirements.md';
const RESEARCH_PATH =
  'solve/specs/release-0-3-queryable-core/global-index-maintenance-research.md';
const TEXT_ENCODING = 'utf8';

const UNSEALED_PATTERN = /R2\s+unsealed/i;
const REQUIRED_SPEC_PATTERNS = Object.freeze([
  {
    description: 'Mode A synchronous non-unique TX1 maintenance contract',
    regex: /Mode A/i,
  },
  {
    description: 'Synchronous non-unique maintenance phrasing',
    regex: /synchronous.*non-unique/i,
  },
  {
    description: 'TX1 participant enlistment rule',
    regex: /TX1 Participant Enlistment/i,
  },
  {
    description: 'Active write maintenance states',
    regex: /\[WRITE_ONLY,\s*BACKFILLING,\s*READ_WRITE\]/,
  },
  {
    description: 'READ_WRITE read visibility rule',
    regex: /index_state\s*===\s*'READ_WRITE'/,
  },
  {
    description: 'Fallback to scatter-gather on non-readable states',
    regex: /scatter-gather/i,
  },
  {
    description: 'Rejection of CREATE UNIQUE GLOBAL INDEX',
    regex: /CREATE UNIQUE GLOBAL INDEX/i,
  },
  {
    description: 'Unsupported SQL feature code 0A000',
    regex: /0A000/,
  },
  {
    description: 'Global uniqueness deferral to 1.0',
    regex: /1\.0/,
  },
]);

const SEAL_GUARD_ERRORS = Object.freeze({
  READ_WRITE_PLANNER_READABLE:
    'READ_WRITE must be readable by planner',
  UNIQUE_GSI_DEFERRED:
    'assertSupportedGlobalIndexDefinition must throw 0A000 on unique GSI',
  CREATING_TO_WRITE_ONLY:
    'CREATING -> WRITE_ONLY transition must be valid',
  WRITE_ONLY_TO_BACKFILLING:
    'WRITE_ONLY -> BACKFILLING transition must be valid',
  BACKFILLING_TO_READ_WRITE:
    'BACKFILLING -> READ_WRITE transition must be valid',
  CREATING_TO_READ_WRITE_INVALID:
    'CREATING -> READ_WRITE direct transition must be invalid',
});

/**
 * Validate that markdown specification files are sealed with Mode A contracts.
 * @param {string} filePath
 * @param {string[]} issues
 */
function validateSpecFile(filePath, issues) {
  if (!fs.existsSync(filePath)) {
    issues.push(`Spec file not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, TEXT_ENCODING);
  if (UNSEALED_PATTERN.test(content)) {
    issues.push(`Spec file still contains unsealed status: ${filePath}`);
  }
  for (const {description, regex} of REQUIRED_SPEC_PATTERNS) {
    if (!regex.test(content)) {
      issues.push(
        `Spec file ${filePath} missing required pattern: ${description}`,
      );
    }
  }
}

/**
 * Validate code contracts in GlobalIndexCatalogContract.
 * @param {string[]} issues
 */
function validateCatalogCodeContracts(issues) {
  // Read visibility gates
  if (!isReadableByPlanner(GLOBAL_INDEX_STATE.READ_WRITE)) {
    issues.push(SEAL_GUARD_ERRORS.READ_WRITE_PLANNER_READABLE);
  }
  const unreadableStates = [
    GLOBAL_INDEX_STATE.CREATING,
    GLOBAL_INDEX_STATE.WRITE_ONLY,
    GLOBAL_INDEX_STATE.BACKFILLING,
    GLOBAL_INDEX_STATE.DROPPING,
    GLOBAL_INDEX_STATE.FAILED,
  ];
  for (const state of unreadableStates) {
    if (isReadableByPlanner(state)) {
      issues.push(`State ${state} must NOT be readable by planner`);
    }
  }

  // Write maintenance gates
  const maintainingStates = [
    GLOBAL_INDEX_STATE.WRITE_ONLY,
    GLOBAL_INDEX_STATE.BACKFILLING,
    GLOBAL_INDEX_STATE.READ_WRITE,
  ];
  for (const state of maintainingStates) {
    if (!maintainsOnWrite(state)) {
      issues.push(`State ${state} must maintain on write`);
    }
  }
  const nonMaintainingStates = [
    GLOBAL_INDEX_STATE.CREATING,
    GLOBAL_INDEX_STATE.DROPPING,
    GLOBAL_INDEX_STATE.FAILED,
  ];
  for (const state of nonMaintainingStates) {
    if (maintainsOnWrite(state)) {
      issues.push(`State ${state} must NOT maintain on write`);
    }
  }

  // Uniqueness deferral to 1.0 (fail closed with 0A000 / UNSUPPORTED_SQL_FEATURE)
  let threwExpected = false;
  try {
    assertSupportedGlobalIndexDefinition({isGlobal: true, isUnique: true});
  } catch (err) {
    threwExpected =
      err.code === QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE &&
      err.sqlState === GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED;
  }
  if (!threwExpected) {
    issues.push(SEAL_GUARD_ERRORS.UNIQUE_GSI_DEFERRED);
  }

  // Non-unique GSI admission
  try {
    assertSupportedGlobalIndexDefinition({isGlobal: true, isUnique: false});
  } catch (err) {
    issues.push(
      `assertSupportedGlobalIndexDefinition rejected valid non-unique GSI: ${err.message}`,
    );
  }

  // Lifecycle transitions
  if (!isValidGlobalIndexStateTransition(
    GLOBAL_INDEX_STATE.CREATING,
    GLOBAL_INDEX_STATE.WRITE_ONLY,
  )) {
    issues.push(SEAL_GUARD_ERRORS.CREATING_TO_WRITE_ONLY);
  }
  if (!isValidGlobalIndexStateTransition(
    GLOBAL_INDEX_STATE.WRITE_ONLY,
    GLOBAL_INDEX_STATE.BACKFILLING,
  )) {
    issues.push(SEAL_GUARD_ERRORS.WRITE_ONLY_TO_BACKFILLING);
  }
  if (!isValidGlobalIndexStateTransition(
    GLOBAL_INDEX_STATE.BACKFILLING,
    GLOBAL_INDEX_STATE.READ_WRITE,
  )) {
    issues.push(SEAL_GUARD_ERRORS.BACKFILLING_TO_READ_WRITE);
  }
  if (isValidGlobalIndexStateTransition(
    GLOBAL_INDEX_STATE.CREATING,
    GLOBAL_INDEX_STATE.READ_WRITE,
  )) {
    issues.push(SEAL_GUARD_ERRORS.CREATING_TO_READ_WRITE_INVALID);
  }
}

/**
 * Execute all seal guard checks and return metrics.
 * @return {{metric: number, failures: string[]}}
 */
export function checkGlobalIndexMaintenanceModeSeal() {
  const issues = [];
  validateSpecFile(REQUIREMENTS_PATH, issues);
  validateSpecFile(RESEARCH_PATH, issues);
  validateCatalogCodeContracts(issues);
  return {
    metric: issues.length,
    failures: issues,
  };
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === currentFile) {
  const result = checkGlobalIndexMaintenanceModeSeal();
  if (result.metric > 0) {
    for (const msg of result.failures) {
      process.stderr.write(`FAIL: ${msg}\n`);
    }
  }
  process.stdout.write(`metric=${result.metric}\n`);
  process.exitCode = result.metric === 0 ? 0 : 1;
}
