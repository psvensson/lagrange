import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// One machine-readable verdict for a five-node formation, derived from the
// seed's log and the schema-admission evidence the demo already collects.
// The verdict names the causal chain the 2026-09-05 forensics derived by
// hand (seed event-loop starvation -> node ready leases incomplete ->
// critical system-partition spread never plans -> schema admission denied)
// so a failed run explains itself, and a passing run still reports the
// seed's blocked time so a trend can see starvation before it fails a run.
const FORMATION_VERDICT_SCHEMA_VERSION = 1;
const SEED_LOG_FILE = 'node-0.log';
const GAP_LOG_MSG = 'Event loop gap detected';
const LEASE_WAIT_MSG_PREFIX =
  'Waiting for transitional cluster membership to settle';
const MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const DEFAULT_MACHINE_FACTOR = 1;
// Seed unexplained blocked time allowed inside the formation window on the
// reference box; scaled by LAGRANGE_TEST_MACHINE_FACTOR like every other
// hardware-relative budget. A quarter of the window blocked is the point at
// which lease and heartbeat cadences stop being meetable.
const BASE_MAX_BLOCKED_MS = 10000;
const MAX_BLOCKED_PERCENT = 25;
const TOP_SITE_COUNT = 5;
const PERCENT = 100;
const NOT_OBSERVED = null;

const FORMATION_VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNKNOWN: 'UNKNOWN',
});

const FORMATION_VERDICT_REASON = Object.freeze({
  SCHEMA_ADMITTED: 'schema_admitted',
  SEED_STARVED: 'seed_event_loop_starved',
  READY_LEASE_INCOMPLETE: 'node_ready_lease_incomplete',
  CRITICAL_SPREAD_OPEN: 'critical_system_spread_open',
  ADMISSION_BLOCKED: 'schema_admission_blocked',
  SEED_LOG_UNAVAILABLE: 'seed_log_unavailable',
});

const CAUSAL_STAGE = Object.freeze({
  SEED_EVENT_LOOP: 'seed_event_loop',
  NODE_READY_LEASE: 'node_ready_lease',
  CRITICAL_SPREAD: 'critical_system_spread',
  SCHEMA_ADMISSION: 'schema_admission',
});

// A transition observed the critical topology only when the transition
// itself is not an observation failure and its topology reading says
// available (or predates the field): an observation_unavailable transition
// carries a placeholder gap (0 or the last value) with no in-flight count and
// must never read as a closed spread.
const TOPOLOGY_OBSERVATION_AVAILABLE = 'available';
const TRANSITION_OBSERVATION_UNAVAILABLE = 'observation_unavailable';

const WINDOW_SOURCE = Object.freeze({
  DEMO_PHASE_TIMING: 'demo_phase_timing',
  ADMISSION_FIRST_OBSERVATION: 'admission_first_observation',
  LOG_SPAN: 'log_span',
});

function parseLogEntries(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.includes('"time"')) continue;
    try {
      const entry = JSON.parse(line);
      const timeMs = Date.parse(entry?.time);
      if (Number.isFinite(timeMs)) entries.push({timeMs, entry});
    } catch (_error) {
      // Interleaved plain-text console output is not evidence.
    }
  }
  return entries;
}

function resolveFormationSeedBudget(environment = process.env) {
  const parsed = Number(environment?.[MACHINE_FACTOR_ENV]);
  const machineFactor = Number.isFinite(parsed) && parsed > 0 ?
    parsed : DEFAULT_MACHINE_FACTOR;
  return Object.freeze({
    machineFactor,
    maxBlockedMs: BASE_MAX_BLOCKED_MS * machineFactor,
    maxBlockedPercent: MAX_BLOCKED_PERCENT,
  });
}

function firstTransitionObservedAtMs(schemaAdmission) {
  const transitions = schemaAdmission?.transitionHistory?.transitions;
  const first = Array.isArray(transitions) ? transitions[0] : null;
  return Number.isFinite(first?.firstObservedAtMs) ?
    first.firstObservedAtMs : NOT_OBSERVED;
}

// The formation window is the span the seed spent forming the cluster: the
// demo's own phase timing when it recorded one, else the first admission
// observation (polling starts once every node is ACTIVE), else the seed's
// whole logged lifespan.
function resolveFormationWindow(entries, formation, schemaAdmission) {
  const firstMs = entries.length > 0 ? entries[0].timeMs : NOT_OBSERVED;
  const lastMs = entries.length > 0 ?
    entries[entries.length - 1].timeMs : NOT_OBSERVED;
  const startMs = Number.isFinite(formation?.clusterStartedAtMs) ?
    formation.clusterStartedAtMs : firstMs;
  if (Number.isFinite(formation?.clusterFormedAtMs)) {
    return {
      startMs, endMs: formation.clusterFormedAtMs,
      source: WINDOW_SOURCE.DEMO_PHASE_TIMING,
    };
  }
  const admissionStartMs = firstTransitionObservedAtMs(schemaAdmission);
  if (admissionStartMs !== NOT_OBSERVED) {
    return {
      startMs, endMs: admissionStartMs,
      source: WINDOW_SOURCE.ADMISSION_FIRST_OBSERVATION,
    };
  }
  return {startMs, endMs: lastMs, source: WINDOW_SOURCE.LOG_SPAN};
}

function inWindow(timeMs, window) {
  return timeMs >= window.startMs && timeMs <= window.endMs;
}

function accumulateSites(siteTotals, siteDeltas) {
  for (const delta of Array.isArray(siteDeltas) ? siteDeltas : []) {
    const site = String(delta?.site || '');
    if (!site) continue;
    const current = siteTotals.get(site) || {site, totalMs: 0, count: 0};
    current.totalMs += Number(delta.totalMs) || 0;
    current.count += Number(delta.count) || 0;
    siteTotals.set(site, current);
  }
}

function summarizeSeedGaps(entries, window) {
  const gaps = {
    gapCount: 0, totalGapMs: 0, unexplainedMs: 0, maxGapMs: 0,
    blockedPercentOfWindow: NOT_OBSERVED, topSites: [],
  };
  const siteTotals = new Map();
  for (const {timeMs, entry} of entries) {
    if (entry?.msg !== GAP_LOG_MSG || !inWindow(timeMs, window)) continue;
    const gapMs = Number(entry.gapMs) || 0;
    gaps.gapCount += 1;
    gaps.totalGapMs += gapMs;
    gaps.unexplainedMs +=
      Number.isFinite(entry.unexplainedMs) ? entry.unexplainedMs : gapMs;
    gaps.maxGapMs = Math.max(gaps.maxGapMs, gapMs);
    accumulateSites(siteTotals, entry.siteDeltas);
  }
  const windowMs = window.endMs - window.startMs;
  if (windowMs > 0) {
    gaps.blockedPercentOfWindow = (gaps.unexplainedMs / windowMs) * PERCENT;
  }
  gaps.topSites = [...siteTotals.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, TOP_SITE_COUNT);
  return gaps;
}

function summarizeLeaseWaits(entries, seedNodeId) {
  const waits = {
    count: 0, firstAtMs: NOT_OBSERVED, lastAtMs: NOT_OBSERVED,
    maxUnreadyCount: 0, lastUnreadyNodeIds: [], seedUnreadyCount: 0,
    blockerReasons: {},
  };
  for (const {timeMs, entry} of entries) {
    if (!String(entry?.msg || '').startsWith(LEASE_WAIT_MSG_PREFIX)) continue;
    const unready = Array.isArray(entry.unreadyNodeIds) ?
      entry.unreadyNodeIds.map(String) : [];
    waits.count += 1;
    if (waits.firstAtMs === NOT_OBSERVED) waits.firstAtMs = timeMs;
    waits.lastAtMs = timeMs;
    waits.maxUnreadyCount = Math.max(waits.maxUnreadyCount, unready.length);
    waits.lastUnreadyNodeIds = unready;
    if (seedNodeId && unready.includes(seedNodeId)) waits.seedUnreadyCount += 1;
    const reason = String(entry.blockerReason || '');
    if (reason) {
      waits.blockerReasons[reason] = (waits.blockerReasons[reason] || 0) + 1;
    }
  }
  return waits;
}

function transitionsOf(schemaAdmission) {
  const transitions = schemaAdmission?.transitionHistory?.transitions;
  return Array.isArray(transitions) ? transitions : [];
}

// The spread reading is the LAST transition that actually observed the
// critical topology: the terminal control_plane_pressure transition reports
// the snapshot lane as unavailable (gap 0, in-flight null) and would hide a
// spread that stayed open for the whole run.
function summarizeCriticalSpread(schemaAdmission) {
  const topology = schemaAdmission?.snapshot?.criticalSystemTopology || null;
  const transitions = transitionsOf(schemaAdmission);
  let observed = null;
  let openObservationCount = 0;
  let maxSpreadGap = NOT_OBSERVED;
  for (const transition of transitions) {
    const topologyReading = transition?.criticalSystemTopology || null;
    const gap = topologyReading?.prioritySpreadGap;
    const isObserved = Number.isFinite(gap) &&
      transition.state !== TRANSITION_OBSERVATION_UNAVAILABLE && (
      topologyReading.observationState === undefined ||
        topologyReading.observationState === TOPOLOGY_OBSERVATION_AVAILABLE);
    if (!isObserved) continue;
    observed = transition;
    maxSpreadGap = Math.max(maxSpreadGap ?? gap, gap);
    if (gap > 0) openObservationCount += Number(transition.observationCount) || 0;
  }
  const observedGap = observed?.criticalSystemTopology?.prioritySpreadGap;
  return {
    ready: topology?.ready === true,
    observationState: topology?.observationState ?? NOT_OBSERVED,
    finalSpreadGap: Number.isFinite(observedGap) ? observedGap : NOT_OBSERVED,
    maxSpreadGap,
    openObservationCount,
    inFlightCount: Number.isFinite(observed?.effectiveInFlightCount) ?
      observed.effectiveInFlightCount : NOT_OBSERVED,
    transitionCount: transitions.length,
  };
}

// The timeout error's admission object carries `state`; the admitted wait
// result carries only the snapshot, so the snapshot state is the fallback.
function summarizeAdmission(schemaAdmission) {
  return {
    admitted: schemaAdmission?.admitted === true,
    state: schemaAdmission?.state ??
      schemaAdmission?.snapshot?.state ?? NOT_OBSERVED,
    canonicalBlocker:
      schemaAdmission?.snapshot?.canonicalBlocker ?? NOT_OBSERVED,
    reasonCodes: Array.isArray(schemaAdmission?.snapshot?.reasonCodes) ?
      [...schemaAdmission.snapshot.reasonCodes] : [],
  };
}

function isSeedStarved(gaps, budget) {
  return gaps.unexplainedMs > budget.maxBlockedMs ||
    (gaps.blockedPercentOfWindow !== NOT_OBSERVED &&
      gaps.blockedPercentOfWindow > budget.maxBlockedPercent);
}

function decideReason({admission, seedStarved, leaseWaits, spread}) {
  if (admission.admitted) return FORMATION_VERDICT_REASON.SCHEMA_ADMITTED;
  if (seedStarved) return FORMATION_VERDICT_REASON.SEED_STARVED;
  if (leaseWaits.count > 0 && leaseWaits.maxUnreadyCount > 0) {
    return FORMATION_VERDICT_REASON.READY_LEASE_INCOMPLETE;
  }
  if (Number.isFinite(spread.finalSpreadGap) && spread.finalSpreadGap > 0) {
    return FORMATION_VERDICT_REASON.CRITICAL_SPREAD_OPEN;
  }
  return FORMATION_VERDICT_REASON.ADMISSION_BLOCKED;
}

function buildCausalChain({window, gaps, seedStarved, leaseWaits, spread,
  admission}) {
  const windowMs = window.endMs - window.startMs;
  return Object.freeze([
    Object.freeze({
      stage: CAUSAL_STAGE.SEED_EVENT_LOOP,
      broken: seedStarved,
      detail: `${gaps.gapCount} gaps, ${gaps.unexplainedMs} ms unexplained ` +
        `of a ${windowMs} ms formation window (max ${gaps.maxGapMs} ms)`,
    }),
    // Settle waits and an open spread are normal WHILE forming; they are
    // broken links only when admission never came.
    Object.freeze({
      stage: CAUSAL_STAGE.NODE_READY_LEASE,
      broken: !admission.admitted && leaseWaits.count > 0 &&
        leaseWaits.maxUnreadyCount > 0,
      detail: `${leaseWaits.count} settle waits, up to ` +
        `${leaseWaits.maxUnreadyCount} nodes unready, seed unready in ` +
        `${leaseWaits.seedUnreadyCount}`,
    }),
    Object.freeze({
      stage: CAUSAL_STAGE.CRITICAL_SPREAD,
      broken: !admission.admitted &&
        Number.isFinite(spread.finalSpreadGap) && spread.finalSpreadGap > 0,
      detail: `last observed spread gap ${spread.finalSpreadGap} (max ` +
        `${spread.maxSpreadGap}, ${spread.openObservationCount} open ` +
        `observations), ${spread.inFlightCount} operations in flight`,
    }),
    Object.freeze({
      stage: CAUSAL_STAGE.SCHEMA_ADMISSION,
      broken: !admission.admitted,
      detail: `${admission.state} (${admission.canonicalBlocker ?? 'none'})`,
    }),
  ]);
}

/**
 * Derive the formation verdict from the seed log text and the demo's
 * schema-admission evidence. Pure: no I/O.
 * @param {Object} options
 * @param {string} options.seedLogText
 * @param {Object|null} [options.schemaAdmission]
 * @param {Object|null} [options.formation] {clusterStartedAtMs, clusterFormedAtMs}
 * @param {Object} [options.environment]
 * @return {Object}
 */
function deriveFormationVerdict({
  seedLogText, schemaAdmission = null, formation = null,
  environment = process.env,
} = {}) {
  const budget = resolveFormationSeedBudget(environment);
  const entries = parseLogEntries(seedLogText);
  const admission = summarizeAdmission(schemaAdmission);
  if (entries.length === 0) {
    return Object.freeze({
      schemaVersion: FORMATION_VERDICT_SCHEMA_VERSION,
      verdict: FORMATION_VERDICT.UNKNOWN,
      reason: FORMATION_VERDICT_REASON.SEED_LOG_UNAVAILABLE,
      seedStarved: NOT_OBSERVED,
      budget,
      admission,
    });
  }
  const seedNodeId = String(entries[0].entry?.nodeId || '');
  const window = resolveFormationWindow(entries, formation, schemaAdmission);
  const gaps = summarizeSeedGaps(entries, window);
  const leaseWaits = summarizeLeaseWaits(entries, seedNodeId);
  const spread = summarizeCriticalSpread(schemaAdmission);
  const seedStarved = isSeedStarved(gaps, budget);
  const reason = decideReason({admission, seedStarved, leaseWaits, spread});
  return Object.freeze({
    schemaVersion: FORMATION_VERDICT_SCHEMA_VERSION,
    verdict: admission.admitted ?
      FORMATION_VERDICT.PASS : FORMATION_VERDICT.FAIL,
    reason,
    seedStarved,
    budget,
    seedNodeId,
    window: {...window, windowMs: window.endMs - window.startMs},
    seedGaps: gaps,
    leaseWaits,
    criticalSpread: spread,
    admission,
    causalChain: buildCausalChain({
      window, gaps, seedStarved, leaseWaits, spread, admission,
    }),
  });
}

/**
 * Read the seed log under the demo's data root and derive the verdict. A
 * missing or unreadable seed log yields an UNKNOWN verdict, never a PASS.
 * @param {string} dataRoot
 * @param {Object} [options] {schemaAdmission, formation, environment}
 * @return {Promise<Object>}
 */
async function collectFormationVerdict(dataRoot, options = {}) {
  let seedLogText = '';
  try {
    seedLogText = await readFile(resolve(dataRoot, SEED_LOG_FILE), 'utf8');
  } catch (_error) {
    seedLogText = '';
  }
  return deriveFormationVerdict({...options, seedLogText});
}

export {
  CAUSAL_STAGE,
  FORMATION_VERDICT,
  FORMATION_VERDICT_REASON,
  FORMATION_VERDICT_SCHEMA_VERSION,
  collectFormationVerdict,
  deriveFormationVerdict,
  resolveFormationSeedBudget,
};
