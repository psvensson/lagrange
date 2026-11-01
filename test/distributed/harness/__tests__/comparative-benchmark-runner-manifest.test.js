// D12/D15/D22: the campaign is driven by a frozen manifest written and
// digested before any run; digests come from the canonical owners; claims
// with no execution are not-measured, never a knob on a run.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
  digestCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {buildScenarioAPairedSweepPlan} from '../oltp-paired-sweep-plan.js';
import {
  arrayEvery,
  arrayFilter,
  arrayMap,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';

const TARGETS = ['lagrange', 'tidb-tikv', 'pg-patroni-sync-ha-rf3'];

function manifest() {
  return buildComparativeCampaignManifest({campaignId: 'bench-m-1',
    profile: COMPARATIVE_SMOKE_PROFILE, targets: TARGETS});
}

test('D15: dataset and plan digests come from the canonical owners, not label hashes',
  () => {
    const built = manifest();
    const sweep = buildScenarioAPairedSweepPlan(COMPARATIVE_SMOKE_PROFILE.sweep);
    assert.equal(built.plan.datasetDigest, `sha256:${sweep.identity.datasetSha256}`);
    assert.equal(built.plan.workloadPlanDigest, `sha256:${sweep.identity.workloadPlanSha256}`);
    assert.equal(built.plan.sweepPlanDigest, `sha256:${sweep.sweepPlanSha256}`);
    assert.equal(built.plan.semanticProfileDigest,
      `sha256:${sweep.identity.semanticProfileSha256}`);
  });

test('manifest: every target x rate x repetition is a run with a unique runId and ' +
  'claimKey, counter-balanced by the sweep owner', () => {
  const built = manifest();
  const {offeredRatesPerSec, repetitions} = COMPARATIVE_SMOKE_PROFILE.sweep;
  assert.equal(built.runs.length, TARGETS.length * offeredRatesPerSec.length * repetitions);
  assert.equal(new Set(arrayMap(built.runs, (run) => run.runId)).size, built.runs.length);
  assert.equal(new Set(arrayMap(built.runs, (run) => run.claimKey)).size, built.runs.length);
  const targetsOf = (repetition) => arrayMap(arrayFilter(built.runs,
    (run) => run.repetition === repetition), (run) => run.targetId);
  const firstRep = targetsOf(1);
  const secondRep = targetsOf(2);
  assert.notEqual(firstRep[0], secondRep[0], 'system order alternates per repetition');
  assert.ok(arrayEvery(built.runs, (run, index) => run.orderIndex === index));
});

test('D12/D22: runs carry no unobserved knobs; they are all Scenario A main', () => {
  // Claims without execution are stream A's coverage-manifest cells, not runs.
  const built = manifest();
  assert.equal(built.claims, undefined);
  const text = JSON.stringify(built.runs);
  for (const knob of ['liveMoveActive', 'partitionCount', 'netDelayMs', 'hopMult']) {
    assert.equal(stringIncludes(text, knob), false, knob);
  }
  assert.ok(arrayEvery(built.runs, (run) => run.scenario === 'scenarioA' &&
    run.subkind === 'main'));
  assert.equal(built.plan.profileClass, 'smoke');
});

test('manifest: frozen and digested; any change changes the digest', () => {
  const built = manifest();
  assert.ok(Object.isFrozen(built) && Object.isFrozen(built.runs));
  assert.match(built.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
  const {manifestDigest, ...body} = built;
  assert.equal(digestCampaignManifest(body), manifestDigest);
  assert.notEqual(digestCampaignManifest({...body, campaignId: 'bench-m-2'}), manifestDigest);
});

test('manifest: an unknown target is refused', () => {
  assert.throws(() => buildComparativeCampaignManifest({campaignId: 'bench-m-1',
    profile: COMPARATIVE_SMOKE_PROFILE, targets: ['citus-sql-service']}),
  /unknown comparative target/u);
});
