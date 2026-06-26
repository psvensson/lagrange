// Tier-2 (live-evidence) verification for architecture invariants — the standing
// dual of a Quest's doneWhen (spec: .kiro/specs/standing-invariant-closure/).
//
// It reads architecture/contracts/invariants.json entries that carry a
// `liveEvidence` block, evaluates each against live evidence (a deterministic
// repro/command, or a probe), records the verdict as an event through the Solver
// event-log store, and derives HELD/BREACHED/UNGUARDED as a FOLD over that log.
// Status is never stored on the entry and there is no new store — the only
// persisted side effect is an append to the Solver event log.
//
// Gated behind LAGRANGE_STANDING_INVARIANTS (default-off): off => inert, no
// evaluation, no writes, no behavior change.

import {spawnSync} from 'node:child_process';

import {appendEvent, readLog} from './store.js';
import {evaluate} from './probe.js';
import {loadInvariantRegistry} from '../check-invariants.js';

export const STANDING_INVARIANTS_FLAG = 'LAGRANGE_STANDING_INVARIANTS';
export const STATUS = Object.freeze({
  UNGUARDED: 'UNGUARDED',
  HELD: 'HELD',
  BREACHED: 'BREACHED',
});
const EVAL_EVENT = 'invariant.evaluated';

export function isStandingInvariantsEnabled(env = process.env) {
  return env[STANDING_INVARIANTS_FLAG] === 'true';
}

// The event-log stream id for an invariant. Reuses the Solver store; the
// `invariant-` prefix namespaces these streams away from quest streams.
export function invariantStreamId(invariantId) {
  return `invariant-${invariantId}`;
}

// Registry entries that opted into Tier-2 live verification.
export function liveInvariants(registry) {
  const list = registry && Array.isArray(registry.invariants) ?
    registry.invariants : [];
  return list.filter(
    (entry) => entry && entry.liveEvidence &&
      typeof entry.liveEvidence === 'object');
}

// Evaluate one invariant's liveEvidence predicate against live evidence.
// repro/command kinds run the referenced command (exit 0 = holds); probe kind
// reuses the doneWhen evaluator (no second evaluation path). Returns
// {verdict:'pass'|'fail', ...}.
export function evaluateInvariant(invariant, ctx = {}) {
  const evidence = invariant.liveEvidence?.evidence || {};
  const kind = evidence.kind;
  if (kind === 'repro' || kind === 'command') {
    if (typeof evidence.ref !== 'string' || evidence.ref.trim() === '') {
      throw new Error(
        `invariant ${invariant.id}: liveEvidence.evidence.ref is required for ` +
        `kind ${kind}`);
    }
    const root = ctx.root || process.cwd();
    const result = spawnSync(evidence.ref, {cwd: root, shell: true, stdio: 'ignore'});
    const exitCode = result.status;
    return {
      verdict: exitCode === 0 ? 'pass' : 'fail',
      exitCode,
      evidenceRef: evidence.ref,
      kind,
    };
  }
  if (kind === 'probe') {
    const out = evaluate({probe: evidence.probe, args: evidence.args || {}}, ctx);
    return {verdict: out.done ? 'pass' : 'fail', evidenceRef: evidence.probe, kind};
  }
  throw new Error(
    `invariant ${invariant.id}: unsupported liveEvidence.evidence.kind ${kind}`);
}

// Record an evaluation verdict to the event log (the only persisted side effect).
export function recordEvaluation(root, invariant, result) {
  return appendEvent(root, invariantStreamId(invariant.id), {
    type: EVAL_EVENT,
    invariant: invariant.id,
    verdict: result.verdict,
    exitCode: result.exitCode ?? null,
    evidenceRef: result.evidenceRef ?? null,
  });
}

// Derive status as a fold over the event log: latest verdict wins; none =>
// UNGUARDED. The fold is the single source of truth for status.
export function deriveStatus(root, invariant) {
  const log = readLog(root, invariantStreamId(invariant.id));
  const evaluations = log.filter((event) => event && event.type === EVAL_EVENT);
  if (evaluations.length === 0) {
    return {
      id: invariant.id, status: STATUS.UNGUARDED, at: null, verdict: null,
      evidenceRef: null, evaluations: 0,
    };
  }
  const last = evaluations[evaluations.length - 1];
  return {
    id: invariant.id,
    status: last.verdict === 'pass' ? STATUS.HELD : STATUS.BREACHED,
    at: last.ts || null,
    verdict: last.verdict,
    evidenceRef: last.evidenceRef || null,
    evaluations: evaluations.length,
  };
}

// Per-event trigger policies fire on a discrete event (not a cadence).
const PER_EVENT_POLICIES = new Set(['on-quest-closure', 'on-touched-owner']);

export function isPerEventPolicy(policy) {
  return PER_EVENT_POLICIES.has(policy);
}

// Requirement 6.3: an expensive predicate may not bind to a per-event trigger —
// it must run on a cadence. Returns a violation message, or null when allowed.
export function triggerCostViolation(invariant) {
  const trigger = invariant.liveEvidence?.trigger || {};
  if (trigger.cost === 'expensive' && isPerEventPolicy(trigger.policy)) {
    return `invariant ${invariant.id}: expensive predicate cannot use per-event ` +
      `trigger ${trigger.policy} (use on-cadence)`;
  }
  return null;
}

// Scope tokens a closing quest exposes to the trigger. A quest opts a scope in via
// its owner or an explicit `touchesInvariantScopes` list.
export function questScopes(quest) {
  if (!quest || typeof quest !== 'object') return [];
  const scopes = [`quest:${quest.id}`];
  if (quest.owner) scopes.push(`owner:${quest.owner}`);
  if (Array.isArray(quest.touchesInvariantScopes)) {
    scopes.push(...quest.touchesInvariantScopes);
  }
  return scopes;
}

function scopeMatches(invariant, scopes) {
  const scope = invariant.liveEvidence?.trigger?.scope;
  if (!scope || scope === '*') return true;
  return Array.isArray(scopes) && scopes.includes(scope);
}

// on-quest-closure trigger: evaluate + record every matching invariant and return
// the status transitions. Expensive per-event predicates are skipped (guarded);
// inert when the flag is off. Never throws on a single invariant's failure.
export function triggerOnQuestClosure(
  root, {scopes = [], registry: registryPath} = {}, env = process.env) {
  if (!isStandingInvariantsEnabled(env)) return {fired: false, transitions: []};
  const {registry} = loadInvariantRegistry(registryPath);
  const transitions = [];
  for (const invariant of liveInvariants(registry)) {
    const trigger = invariant.liveEvidence?.trigger || {};
    if (trigger.policy !== 'on-quest-closure') continue;
    if (triggerCostViolation(invariant)) continue;
    if (!scopeMatches(invariant, scopes)) continue;
    const before = deriveStatus(root, invariant).status;
    try {
      recordEvaluation(root, invariant, evaluateInvariant(invariant, {root}));
    } catch {
      continue;
    }
    const after = deriveStatus(root, invariant).status;
    transitions.push({id: invariant.id, from: before, to: after});
  }
  return {fired: true, transitions};
}

// The `solve invariants` command body. Default: render derived status from the
// event log. With `--evaluate`: run each invariant's predicate first, record the
// verdict, then render. Flag off: inert.
export function runInvariantsCommand(root, args = {}, env = process.env) {
  if (!isStandingInvariantsEnabled(env)) {
    return {
      enabled: false,
      note: `standing invariants disabled — set ${STANDING_INVARIANTS_FLAG}=true to enable`,
      invariants: [],
    };
  }
  const {registry} = loadInvariantRegistry(args.registry);
  const entries = liveInvariants(registry);
  const evaluateNow = Boolean(args.evaluate);
  const invariants = entries.map((invariant) => {
    if (evaluateNow) {
      recordEvaluation(root, invariant, evaluateInvariant(invariant, {root}));
    }
    const derived = deriveStatus(root, invariant);
    const live = invariant.liveEvidence || {};
    return {
      ...derived,
      owner: invariant.owner,
      boundary: invariant.boundary,
      kind: invariant.kind,
      tier: live.tier ?? 2,
      cost: live.trigger?.cost ?? null,
      trigger: live.trigger?.policy ?? null,
    };
  });
  return {enabled: true, evaluated: evaluateNow, invariants};
}
