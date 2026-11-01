/**
 * The frozen manifest a comparative-benchmark campaign runs from, written and
 * digested BEFORE any run: targets x scenario x subkind x offered rate x
 * repetition in the counter-balanced order of the paired sweep owner
 * (oltp-paired-sweep-plan.js), with every dataset/plan/profile digest taken
 * from the canonical owners (never a label hash, D15), the warm-up and the
 * SLO. Runs carry only those plan variables: claims without execution
 * (Scenario B/C, scale-out, partition, movement, RTT, recovery, backfill) are
 * declared by stream A's coverage manifest (comparative-coverage-manifest.js)
 * as not-measured/blocked cells, never as knobs on a run (D12, D22).
 */
import {createHash} from 'node:crypto';

import {
  BENCHMARK_OPERATION_FAMILY,
  BENCHMARK_WORKLOAD_PROFILE,
} from './benchmark-workload-dispatch.js';
import {benchmarkCanonicalDigest} from './benchmark-operation-outcome.js';
import {COMPARISON_VIEW} from './comparative-system-budget.js';
import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {
  buildOltpBaselinePlan,
  hashOltpBaselineMeasurementPlan,
} from './oltp-baseline-workload.js';
import {OLTP_OPEN_LOOP_PROFILE} from './oltp-open-loop-step-owner.js';
import {OLTP_PAIRED_RETRY_POLICY} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';
import {
  OLTP_PAIRED_SWEEP_SYSTEM,
  buildScenarioAPairedSweepPlan,
} from './oltp-paired-sweep-plan.js';
import {
  arrayIncludes,
  arrayMap,
  stringPadStart,
} from './real-product-captured-intrinsics.js';
import {COMPARATIVE_TARGET} from './real-product-cluster-deployers.js';
import {
  RUN_CLASS,
  requireCampaignId,
} from './real-product-deployment-contract.js';

const MANIFEST_SCHEMA = 'lagrange-comparative-campaign-manifest/v1';
const SCENARIO_A = 'scenarioA';
const RUN_ORDINAL_WIDTH = 3;

const SMOKE_WORKLOAD_PROFILE =
  BENCHMARK_WORKLOAD_PROFILE[BENCHMARK_OPERATION_FAMILY.SCENARIO_A_SMOKE];
const CAPACITY_WORKLOAD_PROFILE =
  BENCHMARK_WORKLOAD_PROFILE[BENCHMARK_OPERATION_FAMILY.SCENARIO_A_OLTP];
const PLAN_KIND = Object.freeze({SMOKE: 'smoke', CAPACITY: 'capacity'});
const SMOKE_EXECUTION_ORDER = 'recorded-not-counterbalanced';

// A smoke campaign is not a comparison: one run per arm at one offered rate,
// in the recorded order of its targets (not counter-balanced), no sweep plan.
const COMPARATIVE_SMOKE_PROFILE = Object.freeze({
  id: 'comparative-smoke-v2',
  supersedes: 'comparative-smoke-v1',
  supersededBecause: 'v1 ran the capacity sweep shape (36 fresh deployments) for a smoke',
  kind: PLAN_KIND.SMOKE,
  comparable: false,
  runClass: RUN_CLASS.SMOKE,
  offeredRatePerSec: 5,
  // The smoke claim of stream A's coverage manifest (scenarioA/smoke, smoke
  // targets lagrange, tidb-tikv, pg-single-primary) and the workload
  // dispatch's smoke family share the subkind; the dispatch owns the workload.
  subkind: 'smoke',
  workloadSubkind: 'smoke',
  workloadProfileId: SMOKE_WORKLOAD_PROFILE.id,
  campaignBudgetMinutes: 60,
  slo: Object.freeze({p99Ms: 2000, maxErrorRate: 0.05}),
  workload: SMOKE_WORKLOAD_PROFILE.workload,
});

// A capacity campaign compares: the v2 paired sweep (counter-balanced system
// order and rate direction, balanced repetitions) over the capacity family.
const COMPARATIVE_CAPACITY_PROFILE = Object.freeze({
  id: 'comparative-capacity-v1',
  kind: PLAN_KIND.CAPACITY,
  comparable: true,
  runClass: RUN_CLASS.PUBLISHABLE,
  profileClass: 'capacity',
  subkind: 'main',
  workloadSubkind: 'main',
  workloadProfileId: CAPACITY_WORKLOAD_PROFILE.id,
  campaignBudgetMinutes: 240,
  slo: Object.freeze({p99Ms: 2000, maxErrorRate: 0.05}),
  workload: SMOKE_WORKLOAD_PROFILE.workload,
  sweep: Object.freeze({
    comparisonView: COMPARISON_VIEW.ARCHITECTURE_NATIVE,
    offeredRatesPerSec: Object.freeze([5, 10]),
  }),
});

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

// The comparison system each target's arm runs (the sweep owner's and the
// workload dispatch's vocabulary). Two PostgreSQL arms in one campaign would
// be one system twice; the sweep owner refuses that.
const SYSTEM_OF_TARGET = Object.freeze({
  [COMPARATIVE_TARGET.LAGRANGE]: OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE,
  [COMPARATIVE_TARGET.TIDB_TIKV]: OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV,
  [COMPARATIVE_TARGET.PG_SINGLE_PRIMARY]: OLTP_PAIRED_SWEEP_SYSTEM.POSTGRESQL,
  [COMPARATIVE_TARGET.PG_SYNC_STANDBY_HA]: OLTP_PAIRED_SWEEP_SYSTEM.POSTGRESQL,
});

// Every system leads equally often and both rate directions are equally
// represented (the sweep owner's rule): the smallest such repetition count.
function minimumRepetitions(systemCount) {
  return systemCount % 2 === 0 ? systemCount : systemCount * 2;
}

// The digests of the canonical owners, without a sweep plan (smoke).
function smokePlanOf(profile, systems) {
  const workloadPlan = buildOltpBaselinePlan(profile.workload);
  return {
    sweepProfileId: null, sweepPlanDigest: null, executionOrder: SMOKE_EXECUTION_ORDER,
    datasetDigest: sha(hashOltpBaselineDataset(buildOltpBaselineDataset(profile.workload))),
    workloadPlanDigest: benchmarkCanonicalDigest(workloadPlan),
    measurementPlanDigest: sha(hashOltpBaselineMeasurementPlan(workloadPlan)),
    semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
    semanticProfileDigest: sha(hashScenarioASemanticProfile()),
    openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id, retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id,
    workloadProfileId: profile.workloadProfileId, systems, profileClass: profile.runClass,
    slo: profile.slo, workload: profile.workload,
    warmup: {operationsPerWorker: profile.workload.warmupOperationsPerWorker,
      beforeMeasurement: true},
  };
}

function runOf({campaignId, profile, targetId, offeredRatePerSec, repetition, orderIndex}) {
  return {runId: `${campaignId}-r${stringPadStart(String(orderIndex + 1),
    RUN_ORDINAL_WIDTH, '0')}`,
  claimKey: `${targetId}/${SCENARIO_A}/${profile.subkind}/${offeredRatePerSec}/${repetition}`,
  targetId, system: SYSTEM_OF_TARGET[targetId], scenario: SCENARIO_A,
  subkind: profile.subkind, workloadSubkind: profile.workloadSubkind,
  offeredRatePerSec, repetition, orderIndex, freshDeployment: true};
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
    workloadProfileId: profile.workloadProfileId,
    systems: identity.systems,
    profileClass: profile.profileClass,
    slo: identity.slo,
    workload: profile.workload,
    warmup: {operationsPerWorker: profile.workload.warmupOperationsPerWorker,
      beforeMeasurement: sweep.profile.warmupBeforeMeasurement},
  };
}

/**
 * @param {{campaignId: string, profile: Object, targets: Array<string>}} input
 * @return {Object} the frozen manifest with its `manifestDigest`
 */
function buildComparativeCampaignManifest({campaignId, profile, targets}) {
  requireCampaignId(campaignId);
  const selected = requireTargets(targets);
  const systems = arrayMap(selected, (target) => SYSTEM_OF_TARGET[target]);
  if (new Set(systems).size !== systems.length) {
    throw new Error('Scenario A campaign compared systems contain duplicates');
  }
  const runs = [];
  let plan;
  if (profile.kind === PLAN_KIND.SMOKE) {
    for (const targetId of selected) {
      runs.push(runOf({campaignId, profile, targetId, repetition: 1,
        offeredRatePerSec: profile.offeredRatePerSec, orderIndex: runs.length}));
    }
    plan = smokePlanOf(profile, systems);
  } else {
    const sweep = buildScenarioAPairedSweepPlan({...profile.sweep, slo: profile.slo,
      workload: profile.workload, systems, repetitions: minimumRepetitions(systems.length)});
    const targetOf = new Map(arrayMap(selected, (target) => [SYSTEM_OF_TARGET[target],
      target]));
    for (const pair of sweep.pairs) {
      for (const targetId of arrayMap(pair.systemOrder, (system) => targetOf.get(system))) {
        runs.push(runOf({campaignId, profile, targetId, repetition: pair.repetition,
          offeredRatePerSec: pair.offeredRatePerSec, orderIndex: runs.length}));
      }
    }
    plan = planOf(sweep, profile);
  }
  const body = {schema: MANIFEST_SCHEMA, campaignId, profileId: profile.id,
    comparable: profile.comparable, runClass: profile.runClass,
    campaignBudgetMinutes: profile.campaignBudgetMinutes, targets: selected, plan, runs};
  return deepFreeze({...body, manifestDigest: digestCampaignManifest(body)});
}

export {
  COMPARATIVE_CAPACITY_PROFILE,
  COMPARATIVE_SMOKE_PROFILE,
  MANIFEST_SCHEMA as COMPARATIVE_MANIFEST_SCHEMA,
  buildComparativeCampaignManifest,
  canonicalJson,
  digestCampaignManifest,
};
