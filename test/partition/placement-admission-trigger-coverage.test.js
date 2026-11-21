// Every outcome code the native placement admission owner can answer has a
// row in the one refusal-to-trigger table (replica-placement-owner-constants.js
// PLACEMENT_CLEARING_TRIGGER: "A code reachable on the admission path without
// a row here is a defect"). The codes are enumerated from their owners'
// vocabularies, never hand-listed, so a code added to any of them without a
// row fails here:
// - PLACEMENT_ADMISSION_ERROR: the admission owner's own refusals (request,
//   committed-command admission of a placement command, replay, repair
//   ingress);
// - PLACEMENT_REFUSAL: the applier's committed refusals (placementResult);
// - PARTITION_WRITE_LEADERSHIP_REFUSAL: the write kernel's answers the owner
//   returns unchanged (leadership, cutover pause, reservation, CDC owed bound,
//   commit outcome).
// The generic committed-command admission codes (command type unknown, entry
// id invalid) are not reachable for a placement command: its type is always a
// placement type and buildPlacementCommand refuses an invalid entryId as BYTES.
//
// REAL: the owners' frozen vocabularies and the trigger table. No services.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PLACEMENT_ADMISSION_ERROR} from
  '../../src/partition/partition-placement-admission-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_REFUSAL, PLACEMENT_TRIGGER} from
  '../../src/rebalancer/replica-placement-owner-constants.js';

const ADMISSION_OWNER_VOCABULARIES = Object.freeze({
  PLACEMENT_ADMISSION_ERROR,
  PLACEMENT_REFUSAL,
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
});
const PROBE_VOCABULARY = 'PROBE';
const PROBE_CODE = 'placement_probe_code_without_trigger_row';

function unmappedCodesOf(vocabularies) {
  return Object.entries(vocabularies).flatMap(([vocabulary, codes]) =>
    Object.entries(codes)
      .filter(([, code]) => !Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, code))
      .map(([name, code]) => `${vocabulary}.${name}=${code}`));
}

test('every outcome code the native placement admission owner can answer has a ' +
  'clearing-trigger row', () => {
  assert.deepEqual(unmappedCodesOf(ADMISSION_OWNER_VOCABULARIES), []);
});

test('the coverage check names a code added without a row, and every row names a ' +
  'declared trigger or a definite answer', () => {
  const probe = unmappedCodesOf({...ADMISSION_OWNER_VOCABULARIES,
    [PROBE_VOCABULARY]: {PROBE_CODE}});
  assert.ok(probe.includes(`${PROBE_VOCABULARY}.PROBE_CODE=${PROBE_CODE}`));
  const declared = new Set(Object.values(PLACEMENT_TRIGGER));
  assert.deepEqual(Object.entries(PLACEMENT_CLEARING_TRIGGER)
    .filter(([, trigger]) => trigger !== null && !declared.has(trigger)), []);
});
