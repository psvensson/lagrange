// The formation attribution census: who owned every turn, and why.
//
// OBSERVATION ONLY. It opens a window around the formation cone, wraps the
// accounting owner's hook factory and its run() to see what it already does,
// and delegates in every case. No owner assignment is altered to obtain a
// reading, and nothing here can name an owner.
//
// The window is production's window. Production ends formation attribution at
// the "Cluster formed." mark and treats what follows - schema admission,
// later runtime work, shutdown - as something else. The simulator's
// counterpart of that mark is D's write-authority handoff, and the census
// stops at the first quiescent point after it, exactly as the live
// calibration takes the first attribution snapshot after the formed mark.
// Teardown is still measured, still deterministic and still required to reach
// zero pending work - it is simply not part of the formation owner census.
//
// Three things were learned the hard way and are encoded here:
//
//   The production module graph is loaded BEFORE the window opens. Loading a
//   few hundred ES modules is thousands of promise-resolution steps with no
//   repository frame, and counting them measures the loader.
//
//   The deterministic owner guard wraps the global timer functions, so its
//   frame masks whoever armed the timer. It is a transparent interceptor,
//   like this census's own hook, and is seen through.
//
//   An explicit entry from a neutral parent is recorded in NEITHER of the
//   accounting owner's counters, so where a lineage was entered cannot be
//   recovered from a snapshot. The entry is observed directly.
import {createHook} from 'node:async_hooks';
import {createHash} from 'node:crypto';

import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  CLASSIFICATION, classifyUnownedTurn,
} from './formation-attribution-provenance-classify.js';

const ZERO = 0;
const ONE = 1;
const ANCESTRY_LIMIT = 8192;
const DIGEST_LENGTH = 16;
const STACK_DEPTH = 64;
const UNATTRIBUTED = FORMATION_OWNER.UNATTRIBUTED;
const NATIVE = 'native';
const NODE_MODULES = 'node_modules';
const ENTRY = 'entry';
const HANDOFF = 'handoff';
const FORMATION = 'formation';
const TEARDOWN = 'teardown';
const SEALED = 'sealed';
const FORMATION_END_REASON =
  'D write-authority handoff settled: the simulator counterpart of the ' +
  'production "Cluster formed." mark';
const FRAME_PATTERN = /\(?(file:\/\/)?(\/[^ )]+\.m?js):(\d+):\d+\)?$/u;
const REPO_ROOT =
  new URL('../../', import.meta.url).pathname.replace(/\/$/u, '');
const STRICT_PATTERN =
  /violations=(\d+) substitutions=(\d+) eligible=(true|false)/u;
const PEER_REPRESENTATION_PREFIX = 'src/raft/remote-peer-representation';
// Transparent interceptors: a frame belonging to one of these is machinery
// standing in front of the code that created the resource, never that code.
const INTERCEPTOR_PREFIX = Object.freeze([
  'src/diagnostics/formation-turn-attribution',
  'test/simulation/formation-sim-guard',
  'test/simulation/formation-attribution-provenance',
]);
// Generic machinery that transports execution. None of it may be seen naming
// an owner.
const CARRIER_PREFIX = Object.freeze([
  'test/distributed/harness/virtual-network',
  'test/simulation/formation-sim-quiescence',
  'test/simulation/formation-sim-host-transcript',
  PEER_REPRESENTATION_PREFIX,
]);

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function repoFrames() {
  const previousLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = STACK_DEPTH;
  const stack = stringSplit(new Error().stack, '\n');
  Error.stackTraceLimit = previousLimit;
  const frames = [];
  for (const line of stack) {
    const match = FRAME_PATTERN.exec(line.trim());
    if (!match) continue;
    const file = match[2];
    if (file.includes('/node_modules/')) {
      frames.push(NODE_MODULES);
      continue;
    }
    if (!stringStartsWith(file, REPO_ROOT)) continue;
    frames.push(`${file.slice(REPO_ROOT.length + ONE)}:${match[3]}`);
  }
  return arrayFilter(frames, (frame) =>
    !arraySome(INTERCEPTOR_PREFIX,
      (prefix) => stringStartsWith(frame, prefix)));
}

function firstRepoFrame() {
  const frames = repoFrames();
  return frames.length === ZERO ? NATIVE : frames[ZERO];
}

function fileOf(frame) {
  return stringSplit(frame, ':')[ZERO];
}

function digestOf(text) {
  return createHash('sha256').update(text).digest('hex').slice(ZERO,
    DIGEST_LENGTH);
}

function framedAncestor(site, trigger, asyncId) {
  let id = asyncId;
  let guard = ZERO;
  while (id !== undefined && guard < ANCESTRY_LIMIT) {
    const own = site.get(id);
    if (own && own !== NATIVE && own !== NODE_MODULES) return own;
    id = trigger.get(id);
    guard += ONE;
  }
  return site.get(asyncId) ?? NATIVE;
}

function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? ZERO) + ONE);
}

function createRecorder() {
  return {
    ambiguous: ZERO,
    carrierAssignments: ZERO,
    current: null,
    kind: new Map(),
    ownerCalls: [],
    peerAssignments: ZERO,
    phase: FORMATION,
    segments: [],
    site: new Map(),
    trigger: new Map(),
  };
}

// The attribution instance calls its hook factory from its own constructor,
// so the reference is read lazily through a holder rather than captured.
function installHook(recorder, held) {
  return (callbacks) => createHook({
    init(asyncId, type, triggerAsyncId, resource) {
      callbacks.init(asyncId, type, triggerAsyncId, resource);
      recorder.trigger.set(asyncId, triggerAsyncId);
      if (held.attribution.asyncOwners.get(asyncId) !== UNATTRIBUTED) return;
      recorder.kind.set(asyncId, type);
      recorder.site.set(asyncId, firstRepoFrame());
    },
    before(asyncId) {
      const inherited =
        held.attribution.asyncOwners.get(asyncId) ?? UNATTRIBUTED;
      // Nesting is ordinary: a microtask drained inside an open macrotask
      // segment is one owner's work continuing. Ambiguity is two SEMANTIC
      // owners in flight at once - a resource that inherited owner A being
      // dispatched inside an open segment of a different owner B.
      const active = held.attribution.depth > ZERO ?
        held.attribution.activeOwner : UNATTRIBUTED;
      if (inherited !== UNATTRIBUTED && active !== UNATTRIBUTED &&
          inherited !== active) {
        recorder.ambiguous += ONE;
      }
      recorder.current = {
        asyncId,
        owner: inherited,
        phase: recorder.phase,
      };
      callbacks.before(asyncId);
    },
    after(asyncId) {
      callbacks.after(asyncId);
      const segment = recorder.current;
      recorder.current = null;
      if (!segment || segment.asyncId !== asyncId) return;
      if (segment.owner === UNATTRIBUTED) {
        segment.root = framedAncestor(recorder.site, recorder.trigger,
          asyncId);
        segment.type = recorder.kind.get(asyncId) ?? null;
        segment.trigger = recorder.trigger.get(asyncId) ?? null;
        segment.createdInWindow = recorder.trigger.has(asyncId);
      }
      recorder.segments.push(segment);
    },
    destroy(asyncId) {
      callbacks.destroy?.(asyncId);
    },
  });
}

function installOwnerCallObserver(recorder) {
  const realRun = FormationTurnAttribution.prototype.run;
  FormationTurnAttribution.prototype.run = function(owner, callback) {
    const frame = firstRepoFrame();
    recorder.ownerCalls.push({
      frame,
      kind: this.depth > ZERO ? HANDOFF : ENTRY,
      owner,
      phase: recorder.phase,
    });
    if (stringStartsWith(frame, PEER_REPRESENTATION_PREFIX)) {
      recorder.peerAssignments += ONE;
    } else if (arraySome(CARRIER_PREFIX,
      (prefix) => stringStartsWith(frame, prefix))) {
      recorder.carrierAssignments += ONE;
    }
    return realRun.call(this, owner, callback);
  };
  return () => {
    FormationTurnAttribution.prototype.run = realRun;
  };
}

function summarizeOwners(snapshot, ownerCalls) {
  const entries = new Map();
  const handoffs = new Map();
  for (const call of ownerCalls) {
    if (call.phase !== FORMATION) continue;
    increment(call.kind === ENTRY ? entries : handoffs, call.owner);
  }
  const rows = {};
  for (const row of snapshot.owners) {
    if (row.owner === UNATTRIBUTED) continue;
    rows[row.owner] = {
      entries: entries.get(row.owner) ?? ZERO,
      dispatches: row.dispatchCount,
      handoffs: row.handoffCount,
      durationUs: row.durationUs,
    };
  }
  return rows;
}

function summarizeUnowned(segments) {
  const byReason = {};
  const bySite = {};
  let productionSemanticUnowned = ZERO;
  let unknownSegments = ZERO;
  let total = ZERO;
  for (const segment of segments) {
    if (segment.phase !== FORMATION || segment.owner !== UNATTRIBUTED) continue;
    total += ONE;
    const file = fileOf(segment.root ?? NATIVE);
    const verdict = classifyUnownedTurn(file, segment.createdInWindow);
    // A resource that predates the window has no creation site inside it, so
    // it is counted by its reason and never keyed to a file it did not come
    // from.
    if (segment.createdInWindow !== false) {
      bySite[file] = (bySite[file] ?? ZERO) + ONE;
    }
    if (verdict.classification === CLASSIFICATION.OUTSIDE_DOMAIN) {
      byReason[verdict.reason] = (byReason[verdict.reason] ?? ZERO) + ONE;
    } else if (verdict.classification === CLASSIFICATION.UNKNOWN) {
      unknownSegments += ONE;
    } else {
      productionSemanticUnowned += ONE;
    }
  }
  return {
    bySite,
    outsideDomainByReason: byReason,
    productionSemanticUnowned,
    segments: total,
    unknownSegments,
  };
}

function readStrict(report) {
  const match = STRICT_PATTERN.exec(report);
  return {
    violations: Number(match[ONE]),
    substitutions: Number(match[2]),
    proofEligible: match[3] === 'true',
  };
}

export {
  FORMATION,
  FORMATION_END_REASON,
  SEALED,
  TEARDOWN,
  createRecorder,
  digestOf,
  fileOf,
  installHook,
  installOwnerCallObserver,
  readStrict,
  summarizeOwners,
  summarizeUnowned,
};
