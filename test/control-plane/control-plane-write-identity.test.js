// The held instances of named control-plane writes are bounded and never
// evicted: at the bound a new named write is refused typed before it is
// delivered, and every held unresolved instance keeps its key - its next
// re-drive is still its own entry (never a blind second write).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
  controlPlaneWriteIdentity,
  releaseControlPlaneWriteIdentities,
  runControlPlaneWrite,
} from '../../src/control-plane/control-plane-write-identity.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';

const BOUND = 4096;
const SCOPE = 'identity-bound-witness';
const UNKNOWN_ANSWER = Object.freeze({success: false,
  failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
  entryId: 'entry-unknown'});

test('at the bound a new named write is refused typed before delivery; no ' +
  'unresolved instance is evicted', async () => {
  const keys = [];
  try {
    for (let index = 0; index < BOUND; index += 1) {
      await runControlPlaneWrite(
        {writeIdentity: controlPlaneWriteIdentity(SCOPE, index)},
        {index}, async (key) => {
          keys.push(key);
          return UNKNOWN_ANSWER;
        });
    }
    let delivered = false;
    const refused = await runControlPlaneWrite(
      {writeIdentity: controlPlaneWriteIdentity(SCOPE, 'one-more')},
      {index: 'one-more'}, async () => {
        delivered = true;
        return {success: true};
      });
    assert.equal(delivered, false, 'nothing was delivered');
    assert.equal(refused.success, false, 'refused');
    assert.equal(refused.errorCode, CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
      'typed');
    assert.equal(refused.heldWriteIdentityBound, BOUND, 'it reports the bound');
    assert.equal(refused.heldWriteIdentities, BOUND, 'and what is held');
    let redriveKey = null;
    await runControlPlaneWrite(
      {writeIdentity: controlPlaneWriteIdentity(SCOPE, 0)}, {index: 0},
      async (key) => {
        redriveKey = key;
        return UNKNOWN_ANSWER;
      });
    assert.equal(redriveKey, keys[0], 'the oldest unresolved instance is ' +
      'still held: its re-drive is its own entry');
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
  let afterRelease = null;
  await runControlPlaneWrite(
    {writeIdentity: controlPlaneWriteIdentity(SCOPE, 0)}, {index: 0},
    async (key) => {
      afterRelease = key;
      return {success: true};
    });
  assert.notEqual(afterRelease, keys[0], 'a released name is a new instance');
});
