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
import fs from 'node:fs';

import {appendEvent, readLog, saveQuest, questFilePath} from './store.js';
import {evaluate} from './probe.js';
import {OSCILLATION_REOPEN_BUDGET} from './constants.js';
import {loadInvariantRegistry} from '../check-invariants.js';
import {
  STATUS, EVAL_EVENT, invariantStreamId, deriveStatus,
} from './invariant-status.js';

// Re-export the leaf status surface so callers keep importing it from here.
export {STATUS, invariantStreamId, deriveStatus};

export const STANDING_INVARIANTS_FLAG = 'LAGRANGE_STANDING_INVARIANTS';
const BREACH_EVENT = 'invariant.breach';
const RESTORATION_LINKED_EVENT = 'invariant.restoration-linked';
const RESTORATION_SKIPPED_EVENT = 'invariant.restoration-skipped';

export function isStandingInvariantsEnabled(env = process.env) {
  return env[STANDING_INVARIANTS_FLAG] === 'true';
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

export function restorationQuestId(invariantId) {
  return `restore-${invariantId}`;
}

// A restoration Quest is an ordinary Quest whose sealed doneWhen is "the invariant
// is HELD" (the invariantHeld probe). Per Requirement 5.3 its SOLVED state does not
// set HELD — a passing re-evaluation does; the probe only reports the folded status.
function restorationQuest(invariant) {
  const id = restorationQuestId(invariant.id);
  const ref = invariant.liveEvidence?.evidence?.ref || 'n/a';
  return {
    id,
    statement: `Restore invariant ${invariant.id} to HELD (breached live-evidence: ${ref}).`,
    priority: 1,
    class: 'process',
    links: {
      roadmapRow: null,
      specRef: '.kiro/specs/standing-invariant-closure',
      closesCL: [],
      parentQuest: null,
      planDoc: '.kiro/specs/standing-invariant-closure/design.md',
      restoresInvariant: invariant.id,
    },
    doneWhen: {probe: 'invariantHeld', args: {id: invariant.id}},
    frontiers: [{
      id: `${id}-main`,
      priority: 1,
      metric: {probe: 'invariantHeld', args: {id: invariant.id}},
    }],
    constraints: [],
  };
}

// Reopen-budget + single-open guard (Requirement 5.2): never run a restoration
// storm. Skip when one restoration Quest is already open for this invariant, or
// when lifetime spawns have hit OSCILLATION_REOPEN_BUDGET.
export function shouldSpawnRestoration(root, invariant) {
  if (fs.existsSync(questFilePath(root, restorationQuestId(invariant.id)))) {
    return {spawn: false, reason: 'a restoration Quest is already open'};
  }
  const spawned = readLog(root, invariantStreamId(invariant.id))
    .filter((event) => event && event.type === RESTORATION_LINKED_EVENT).length;
  if (spawned >= OSCILLATION_REOPEN_BUDGET) {
    return {spawn: false, reason: `reopen budget ${OSCILLATION_REOPEN_BUDGET} exhausted`};
  }
  return {spawn: true, reason: null};
}

// On HELD -> BREACHED: record the breach falsifier, then (when autoSpawn is on and
// the guard allows) link a restoration Quest. Never throws.
export function reactToBreach(root, invariant, transition, env = process.env) {
  appendEvent(root, invariantStreamId(invariant.id), {
    type: BREACH_EVENT,
    invariant: invariant.id,
    from: transition.from,
    to: transition.to,
    evidenceRef: invariant.liveEvidence?.evidence?.ref || null,
  });
  if (!isStandingInvariantsEnabled(env)) return;
  if (!invariant.liveEvidence?.restoration?.autoSpawn) return;
  const decision = shouldSpawnRestoration(root, invariant);
  if (!decision.spawn) {
    appendEvent(root, invariantStreamId(invariant.id), {
      type: RESTORATION_SKIPPED_EVENT, invariant: invariant.id, reason: decision.reason,
    });
    return;
  }
  const quest = restorationQuest(invariant);
  saveQuest(root, quest);
  appendEvent(root, invariantStreamId(invariant.id), {
    type: RESTORATION_LINKED_EVENT, invariant: invariant.id, quest: quest.id,
  });
}

// Evaluate one invariant, record the verdict, and react to a fresh breach. Returns
// the {from,to} transition. Shared by the trigger and the `invariants` command.
export function evaluateAndRecord(root, invariant, env = process.env) {
  const before = deriveStatus(root, invariant).status;
  recordEvaluation(root, invariant, evaluateInvariant(invariant, {root}));
  const after = deriveStatus(root, invariant).status;
  if (before !== STATUS.BREACHED && after === STATUS.BREACHED) {
    reactToBreach(root, invariant, {from: before, to: after}, env);
  }
  return {id: invariant.id, from: before, to: after};
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
    try {
      transitions.push(evaluateAndRecord(root, invariant, env));
    } catch {
      continue;
    }
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
      evaluateAndRecord(root, invariant, env);
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
