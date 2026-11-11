import {test} from '../../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../../src/bootstrap/bootstrap-api.js';
import {BOOTSTRAP_API_PROBE_SCOPE} from
  '../../../src/bootstrap/bootstrap-api-constants.js';
import {BOOTSTRAP_PHASE} from '../../../src/bootstrap/bootstrap-constants.js';
import {BootstrapReadinessOwner} from
  '../../../src/bootstrap/owners/bootstrap-readiness-owner.js';
import {
  BOOTSTRAP_READINESS_DEPENDENCY,
  LIFECYCLE_WAKE_SOURCE,
} from '../../../src/bootstrap/owners/bootstrap-readiness-lifecycle-source.js';
import {LifecycleController} from
  '../../../src/bootstrap/lifecycle-controller.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../../src/bootstrap/lifecycle-controller-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../../src/bootstrap/system-table-schemas-constants.js';
import {StartupRecoveryCoordinator} from
  '../../../src/bootstrap/startup-recovery-coordinator.js';
import {
  attachTrafficReadinessListener,
  getTrafficReadinessSnapshot,
} from '../../../src/bootstrap/traffic-readiness-utils.js';
import {ReadOnlySystemTableCache} from
  '../../../src/cache/read-only-system-table-cache.js';
import {TABLES} from '../../../src/constants/index.js';
import {ControlPlaneReadinessService} from
  '../../../src/control-plane/control-plane-readiness-service.js';

// The lifecycle's dependencies are a read of their owners, and the lifecycle
// transition is raised when the recovery-health owner publishes a change: no
// request, probe or other outside evaluation moves it (the 2026-11-11 latch:
// a seed held DEGRADED [PRIORITY_CONTROL_PLANE_RECOVERY_PENDING] for ever
// because only a join request or an HTTP probe ever wrote the dependency).

const NODE_ID = 'seed-node-1';
const OTHER_NODE_ID = 'joiner-node-2';
const PENDING = LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;
const PRIORITY_PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
const DEFAULT_PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.TABLES];

// The recovery-health owner's port as the readiness owner consumes it: the
// synchronous health read and the planning publication stream of the
// control-plane readiness service (the double is one by type; the readiness
// owner follows nothing else). The health is the test's lever; publish() is
// the owner announcing a rebuilt answer.
function createRecoveryHealthOwner(initiallyHealthy) {
  const listeners = new Set();
  const owner = Object.assign(
    Object.create(ControlPlaneReadinessService.prototype), {
      healthy: initiallyHealthy,
      healthReads: 0,
      getPriorityControlPlaneRecoveryHealthSync() {
        owner.healthReads += 1;
        return owner.healthy ?
          {healthy: true, reasonCode: PENDING, details: null} :
          {healthy: false, reasonCode: PENDING, details: {
            priorityRecoveryReasonCodes: ['control_plane_replicas_not_spread'],
          }};
      },
      subscribeReadinessPlanningSnapshots(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      publish(ownerKey) {
        for (const listener of listeners) {
          listener(Object.freeze({ownerKey, snapshot: {}, capturedToken: {}}));
        }
      },
      listenerCount: () => listeners.size,
    });
  return owner;
}

function createFollowedLifecycle(options = {}) {
  const readinessState = new LifecycleController({
    readyStableWindowMs: options.readyStableWindowMs ?? 0,
  });
  const recoveryHealthOwner = createRecoveryHealthOwner(
    options.initiallyHealthy === true);
  const setDependencyCalls = [];
  const setDependency = readinessState.setDependency.bind(readinessState);
  readinessState.setDependency = (...args) => {
    setDependencyCalls.push(args[0]);
    return setDependency(...args);
  };
  const transitions = [];
  const wakeLog = [];
  const owner = new BootstrapReadinessOwner({
    delegates: {
      getSeedNodeId: () => NODE_ID,
      getReadinessState: () => readinessState,
      getControlPlaneReadinessService: () => recoveryHealthOwner,
      getLeaderReadinessStatusForProbe: () => ({ready: true}),
      getLogger: () => ({
        info: (_message, context) => wakeLog.push(
          [context.wakeSource, context.phase]),
        error: (message, context) => {
          throw new Error(`${message}: ${context.error}`);
        },
      }),
    },
  });
  const detach = attachTrafficReadinessListener(readinessState,
    (transition) => transitions.push({
      phase: transition.phase,
      ready: transition.ready,
      reasons: transition.reasons,
    }));
  return {
    owner, readinessState, recoveryHealthOwner, setDependencyCalls,
    transitions, wakeLog, detach,
  };
}

// One host turn: the publication's evaluation runs in a microtask.
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function createProbeReply() {
  return {
    statusCode: null,
    code(value) {
      this.statusCode = value;
    },
  };
}

test('the recovery dependency follows the recovery health in both ' +
  'directions on the owner publication, with no evaluation from outside',
async (t) => {
  const {owner, readinessState, recoveryHealthOwner, transitions, wakeLog,
    detach} = createFollowedLifecycle({initiallyHealthy: false});
  t.teardown(() => {
    detach();
    owner.stopFollowingLifecycleSources();
  });
  t.equal(recoveryHealthOwner.listenerCount(), 1,
    'the readiness owner follows the recovery-health owner publication');
  t.equal(transitions.length, 0, 'nothing is projected before any event');

  recoveryHealthOwner.publish(NODE_ID);
  await nextTurn();
  t.same(transitions, [
    {phase: LIFECYCLE_PHASE.DEGRADED, ready: false, reasons: [PENDING]},
  ], 'pending recovery is projected when the owner publishes it');

  recoveryHealthOwner.healthy = true;
  await nextTurn();
  t.equal(transitions.length, 1,
    'a health change that is not yet published raises no transition');
  recoveryHealthOwner.publish(NODE_ID);
  await nextTurn();
  t.same(transitions[1],
    {phase: LIFECYCLE_PHASE.TRAFFIC_READY, ready: true, reasons: []},
    'pending -> healthy: the lifecycle returns to TRAFFIC_READY on the ' +
      'publication alone');
  t.equal(readinessState.getSnapshot().phase, LIFECYCLE_PHASE.TRAFFIC_READY);

  recoveryHealthOwner.healthy = false;
  recoveryHealthOwner.publish(NODE_ID);
  await nextTurn();
  t.same(transitions[2],
    {phase: LIFECYCLE_PHASE.DEGRADED, ready: false, reasons: [PENDING]},
    'healthy -> pending: the lifecycle demotes on the publication alone');

  const readsBefore = recoveryHealthOwner.healthReads;
  recoveryHealthOwner.publish(OTHER_NODE_ID);
  await nextTurn();
  t.equal(recoveryHealthOwner.healthReads, readsBefore,
    'a publication for another node evaluates nothing here');
  t.equal(transitions.length, 3, 'exactly one transition per health change');

  recoveryHealthOwner.healthy = true;
  recoveryHealthOwner.publish(NODE_ID);
  recoveryHealthOwner.publish(NODE_ID);
  recoveryHealthOwner.publish(NODE_ID);
  await nextTurn();
  t.equal(recoveryHealthOwner.healthReads, readsBefore + 1,
    'publications delivered in one turn cost one evaluation');
  t.equal(transitions.length, 4);
  t.equal(owner.lifecycleFollow.evaluationsOnPublication, 4,
    'every evaluation above was raised by a publication');
  const RECOVERY_EVENT =
    LIFECYCLE_WAKE_SOURCE.PRIORITY_CONTROL_PLANE_RECOVERY_EVENT;
  t.same(wakeLog, [
    [RECOVERY_EVENT, LIFECYCLE_PHASE.DEGRADED],
    [RECOVERY_EVENT, LIFECYCLE_PHASE.TRAFFIC_READY],
    [RECOVERY_EVENT, LIFECYCLE_PHASE.DEGRADED],
    [RECOVERY_EVENT, LIFECYCLE_PHASE.TRAFFIC_READY],
  ], 'each transition is logged with the wake source the progress ' +
    'contract names');
  t.equal(owner.buildStartupReadinessProgressContract({reasons: [PENDING]})
    .wakeSource, RECOVERY_EVENT,
  'the progress contract names the wake source that is driven');
});

test('a consumer reads the recovery health of now, never the value a ' +
  'request or probe last saw (the latch, refused and resumed)', async (t) => {
  const {owner, readinessState, recoveryHealthOwner, setDependencyCalls,
    detach} = createFollowedLifecycle({initiallyHealthy: false});
  t.teardown(() => {
    detach();
    owner.stopFollowingLifecycleSources();
  });
  const coordinator = new StartupRecoveryCoordinator({readinessState});
  const gate = (partitionId) => coordinator.evaluate({partitionId});

  // The last request the seed answers arrives while recovery is pending:
  // the second joiner's bootstrap admission in every recorded formation.
  const admission = owner.evaluateReadinessSnapshot();
  t.same(admission.reasons, [PENDING],
    'the admission read reports the pending recovery');
  t.equal(owner.resolveReadinessSnapshotForScope(admission,
    BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN).ready, true,
  'and admits the joiner: pending recovery does not block a join');
  t.equal(gate(DEFAULT_PARTITION_ID).backgroundWorkReady, false,
    'refused: a default system partition needs TRAFFIC_READY');
  t.equal(gate(PRIORITY_PARTITION_ID).backgroundWorkReady, true,
    'a priority partition proceeds on metadata-publication readiness');

  // Recovery completes. No request, no probe, and not even the publication:
  // the consumer's own read derives the dependency from its owner.
  recoveryHealthOwner.healthy = true;
  const resumed = gate(DEFAULT_PARTITION_ID);
  t.equal(resumed.backgroundWorkReady, true,
    'resumed: the same gate read sees the completed recovery');
  t.equal(getTrafficReadinessSnapshot(readinessState).phase,
    LIFECYCLE_PHASE.TRAFFIC_READY);

  recoveryHealthOwner.healthy = false;
  t.equal(gate(DEFAULT_PARTITION_ID).backgroundWorkReady, false,
    'and refuses again the moment recovery is pending again');
  t.same(setDependencyCalls, [],
    'no path wrote a dependency: the controller read its source');
});

test('requests and probes are reads: none writes a lifecycle dependency',
  async (t) => {
    const {owner, readinessState, recoveryHealthOwner, setDependencyCalls,
      detach} = createFollowedLifecycle({initiallyHealthy: false});
    t.teardown(() => {
      detach();
      owner.stopFollowingLifecycleSources();
    });

    const startup = owner.handleStartupProbeRequest(createProbeReply());
    const ready = await owner.handleReadinessProbeRequest(createProbeReply());
    const bootstrapReady =
      await owner.handleBootstrapReadinessProbeRequest(createProbeReply());
    const diagnostics = owner.getReadinessSnapshotForDiagnostics();
    t.same(setDependencyCalls, [],
      '/startupz, /readyz, /bootstrap/ready and the diagnostics read ' +
        'write no dependency');
    t.equal(startup.started, true);
    t.equal(ready.ready, false);
    t.same(ready.reasons, [PENDING]);
    t.equal(typeof bootstrapReady.ready, 'boolean');
    t.same(diagnostics.reasons, [PENDING]);

    t.throws(() => readinessState.setDependency(
      BOOTSTRAP_READINESS_DEPENDENCY.PRIORITY_CONTROL_PLANE_RECOVERY, true),
    /read from the bound source/,
    'the controller refuses a dependency write beside its source');

    // The probe's answer is the consumer's answer: a probe that ran while
    // recovery was pending leaves nothing behind for a later reader.
    recoveryHealthOwner.healthy = true;
    t.equal(getTrafficReadinessSnapshot(readinessState).ready, true,
      'a consumer read after the probe sees the health of now');
    const readyAgain =
      await owner.handleReadinessProbeRequest(createProbeReply());
    t.equal(readyAgain.ready, true, 'and so does the next probe');
  });

test('the stable window ends on its own deadline and the listener port ' +
  'observes TRAFFIC_READY without an outside evaluation', async (t) => {
  const STABLE_WINDOW_MS = 40;
  const {owner, readinessState, recoveryHealthOwner, transitions, wakeLog,
    detach} = createFollowedLifecycle({
    initiallyHealthy: false,
    readyStableWindowMs: STABLE_WINDOW_MS,
  });
  t.teardown(() => {
    detach();
    owner.stopFollowingLifecycleSources();
  });
  recoveryHealthOwner.publish(NODE_ID);
  await nextTurn();
  recoveryHealthOwner.healthy = true;
  recoveryHealthOwner.publish(NODE_ID);
  await nextTurn();
  t.same(transitions.map((transition) => transition.phase),
    [LIFECYCLE_PHASE.DEGRADED, LIFECYCLE_PHASE.JOIN_READY],
    'recovery cleared: the stable window is pending');

  const trafficReady = new Promise((resolve) => {
    const detachWaiter = attachTrafficReadinessListener(readinessState,
      (transition) => {
        if (transition.phase === LIFECYCLE_PHASE.TRAFFIC_READY) {
          detachWaiter();
          resolve(transition);
        }
      });
  });
  // The deadline is unreferenced (it never holds a process open); the test
  // holds the loop open for it, under its own bound.
  const WITNESS_BOUND_MS = 5_000;
  const loopHold = setTimeout(() => {}, WITNESS_BOUND_MS);
  const transition = await trafficReady;
  clearTimeout(loopHold);
  t.equal(transition.ready, true,
    'the listener port delivers the TRAFFIC_READY transition');
  t.equal(owner.lifecycleFollow.evaluationsOnStableWindowDeadline >= 1, true,
    'raised by the stable-window deadline');
  t.equal(owner.lifecycleFollow.stableWindowTimer, null,
    'no deadline stays armed once the window has ended');
  t.same(wakeLog.at(-1), [LIFECYCLE_WAKE_SOURCE.STABLE_WINDOW_DEADLINE,
    LIFECYCLE_PHASE.TRAFFIC_READY]);
});

test('stopping releases the publication subscription and the deadline',
  async (t) => {
    const {owner, readinessState, recoveryHealthOwner, transitions, detach} =
      createFollowedLifecycle({
        initiallyHealthy: true,
        readyStableWindowMs: 60_000,
      });
    t.teardown(detach);
    recoveryHealthOwner.publish(NODE_ID);
    await nextTurn();
    t.equal(transitions.at(-1).phase, LIFECYCLE_PHASE.JOIN_READY);
    t.ok(owner.lifecycleFollow.stableWindowTimer, 'a deadline is armed');

    owner.stopFollowingLifecycleSources();
    t.equal(recoveryHealthOwner.listenerCount(), 0, 'subscription released');
    t.equal(owner.lifecycleFollow, null, 'deadline and listener released');
    recoveryHealthOwner.healthy = false;
    recoveryHealthOwner.publish(NODE_ID);
    await nextTurn();
    t.equal(transitions.at(-1).phase, LIFECYCLE_PHASE.JOIN_READY,
      'a publication after the stop raises nothing');
    t.equal(getTrafficReadinessSnapshot(readinessState).phase,
      LIFECYCLE_PHASE.DEGRADED,
      'the source stays bound: a consumer read still derives from the owner');
  });

test('a readiness service wired after construction is followed from the ' +
  'first dependency read that sees it, and a replacement is re-followed',
async (t) => {
  const readinessState = new LifecycleController({readyStableWindowMs: 0});
  let service = null;
  const owner = new BootstrapReadinessOwner({
    delegates: {
      getSeedNodeId: () => NODE_ID,
      getReadinessState: () => readinessState,
      getControlPlaneReadinessService: () => service,
      getLeaderReadinessStatusForProbe: () => ({ready: true}),
    },
  });
  t.teardown(() => owner.stopFollowingLifecycleSources());
  t.equal(getTrafficReadinessSnapshot(readinessState).ready, false,
    'no readiness service: recovery health is unavailable, not assumed');

  const first = createRecoveryHealthOwner(true);
  service = first;
  getTrafficReadinessSnapshot(readinessState);
  t.equal(first.listenerCount(), 1, 'followed from the read that saw it');

  const second = createRecoveryHealthOwner(false);
  service = second;
  getTrafficReadinessSnapshot(readinessState);
  t.equal(first.listenerCount(), 0, 'the replaced service is released');
  t.equal(second.listenerCount(), 1, 'the replacement is followed');
});

test('a source that consults the lifecycle while it is being read is ' +
  'answered the last completed projection, and the read is not re-entered',
async (t) => {
  const readinessState = new LifecycleController({readyStableWindowMs: 0});
  let ready = false;
  let reads = 0;
  const seenBySource = [];
  readinessState.bindDependencySource(() => {
    reads += 1;
    // A dependency owner that asks the lifecycle about itself mid-read.
    seenBySource.push(getTrafficReadinessSnapshot(readinessState).phase);
    return [{
      name: BOOTSTRAP_READINESS_DEPENDENCY.RUNTIME_WIRING_READY,
      ready,
      reasonCode: 'BOOTSTRAP_NOT_READY',
    }];
  });
  t.equal(readinessState.evaluate().phase, LIFECYCLE_PHASE.CONTROL_READY);
  t.equal(reads, 1, 'the nested evaluation did not read the source again');
  t.same(seenBySource, [LIFECYCLE_PHASE.INIT],
    'the source saw the last completed projection: nothing is projected ' +
      'from a dependency set that is still being read');
  t.equal(readinessState.getSnapshot().transitionCount, 1,
    'the nested evaluation raised no transition of its own');
  ready = true;
  t.equal(readinessState.evaluate().phase, LIFECYCLE_PHASE.TRAFFIC_READY);
  t.equal(reads, 2);
  t.same(seenBySource, [LIFECYCLE_PHASE.INIT, LIFECYCLE_PHASE.CONTROL_READY]);
  readinessState.bindDependencySource(() => {
    throw new Error('source failed');
  });
  t.throws(() => readinessState.evaluate(), /source failed/);
  readinessState.bindDependencySource(() => []);
  t.equal(readinessState.evaluate().phase, LIFECYCLE_PHASE.TRAFFIC_READY,
    'a failed read leaves the controller readable by the next one');
});

test('the leader-readiness status is derived once per content of the cache ' +
  'tables it reads', async (t) => {
  const versions = new Map([
    [TABLES.PARTITIONS, 1], [TABLES.MESSAGE_GROUPS, 1], [TABLES.SERVICES, 1],
  ]);
  const systemTableCache = new ReadOnlySystemTableCache({
    get: () => null,
    getAll: () => [],
    filter: () => [],
    find: () => null,
    getReadyNodes: () => [],
    getTableMutationVersion: (tableName) => versions.get(tableName) ?? 0,
  });
  const api = new BootstrapAPI({
    seedNodeId: NODE_ID,
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache,
    bootstrapStartupAdapter: {phase: BOOTSTRAP_PHASE.COMPLETE},
  });
  let derivations = 0;
  const derive = api.serviceLeaderReadinessOwner
    .getLeaderReadinessStatusForProbe.bind(api.serviceLeaderReadinessOwner);
  api.serviceLeaderReadinessOwner.getLeaderReadinessStatusForProbe = () => {
    derivations += 1;
    return derive();
  };

  const first = api.getLeaderReadinessStatusForProbe();
  t.equal(api.getLeaderReadinessStatusForProbe(), first);
  t.equal(derivations, 1, 'unchanged tables: one derivation');
  for (const tableName of versions.keys()) {
    versions.set(tableName, versions.get(tableName) + 1);
    api.getLeaderReadinessStatusForProbe();
  }
  t.equal(derivations, 4, 'an apply to any source table derives again');

  api.getMissingServiceLeaders = () => ({});
  api.getLeaderReadinessStatusForProbe();
  api.getLeaderReadinessStatusForProbe();
  t.equal(derivations, 6,
    'a replaced missing-leader read is no longer a function of the tables');

  delete api.getMissingServiceLeaders;
  api.systemTableCache = {
    get: () => null, getAll: () => [], filter: () => [], find: () => null,
  };
  api.getLeaderReadinessStatusForProbe();
  api.getLeaderReadinessStatusForProbe();
  t.equal(derivations, 8,
    'a cache that states no mutation versions is derived at every read');
});
