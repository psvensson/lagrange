// Stream A integration point: absent record/admission owners are a typed
// unavailability; the campaign outcome admits this campaign's runs against
// the coverage claims of the scenarios it ran, through A's own functions.
// Substituted: the module loader (A's modules arrive on merge).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {loadRawObservationRecordOwner} from '../comparative-benchmark-record-owner.js';

function modules(log) {
  return {
    './raw-observation-record.js': {validateCampaignHeader: () => {},
      validateRunRecord: () => {}, computeRunObservationsDigest: () => 'sha256:x'},
    './benchmark-claim-admission.js': {
      admitClaim: ({claim, runs, campaignHeaders}) => {
        log.push([claim.claimKey, runs.length, campaignHeaders.size]);
        return {claimKey: claim.claimKey, status: 'invalid-measurement', reasons: ['r']};
      },
      campaignOutcomeOfCells: (cells) => (cells.length ? 'failed' : 'passed'),
    },
    './comparative-coverage-manifest.js': {buildCoverageManifest: () => ({}),
      listManifestClaims: () => [
        {claimKey: 'lagrange/scenarioA/main', targetId: 'lagrange', scenario: 'scenarioA',
          subkind: 'main'},
        {claimKey: 'lagrange/scenarioB/x', targetId: 'lagrange', scenario: 'scenarioB',
          subkind: 'x'},
        {claimKey: 'citus/scenarioA/main', targetId: 'citus', scenario: 'scenarioA',
          subkind: 'main'}]},
    './benchmark-invalidation-ledger.js': {readInvalidationLedger: () => []},
  };
}

test('an absent stream A owner is record_owner_unavailable', async () => {
  await assert.rejects(loadRawObservationRecordOwner(async () => {
    throw new Error('Cannot find module');
  }), (error) => error.code === 'record_owner_unavailable');
});

test('the campaign outcome admits only the claims this campaign ran', async () => {
  const log = [];
  const all = modules(log);
  const owner = await loadRawObservationRecordOwner(async (specifier) => all[specifier]);
  const result = owner.campaignOutcome({header: {campaignId: 'c'}, runs: [{}, {}],
    file: 'raw.ndjson', rootDir: '/x', manifest: {targets: ['lagrange'],
      runs: [{targetId: 'lagrange', scenario: 'scenarioA', subkind: 'main'}]}});
  assert.deepEqual(log, [['lagrange/scenarioA/main', 2, 1]]);
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(result.cells, [{claimKey: 'lagrange/scenarioA/main',
    status: 'invalid-measurement', reasons: ['r']}]);
});
