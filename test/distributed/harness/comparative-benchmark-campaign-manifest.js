/**
 * The frozen manifest a comparative-benchmark campaign runs from, written and
 * digested BEFORE any run: targets x scenario x subkind x offered rate x
 * repetition in the counter-balanced order of the paired sweep owner
 * (oltp-paired-sweep-plan.js), with every dataset/plan/profile digest taken
 * from the canonical owners (never a label hash, D15), the warm-up and the
 * SLO. Claims that have no execution in this layer are listed as
 * `not-measured` or `blocked` entries, never as knobs on a run (D12, D22).
 */
import {createHash} from 'node:crypto';

import {COMPARISON_VIEW} from './comparative-system-budget.js';
import {
  OLTP_PAIRED_SWEEP_SYSTEM,
  buildScenarioAPairedSweepPlan,
} from './oltp-paired-sweep-plan.js';
import {
  arrayFilter,
  arrayFlatMap,
  arrayIncludes,
  arrayMap,
  stringPadStart,
} from './real-product-captured-intrinsics.js';
import {COMPARATIVE_TARGET} from './real-product-cluster-deployers.js';
import {
  CLAIM_STATUS,
  RUN_CLASS,
  requireCampaignId,
} from './real-product-deployment-contract.js';

const MANIFEST_SCHEMA = 'lagrange-comparative-campaign-manifest/v1';
const SCENARIO_A = 'scenarioA';
const RUN_ORDINAL_WIDTH = 3;

const COMPARATIVE_SMOKE_PROFILE = Object.freeze({
  id: 'comparative-smoke-v1',
  runClass: RUN_CLASS.SMOKE,
  subkind: 'oltp-baseline-smoke',
  campaignBudgetMinutes: 240,
  sweep: Object.freeze({
    comparisonView: COMPARISON_VIEW.ARCHITECTURE_NATIVE,
    offeredRatesPerSec: Object.freeze([5, 10]),
    repetitions: 2,
    slo: Object.freeze({p99Ms: 2000, maxErrorRate: 0.05}),
    workload: Object.freeze({warehouseCount: 1, districtsPerWarehouse: 2,
      customersPerDistrict: 30, itemCount: 200, workers: 4,
      warmupOperationsPerWorker: 10, measurementOperationsPerWorker: 50}),
  }),
});

// Claims with no execution or observation in this layer (scope decision of
// the quest's chain design): each target gets the entry, with its reason.
const UNMEASURED_CLAIMS = Object.freeze([
  ['scenario-c', 'no event ingestion or freshness observation exists'],
  ['scale-out', 'no scale-out execution exists'],
  ['partition-sweep', 'no partition-count execution exists'],
  ['live-movement', 'no observed replica movement during measurement exists'],
  ['rtt-sweep', 'no verified tc-netem sweep is part of the smoke profile'],
  ['recovery', 'no named-component interruption is part of the smoke profile'],
  ['backfill', 'no backfill execution exists'],
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${arrayMap(value, canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${arrayMap(Object.keys(value).sort(),
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function digestCampaignManifest(body) {
  return `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`;
}

function sha(hex) {
  return `sha256:${hex}`;
}

function requireTargets(targets) {
  const known = Object.values(COMPARATIVE_TARGET);
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('a comparative campaign needs at least one target');
  }
  for (const target of targets) {
    if (!arrayIncludes(known, target)) throw new Error(`unknown comparative target ${target}`);
  }
  return [...new Set(targets)];
}

// The sweep owner orders its two systems per repetition; targets outside
// that pair go after them when TiDB leads and before them when Lagrange
// leads, so their position alternates the same way.
function orderedTargets(systemOrder, targets) {
  const paired = arrayFilter(systemOrder, (system) => arrayIncludes(targets, system));
  const others = arrayFilter(targets, (target) => !arrayIncludes(systemOrder, target));
  return systemOrder[0] === OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV ? [...paired, ...others] :
    [...others, ...paired];
}

function planOf(sweep, profile) {
  const identity = sweep.identity;
  return {
    sweepProfileId: sweep.profile.id,
    sweepPlanDigest: sha(sweep.sweepPlanSha256),
    datasetDigest: sha(identity.datasetSha256),
    workloadPlanDigest: sha(identity.workloadPlanSha256),
    measurementPlanDigest: sha(identity.measurementPlanSha256),
    semanticProfileId: identity.semanticProfileId,
    semanticProfileDigest: sha(identity.semanticProfileSha256),
    openLoopProfileId: identity.openLoopProfileId,
    retryPolicyId: identity.retryPolicyId,
    comparisonView: identity.comparisonView,
    slo: identity.slo,
    workload: profile.sweep.workload,
    warmup: {operationsPerWorker: profile.sweep.workload.warmupOperationsPerWorker,
      beforeMeasurement: sweep.profile.warmupBeforeMeasurement},
  };
}

function claimsOf(targets) {
  return arrayFlatMap(targets, (targetId) => [
    targetId === COMPARATIVE_TARGET.LAGRANGE ?
      {targetId, claim: 'scenario-b', status: CLAIM_STATUS.BLOCKED,
        reason: 'no compiled risk service exists for the Lagrange arm'} :
      {targetId, claim: 'scenario-b', status: CLAIM_STATUS.NOT_MEASURED,
        reason: 'comparator arm has no Lagrange counterpart to compare with'},
    ...arrayMap(UNMEASURED_CLAIMS, ([claim, reason]) => ({targetId, claim,
      status: CLAIM_STATUS.NOT_MEASURED, reason})),
  ]);
}

/**
 * @param {{campaignId: string, profile: Object, targets: Array<string>}} input
 * @return {Object} the frozen manifest with its `manifestDigest`
 */
function buildComparativeCampaignManifest({campaignId, profile, targets}) {
  requireCampaignId(campaignId);
  const selected = requireTargets(targets);
  const sweep = buildScenarioAPairedSweepPlan(profile.sweep);
  const runs = [];
  for (const pair of sweep.pairs) {
    for (const targetId of orderedTargets(pair.systemOrder, selected)) {
      const orderIndex = runs.length;
      runs.push({runId: `${campaignId}-r${stringPadStart(String(orderIndex + 1),
        RUN_ORDINAL_WIDTH, '0')}`,
      claimKey: `${targetId}/${SCENARIO_A}/${profile.subkind}/${pair.offeredRatePerSec}/` +
        `${pair.repetition}`,
      targetId, scenario: SCENARIO_A, subkind: profile.subkind,
      offeredRatePerSec: pair.offeredRatePerSec, repetition: pair.repetition, orderIndex,
      freshDeployment: pair.freshDatasetPerSystem});
    }
  }
  const body = {schema: MANIFEST_SCHEMA, campaignId, profileId: profile.id,
    runClass: profile.runClass, campaignBudgetMinutes: profile.campaignBudgetMinutes,
    targets: selected, plan: planOf(sweep, profile), runs, claims: claimsOf(selected)};
  return deepFreeze({...body, manifestDigest: digestCampaignManifest(body)});
}

export {
  COMPARATIVE_SMOKE_PROFILE,
  MANIFEST_SCHEMA as COMPARATIVE_MANIFEST_SCHEMA,
  buildComparativeCampaignManifest,
  canonicalJson,
  digestCampaignManifest,
};
