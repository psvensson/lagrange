// B. The first semantic expansion: node-0 runs the real phaseMessageGroups(),
// and three production-owned MessageGroupService runtimes exist on it.
//
// A2b proved production composes node-0's infrastructure. It composed nothing
// that DOES anything. B is the first slice where a production declaration
// travels the whole unified lifecycle - declared, queued as desired state,
// reconciled, created, started - and ends in real runtimes.
//
// The chain under test, and the only thing B claims:
//
//   SeedMessageGroupsPhase declares three replicas
//   -> the bootstrap desired-state queue
//   -> StartupServiceLifecycleOwner's ServiceReconciler
//   -> createBootstrapMessageGroupReplica
//   -> three MessageGroupService runtimes, all on node-0
//   -> elections deferred
//
// One message group. No partitions: C is a separate slice, and a partition
// created here would make the population claim untestable in the same breath.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  runOnExecutionNode, runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  createProductionSimNodeEnvironment, createProductionSimScenario,
} from './formation-sim-production-node-environment.js';
import {
  createProductionSeedSimHost, runSeedMessageGroupsScenario,
} from './formation-sim-production-seed-host.js';

const NODE_ID = 'node-0';
const WS_PORT = 19990;
const NODE_ADDRESS = `ws://127.0.0.1:${WS_PORT}`;
const GENERATION = 'b-message-groups';
const GROUP_ID = 'mg-1';
const REPLICA_IDS = Object.freeze(['mg-1-r1', 'mg-1-r2', 'mg-1-r3']);
// The declared stagger is 50 ms per replica, and the phase paces itself on
// the node's clock, so the creations land one stagger apart in VIRTUAL time.
const STAGGER_MS = 50;
// Election windows and heartbeats live well under a second; the only timers a
// composed node has armed at this point are phase one's, at 30 s and an hour.
const CONSENSUS_CADENCE_CEILING_MS = 1000;
const ARTIFACTS = Object.freeze([
  'hostTranscript', 'networkTranscript', 'strictReport', 'provenanceSnapshot',
]);

before(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

after(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

async function seedThroughMessageGroups() {
  const scenario = createProductionSimScenario();
  const environment = createProductionSimNodeEnvironment({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT, scenario,
  });
  const host = createProductionSeedSimHost(environment);
  await runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.phaseInfrastructure()));
  await host.settleCausalConsequences();
  const running = runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.startPhaseMessageGroups()));
  await host.driveUntilSettled(running);
  await host.settleCausalConsequences();
  return {scenario, environment, host};
}

function entriesOf(host, event) {
  return host.transcript().entries().filter((entry) => entry.event === event);
}

function firstIndexOf(host, event, replicaId = null) {
  return host.transcript().entries().findIndex((entry) =>
    entry.event === event &&
    (replicaId === null || entry.replicaId === replicaId));
}

test('B-1. one declaration per replica travels the whole lifecycle chain',
  async () => {
    const world = await seedThroughMessageGroups();
    const {host} = world;

    for (const event of ['message_group_replica_declared',
      'message_group_replica_created', 'message_group_replica_started',
      'message_group_election_deferred']) {
      const entries = entriesOf(host, event);
      assert.deepEqual(entries.map((entry) => entry.replicaId), REPLICA_IDS,
        `${event} happened once per declared replica, in declaration order`);
      for (const entry of entries) {
        assert.equal(entry.nodeId, NODE_ID, `${event} belongs to node-0`);
      }
    }

    // The reconciler is the step between the declaration and the runtime, and
    // it is production's: three create_start_replica actions, one per replica.
    const actions = entriesOf(host, 'reconciler_action_executed');
    assert.deepEqual(actions.map((entry) => entry.replicaId), REPLICA_IDS);
    for (const action of actions) {
      assert.equal(action.actionType, 'create_start_replica');
      assert.equal(action.owner, 'ServiceReconciler');
    }

    // Per replica, the order is the chain's order.
    for (const replicaId of REPLICA_IDS) {
      const declared = firstIndexOf(host, 'message_group_replica_declared', replicaId);
      const created = firstIndexOf(host, 'message_group_replica_created', replicaId);
      const started = firstIndexOf(host, 'message_group_replica_started', replicaId);
      const reconciled = firstIndexOf(host, 'reconciler_action_executed', replicaId);
      assert.ok(declared < created,
        `${replicaId} was declared before it was created`);
      assert.ok(created < started, 'and created before it was started');
      assert.ok(started < reconciled,
        'and the reconciler recorded its action once the hooks had run');
    }

    // Every declaration precedes every creation: the phase queues desired
    // state first and the reconciler acts on it, rather than creating inline.
    const lastDeclared = Math.max(...REPLICA_IDS.map((replicaId) =>
      firstIndexOf(host, 'message_group_replica_declared', replicaId)));
    const firstCreated = Math.min(...REPLICA_IDS.map((replicaId) =>
      firstIndexOf(host, 'message_group_replica_created', replicaId)));
    assert.ok(lastDeclared < firstCreated,
      'desired state is complete before the first runtime is built');

    await host.stop();
  });

test('B-2. three real MessageGroupService runtimes exist, all on node-0',
  async () => {
    const world = await seedThroughMessageGroups();
    const {bootstrap} = world.host;

    assert.equal(bootstrap.messageGroupServices.size, 3,
      'three runtimes, not three descriptors');
    assert.deepEqual([...bootstrap.messageGroupServices.keys()], REPLICA_IDS);
    assert.equal(bootstrap.messageGroupReplicas.length, 3);

    for (const replicaId of REPLICA_IDS) {
      const service = bootstrap.messageGroupServices.get(replicaId);
      assert.equal(service.constructor.name, 'MessageGroupService',
        `${replicaId} is a real runtime`);
      assert.equal(service.groupId, GROUP_ID);
      assert.equal(service.nodeId, NODE_ID, 'hosted by node-0');
      assert.equal(service.deferElection, true, 'with its election deferred');
      assert.deepEqual([...service.replicaIds], REPLICA_IDS,
        'and the whole group as its peers');
      // The population claim: every peer address names node-0, so all three
      // replicas of the group are on the one node.
      for (const address of service.peerAddresses) {
        assert.ok(address.startsWith(`${NODE_ID}/`),
          `${address} places a peer on node-0`);
      }
      // Its node-local collaborators are node-0's, not a process singleton's.
      assert.equal(service.systemTableCache,
        world.environment.nodeService.getSystemTableCache(),
        `${replicaId} reads the runtime's own cache`);
      assert.equal(service.timeSource, world.environment.timeSource,
        'and the runtime\'s own clock');
    }

    // B does not begin partitions. C is a separate slice.
    assert.equal(bootstrap.partitionServices.size, 0);
    assert.equal(bootstrap.partitionReplicas.length, 0);

    await world.host.stop();
  });

test('B-3. the replica stagger is the node\'s pacing, on the node\'s clock',
  async () => {
    const world = await seedThroughMessageGroups();
    const created = entriesOf(world.host, 'message_group_replica_created');
    const instants = created.map((entry) => entry.virtualTimeMs);
    for (let index = 1; index < instants.length; index += 1) {
      assert.equal(instants[index] - instants[index - 1], STAGGER_MS,
        'each replica is created one declared stagger after the last');
    }
    // Which means the phase itself could not return until virtual time had
    // advanced: production paced itself on the node's clock, and the host is
    // what ran the scheduler while it waited.
    const completed = entriesOf(world.host, 'phase_message_groups_completed');
    assert.equal(completed.length, 1);
    assert.ok(completed[0].virtualTimeMs >= instants[instants.length - 1],
      'the phase completed no earlier than its last replica');
    assert.ok(world.scenario.network.now() >= 2 * STAGGER_MS,
      'and the scenario consumed the whole stagger in virtual time');

    // Deferred election, stated as a scheduling fact rather than a flag: with
    // three replicas alive, nothing is armed on the node's clock anywhere
    // near a consensus cadence. The two timers that ARE armed are phase
    // one's - the router's keepalive and the reconciler's cadence - both
    // orders of magnitude beyond an election window.
    const now = world.scenario.network.now();
    const soon = world.scenario.network.pendingEvents()
      .filter((event) => event.kind === 'timer')
      .filter((event) => event.dueAt - now < CONSENSUS_CADENCE_CEILING_MS);
    assert.deepEqual(soon, [],
      'three live replicas with deferred elections arm no consensus timer');

    await world.host.stop();
  });

test('B-4. the chain is exact and strict stays clean', async () => {
  const first = await runSeedMessageGroupsScenario();
  assert.equal(first.strictReport,
    'mode=strict violations=0 substitutions=0 eligible=true ledger=0',
    'the whole message-group chain reached no ambient seam');

  const again = await runSeedMessageGroupsScenario();
  for (const artifact of ARTIFACTS) {
    assert.equal(again[artifact], first[artifact],
      `${artifact} is exact across two same-process runs`);
  }

  const loaded = await runSeedMessageGroupsScenario({
    hostLoad: () => {
      let total = 0;
      for (let index = 0; index < 200000; index += 1) total += index % 7;
      return total;
    },
  });
  for (const artifact of ARTIFACTS) {
    assert.equal(loaded[artifact], first[artifact],
      `${artifact} is exact under host load`);
  }
  assert.equal(loaded.nowMs, first.nowMs);
  assert.equal(first.pendingEventCount, 0,
    'and the scenario is at rest after teardown');
});
