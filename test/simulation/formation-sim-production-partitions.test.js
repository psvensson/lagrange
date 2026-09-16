// C. The terminal invariant the composition epic was aiming at: node-0 hosts
// 45 partitions with three replicas each - 135 real PartitionService runtimes
// - and every one of them is production's.
//
// The simulator's original defect was that it never hosted this population at
// all: six synthetic raft cohorts stood in for it, so every measurement was of
// a composition the harness had invented. C ends that. The same chain B proved
// for one message group - declared, queued, reconciled, created, settled - now
// carries 135 partition replicas, and the population is read off the runtimes
// rather than off a declaration.
//
// C also found the first nondeterminism this apparatus could not see. Every
// clock was deterministic and the scenario still ended at two different
// virtual instants, because consensus draws its election timing from
// Math.random(). Randomness is a SECOND substrate, and the deterministic
// owner guard does not cover it.
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
  createProductionSeedSimHost, runSeedPartitionsScenario,
} from './formation-sim-production-seed-host.js';

const NODE_ID = 'node-0';
const WS_PORT = 19996;
const NODE_ADDRESS = `ws://127.0.0.1:${WS_PORT}`;
const GENERATION = 'c-partitions';
const EXPECTED_PARTITIONS = 45;
const REPLICAS_PER_PARTITION = 3;
const EXPECTED_REPLICAS = EXPECTED_PARTITIONS * REPLICAS_PER_PARTITION;
const PARTITION_HORIZON_MS = 120000;
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

async function seedThroughPartitions() {
  const scenario = createProductionSimScenario();
  const environment = createProductionSimNodeEnvironment({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT, scenario,
  });
  const host = createProductionSeedSimHost(environment);
  await runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.phaseInfrastructure()));
  await host.settleCausalConsequences();
  const groups = runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.startPhaseMessageGroups()));
  await host.driveUntilSettled(groups);
  await host.settleCausalConsequences();
  const partitions = runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.startPhasePartitions()));
  await host.driveUntilSettled(partitions, PARTITION_HORIZON_MS);
  await host.settleCausalConsequences();
  return {scenario, environment, host};
}

function entriesOf(host, event) {
  return host.transcript().entries().filter((entry) => entry.event === event);
}

test('C-1. 45 partitions, three replicas each, all hosted on node-0',
  async () => {
    const world = await seedThroughPartitions();
    const services = [...world.host.bootstrap.partitionServices.values()];

    assert.equal(services.length, EXPECTED_REPLICAS,
      'the population is read off the runtimes, not off a declaration');
    assert.equal(world.host.bootstrap.partitionReplicas.length,
      EXPECTED_REPLICAS);

    const byPartition = new Map();
    for (const service of services) {
      byPartition.set(service.partitionId,
        (byPartition.get(service.partitionId) || 0) + 1);
    }
    assert.equal(byPartition.size, EXPECTED_PARTITIONS,
      'one partition per declared system table');
    assert.deepEqual([...new Set(byPartition.values())],
      [REPLICAS_PER_PARTITION], 'and three replicas of each');

    for (const service of services) {
      assert.equal(service.constructor.name, 'PartitionService',
        'each is a real runtime');
      assert.equal(service.nodeId, NODE_ID, 'hosted by node-0');
      for (const address of service.peerAddresses) {
        assert.ok(address.startsWith(`${NODE_ID}/`),
          `${address} places a peer on node-0`);
      }
      // Node-local collaborators are node-0's, not a process singleton's.
      assert.equal(service.timeSource, world.environment.timeSource,
        'reading the runtime\'s own clock');
    }

    await world.host.stop();
  });

test('C-2. every replica was declared before it was created', async () => {
  const world = await seedThroughPartitions();
  const declared = entriesOf(world.host, 'partition_replica_declared');
  const created = entriesOf(world.host, 'partition_replica_created');

  assert.equal(declared.length, EXPECTED_REPLICAS,
    'one declaration per replica');
  assert.equal(created.length, EXPECTED_REPLICAS, 'and one creation');
  assert.deepEqual(
    [...new Set(created.map((entry) => entry.replicaId))].sort(),
    [...new Set(declared.map((entry) => entry.replicaId))].sort(),
    'the same replicas, by name');

  // Desired state is complete before the first runtime is built: the phase
  // queues and the reconciler acts, rather than creating inline.
  const entries = world.host.transcript().entries();
  const lastDeclared = entries.findLastIndex((entry) =>
    entry.event === 'partition_replica_declared');
  const firstCreated = entries.findIndex((entry) =>
    entry.event === 'partition_replica_created');
  assert.ok(lastDeclared < firstCreated,
    'all 135 declarations precede the first creation');

  // And the phase's own boundaries bracket the whole chain.
  const started = entries.findIndex((entry) =>
    entry.event === 'phase_partitions_started');
  const completed = entries.findIndex((entry) =>
    entry.event === 'phase_partitions_completed');
  assert.ok(started < lastDeclared && firstCreated < completed);

  await world.host.stop();
});

test('C-3. the composed formation is deterministic and strict stays clean',
  async () => {
    // This is the gate that caught Math.random: every clock was deterministic
    // and the scenario still ended at two different virtual instants.
    const first = await runSeedPartitionsScenario();
    assert.equal(first.strictReport,
      'mode=strict violations=0 substitutions=0 eligible=true ledger=0',
      'the whole partition chain reached no ambient seam');

    for (let attempt = 2; attempt <= 3; attempt += 1) {
      const again = await runSeedPartitionsScenario();
      for (const artifact of ARTIFACTS) {
        assert.equal(again[artifact], first[artifact],
          `${artifact} is exact on run ${attempt}`);
      }
      assert.equal(again.nowMs, first.nowMs,
        'and the formation ends at the same virtual instant');
    }

    const loaded = await runSeedPartitionsScenario({
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

    assert.equal(first.pendingEventCount, 0,
      'and 135 live replicas leave nothing armed after production teardown');
  });
