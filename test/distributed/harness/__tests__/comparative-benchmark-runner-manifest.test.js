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
    const sweep = buildScenarioAPairedSweepPlan({...COMPARATIVE_SMOKE_PROFILE.sweep,
      systems: ['lagrange', 'tidb-tikv', 'postgresql'], repetitions: 6});
    assert.equal(built.plan.datasetDigest, `sha256:${sweep.identity.datasetSha256}`);
    assert.equal(built.plan.workloadPlanDigest, `sha256:${sweep.identity.workloadPlanSha256}`);
    assert.equal(built.plan.sweepPlanDigest, `sha256:${sweep.sweepPlanSha256}`);
    assert.equal(built.plan.semanticProfileDigest,
      `sha256:${sweep.identity.semanticProfileSha256}`);
  });

test('manifest: every target x rate x repetition is a run with a unique runId and ' +
  'claimKey, the system order rotated by the sweep owner', () => {
  const built = manifest();
  const {offeredRatesPerSec} = COMPARATIVE_SMOKE_PROFILE.sweep;
  assert.deepEqual(built.plan.systems, ['lagrange', 'tidb-tikv', 'postgresql']);
  // Three systems lead equally often over both rate directions: 6 repetitions.
  assert.equal(built.runs.length, TARGETS.length * offeredRatesPerSec.length * 6);
  assert.equal(new Set(arrayMap(built.runs, (run) => run.runId)).size, built.runs.length);
  assert.equal(new Set(arrayMap(built.runs, (run) => run.claimKey)).size, built.runs.length);
  const leaderOf = (repetition) => arrayFilter(built.runs,
    (run) => run.repetition === repetition)[0].targetId;
  assert.deepEqual(arrayMap([1, 2, 3], leaderOf),
    ['lagrange', 'tidb-tikv', 'pg-patroni-sync-ha-rf3']);
  assert.ok(arrayEvery(built.runs, (run, index) => run.orderIndex === index &&
    run.workloadSubkind === 'smoke'));
});

test('manifest: the smoke workload is the workload dispatch owner\'s', () => {
  assert.equal(manifest().plan.workloadProfileId, 'scenario-a-smoke-v1');
});

test('manifest: two PostgreSQL arms in one campaign are refused', () => {
  assert.throws(() => buildComparativeCampaignManifest({campaignId: 'bench-m-1',
    profile: COMPARATIVE_SMOKE_PROFILE, targets: ['pg-single-primary',
      'pg-patroni-sync-ha-rf3']}), /duplicates/u);
});

test('D12/D22: runs carry no unobserved knobs; they are all Scenario A smoke', () => {
  // Claims without execution are stream A's coverage-manifest cells, not runs.
  const built = manifest();
  assert.equal(built.claims, undefined);
  const text = JSON.stringify(built.runs);
  for (const knob of ['liveMoveActive', 'partitionCount', 'netDelayMs', 'hopMult']) {
    assert.equal(stringIncludes(text, knob), false, knob);
  }
  assert.ok(arrayEvery(built.runs, (run) => run.scenario === 'scenarioA' &&
    run.subkind === 'smoke'));
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
