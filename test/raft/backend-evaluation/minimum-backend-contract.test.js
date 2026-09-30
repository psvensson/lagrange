// The minimum backend contract, derived mechanically and split into the four
// categories the owner named.
//
// The census is regenerated from `src` inside the test, so the contract
// recorded in the evaluation artifact cannot drift from what production
// actually calls. MUST SERVE, MEMBERSHIP-LOCAL DELETE CANDIDATE and
// DIFFERENT IMPLEMENTATION must partition the census exactly; PRODUCTION GAP
// holds what the census does not find. Only MEMBERSHIP-LOCAL DELETE
// CANDIDATE may feed the deletion forecast.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {loadEvaluationArtifact} from './evaluation-artifact.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';

const CONTRACT = Object.freeze({
  SECTION: 'minimumBackendContract',
  MUST_SERVE: 'MUST SERVE',
  MEMBERSHIP_LOCAL: 'MEMBERSHIP-LOCAL DELETE CANDIDATE',
  DIFFERENT_IMPLEMENTATION: 'DIFFERENT IMPLEMENTATION',
  PRODUCTION_GAP: 'PRODUCTION GAP',
  // The owner's narrow list for the delete candidate category.
  NARROW: Object.freeze(['join', 'leave', 'joinPeer', 'nodes']),
});

test('the minimum backend contract is derived from production call sites',
  () => {
    const derived = censusNames(deriveProductionRaftCallCensus());
    assert.ok(derived.nodeMethods.length > 0,
      'the census must find the methods production calls on a raft node');
    assert.ok(derived.providerMethods.length > 0,
      'the census must find the provider seam methods');
    assert.ok(derived.nodeEvents.length > 0,
      'the census must find the events production subscribes to');

    const artifact = loadEvaluationArtifact();
    const contract = artifact[CONTRACT.SECTION];
    assert.ok(contract,
      `the artifact must carry a ${CONTRACT.SECTION} section`);
    assert.deepEqual(contract.observed, derived,
      'the recorded census must equal the census derived from src now');

    const observed = new Set([
      ...derived.nodeMethods,
      ...derived.nodeProperties,
      ...derived.providerMethods,
    ]);
    // FOUR buckets, not three: verification round 2 established that the
    // forced-leader `change` has no raft-rs equivalent at all, so it is a
    // PRODUCTION GAP the census DOES find, not a different implementation
    // of the same capability.
    const buckets = [CONTRACT.MUST_SERVE, CONTRACT.MEMBERSHIP_LOCAL,
      CONTRACT.DIFFERENT_IMPLEMENTATION];
    const seen = new Set();
    for (const bucket of buckets) {
      assert.ok(contract[bucket], `the contract must have a "${bucket}"`);
      assert.equal(typeof contract[bucket].why, 'string',
        `${bucket} must say on what basis it was assigned`);
      for (const name of contract[bucket].names) {
        assert.ok(observed.has(name),
          `${bucket} names ${name}, which the census did not find in src`);
        assert.ok(!seen.has(name), `${name} appears in two categories`);
        seen.add(name);
      }
    }
    const gapNames =
      contract[CONTRACT.PRODUCTION_GAP].namesWithNoRaftRsEquivalent || [];
    assert.ok(gapNames.includes('change'),
      'the forced-leader `change` has no raft-rs equivalent and must be a ' +
      'production gap, not a different implementation');
    for (const name of gapNames) {
      assert.ok(observed.has(name),
        `PRODUCTION GAP names ${name}, which the census did not find in src`);
      assert.ok(!seen.has(name), `${name} appears in two categories`);
      seen.add(name);
    }
    assert.equal(seen.size, observed.size,
      `the four categories must cover the census: ${seen.size} of ` +
      `${observed.size}`);
    assert.equal(contract.coverage.partitionsExactly, true,
      'the recorded coverage must agree that the split is a partition');

    // The delete-candidate category stays narrow, and names its production
    // sites rather than just its census names.
    assert.deepEqual(contract[CONTRACT.MEMBERSHIP_LOCAL].names.sort(),
      [...CONTRACT.NARROW].sort(),
      'the delete-candidate category must stay exactly as narrow as the ' +
      'owner specified');
    assert.ok(contract[CONTRACT.MEMBERSHIP_LOCAL].productionSites.length > 0,
      'it must name the production sites, peer-cache reconciliation ' +
      'included');

    // Each DIFFERENT IMPLEMENTATION group names the raft-rs mechanism.
    for (const group of contract[CONTRACT.DIFFERENT_IMPLEMENTATION].groups) {
      assert.equal(typeof group.capability, 'string',
        'each group must name the capability that remains');
      assert.ok(group.raftRsMechanism.length > 0,
        `${group.capability} must name the raft-rs mechanism serving it`);
    }

    // PRODUCTION GAP: measured absent.
    const gaps = contract[CONTRACT.PRODUCTION_GAP].entries;
    assert.ok(Array.isArray(gaps) && gaps.length > 0,
      'the contract must name what production lacks');
    for (const entry of gaps) {
      // Two kinds of gap: an operation a backend needs and production has
      // no call site for (measured ABSENT), and a name production DOES have
      // for which raft-rs has no equivalent at all. `change` is the second
      // kind, and is named as such.
      assert.ok(!observed.has(entry.operation) ||
        gapNames.includes(entry.operation),
      `${entry.operation} is listed as a gap but the census found it, and ` +
        'it is not named as one raft-rs cannot serve');
      assert.equal(typeof entry.why, 'string',
        `${entry.operation} must record why a backend needs it`);
    }
  });
