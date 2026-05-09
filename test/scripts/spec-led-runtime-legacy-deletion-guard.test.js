import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const RG_BIN = 'rg';
const RG_NO_HEADING = '--no-heading';
const RG_LINE_NUMBER = '-n';
const RG_FIXED_STRINGS = '-F';
const UTF8_ENCODING = 'utf8';
const RG_NO_MATCH_EXIT_CODE = 1;
const EMPTY_OUTPUT = '';
const DELETED_RUNTIME_TERMS = Object.freeze([
  'allowLegacySemanticStateInference',
  'shouldAllowLegacyPriorityRecoverySemanticStateInference',
  'deriveLegacyPriorityRecoveryActiveGateFields',
  'buildLegacyNoProgress',
  'getPriorityRecoveryPlanningAnswerBestEffort',
  'getMembershipPublicationPlanningAnswerBestEffort',
  'resolveLegacy',
  'inferPriorityRecoverySemanticState',
  'pending_ack_nodes',
  'failure-reasons',
  'legacy_branch',
  'legacyBranches',
  'VIOLATION_TYPE.LEGACY_BRANCH',
]);
const SCANNED_PATHS = Object.freeze([
  'src/control-plane',
  'src/rebalancer',
  'src/diagnostics',
  'scripts/analyze-topology-convergence.js',
  'test/distributed/harness',
]);

function searchTerm(term) {
  try {
    return execFileSync(
      RG_BIN,
      [
        RG_NO_HEADING,
        RG_LINE_NUMBER,
        RG_FIXED_STRINGS,
        term,
        ...SCANNED_PATHS,
      ],
      {encoding: UTF8_ENCODING},
    );
  } catch (error) {
    if (error.status === RG_NO_MATCH_EXIT_CODE) {
      return EMPTY_OUTPUT;
    }
    throw error;
  }
}

describe('spec-led runtime legacy deletion guard', () => {
  for (const term of DELETED_RUNTIME_TERMS) {
    it(`keeps ${term} deleted from runtime and harness surfaces`, () => {
      assert.equal(searchTerm(term), EMPTY_OUTPUT);
    });
  }
});
