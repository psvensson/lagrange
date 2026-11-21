// Witness (red today): the coordinator's topology guard decides a planner's
// runtime-service ADD from the SERVICES inventory read in the gateway's
// default mode. On a node that hosts a services-p1 replica it does not lead,
// that read is answered by the local follower as a success whose row set is
// incomplete, the owner RPC is never tried although the leader is reachable,
// and the guard refuses replica_inventory_unusable with no reason code and
// no reconsideration, identically on every retry (causal trace
// lagrange-takeover-20261121/reports/pgwire-placement-refusal.md, branch B4).
//
// Each case drives the coordinator's createOperation with the planner's
// request (and once the planner's own move execution) on the composition in
// topology-guard-inventory-authority-fixture.js, which names what it
// substitutes. The "diagnosis" subtests that pinned the refusing mechanism
// observation by observation were retired by the repair (the guard now reads
// the SERVICES owner fact), as they announced; their observations are still
// printed. "contract" subtests state what the guard owes; "anchor" subtests
// hold before and after the repair. The guard keeps its authoritative-read requirement: no
// contract here is met by accepting an incomplete or non-leader answer
// (the leader-only occupant case fails any repair that does).
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {AUTHORITATIVE_READ_SOURCE} from
  '../../src/cdc/cdc-integration-service-shared-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {isValidLeaderReadAuthorityWitness} from
  '../../src/control-plane/control-plane-authoritative-read-witness.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {REBALANCE_COORDINATOR_SHARED} from
  '../../src/rebalancer/rebalance-coordinator-shared.js';
import {
  NODE,
  RUNTIME_SERVICE,
  RUNTIME_SERVICE_ID,
  SERVICES_PARTITION_ID,
  buildRuntimeOccupantRow,
  initializeGuardEnvironment,
  isGuardOwnerRpc,
  isGuardServicesRead,
  openPlannerHost,
  openServicesWorld,
  reconsiderationOf,
  refusalFingerprint,
  refusalOf,
  resetGuardEnvironment,
  summarizeServicesRead,
} from './topology-guard-inventory-authority-fixture.js';

const {TOPOLOGY_GUARD_REASON} = REBALANCE_COORDINATOR_SHARED;
const CASE_TIMEOUT_MS = 120000;
const CONNECTED = 'connected';
const PORTS = createPortAllocator(import.meta.url);

// Diagnostic capture of a rejection: frames enough for the whole call path
// from createOperation (the V8 default keeps ten), and every cause.
const DIAGNOSTIC_STACK_FRAMES = 200;
const MAX_CAUSE_DEPTH = 8;
const STACK_LINE_SEPARATOR = '\n';

function printObservation(t, name, value) {
  t.comment(`OBSERVATION ${name} ${JSON.stringify(value, (_key, field) =>
    (typeof field === 'bigint' ? String(field) : field))}`);
}

function describeChainLink(link) {
  if (link instanceof Error) {
    return {name: link.name, message: link.message, code: link.code, stack: link.stack};
  }
  let text;
  try {
    text = JSON.stringify(link);
  } catch (error) {
    text = `unserializable cause: ${error.message}`;
  }
  return {name: typeof link, message: text, code: link?.code, stack: text};
}

// The rejection and its cause chain, each with its full stack, as one
// observation line and line by line (the coordinator's log keeps only text).
function printErrorChain(t, name, error) {
  const chain = [];
  for (let link = error; link !== null && link !== undefined &&
    chain.length < MAX_CAUSE_DEPTH; link = link?.cause) {
    chain.push(describeChainLink(link));
  }
  printObservation(t, name, chain);
  chain.forEach((link, index) => {
    for (const line of String(link.stack).split(STACK_LINE_SEPARATOR)) {
      t.comment(`STACK ${name}[${index}] ${line}`);
    }
  });
  return chain;
}

async function withDiagnosticStacks(run) {
  const frameLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = DIAGNOSTIC_STACK_FRAMES;
  try {
    return await run();
  } finally {
    Error.stackTraceLimit = frameLimit;
  }
}

function guardReadOf(attempt) {
  return attempt.servicesReads.find(isGuardServicesRead) || null;
}

function ledgerShape(rows) {
  return rows.map((row) => ({entity_type: row.entity_type, entity_id: row.entity_id,
    target_node_id: row.target_node_id}));
}

function isLeaderWitnessedComplete(read, servingNodeId) {
  const result = read?.result;
  return result?.success === true && result.rowSetComplete === true &&
    isValidLeaderReadAuthorityWitness(result.readAuthorityWitness, SERVICES_PARTITION_ID) &&
    result.readAuthorityWitness.servingNodeId === servingNodeId;
}

async function openWorld(t, leaderNodeId, ports) {
  initializeGuardEnvironment();
  let world = null;
  try {
    world = await openServicesWorld({leaderNodeId, ports});
  } finally {
    t.teardown(async () => {
      await world?.close();
      resetGuardEnvironment();
    });
  }
  for (const nodeId of [NODE.PEER_A, NODE.PEER_B]) {
    t.equal(world.connectionStateOf(nodeId), CONNECTED,
      `setup: the planner node's router is connected to ${nodeId}`);
  }
  t.equal(world.replicaOn(leaderNodeId).raft.readStatus().role, RAFT_ROLE.LEADER,
    `setup: ${leaderNodeId} leads ${SERVICES_PARTITION_ID} (its consensus core)`);
  t.ok(world.publishedRows.every((row) => row.raft_role !== RAFT_ROLE.LEADER),
    'setup: no partition SERVICES row is published with raft_role leader');
  return world;
}

test('services-p1 led by another node: the planner\'s topology guard and the SERVICES ' +
  'authority', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const world = await openWorld(t, NODE.PEER_A, PORTS);
  t.equal(world.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.FOLLOWER,
    'setup: the planner node hosts a services-p1 replica that follows');

  await t.test('witness (red today): leader reachable, the guard refuses from the ' +
    'local follower\'s incomplete answer', async (t) => {
    const host = openPlannerHost(t, world);
    const route = host.route();
    const first = await host.createAdd();
    const second = await host.createAdd();
    const planned = await host.planAdd();
    const ledger = host.ledgerRows();
    const firstRead = guardReadOf(first);
    const secondRead = guardReadOf(second);
    const plannerReplica = world.replicaOn(NODE.PLANNER);
    const plannerOwnWitness = plannerReplica.buildRemoteReadAuthorityWitness(false);
    printObservation(t, 'completeness', summarizeServicesRead(firstRead));
    printObservation(t, 'witness', {
      accompanying: firstRead?.result?.readAuthorityWitness,
      accompanyingList: firstRead?.result?.readAuthorityWitnesses,
      servingReplica: route.plannerReplica,
      servingReplicaOwnWitness: plannerOwnWitness,
    });
    printObservation(t, 'routing', {
      guardOwnerRpcCalls: first.ownerRpc.filter(isGuardOwnerRpc).length,
      transportHops: first.hops,
      route,
    });
    printObservation(t, 'guard-decision', {
      refusal: refusalOf(first.error),
      createdOperationId: first.operation?.operationId,
      operationsCreated: host.coordinator.stats.operationsCreated,
      ledger: ledgerShape(ledger),
      plannerMove: planned.result,
      plannerError: planned.error?.message,
    });
    printObservation(t, 'retry', {
      identical: refusalFingerprint(first.error) === refusalFingerprint(second.error),
      second: refusalOf(second.error),
      secondRead: summarizeServicesRead(secondRead),
      secondOwnerRpcCalls: second.ownerRpc.filter(isGuardOwnerRpc).length,
    });

    await t.test('contract (red today): the guard decides from the leader\'s complete, ' +
      'witnessed SERVICES inventory', async (t) => {
      const reads = first.servicesReads.filter(isGuardServicesRead);
      t.ok(reads.some((read) => isLeaderWitnessedComplete(read, NODE.PEER_A)),
        'a complete SERVICES inventory witnessed by the services-p1 leader was read: ' +
        JSON.stringify(reads.map(summarizeServicesRead)));
    });

    await t.test('contract (red today): with the leader reachable the ADD is admitted ' +
      'once and the identical retry reuses it', async (t) => {
      t.equal(first.error, null, `the request is admitted: ${JSON.stringify(refusalOf(first.error))}`);
      t.type(first.operation?.operationId, 'string', 'an operation is returned');
      t.same(ledgerShape(ledger), [{entity_type: RUNTIME_SERVICE, entity_id: RUNTIME_SERVICE_ID,
        target_node_id: NODE.PLANNER}], 'exactly one operation row targets the planner node');
      t.equal(second.operation?.operationId, first.operation?.operationId,
        'the identical retry reuses the admitted operation');
      t.equal(planned.result?.success, true, 'the planner\'s move is scheduled');
    });
  });

  await t.test('anchor (green): the services-p1 leader is reachable from the planner node ' +
    'through the owner-RPC path', async (t) => {
    const host = openPlannerHost(t, world);
    const strict = await host.readServicesStrictly();
    const observation = strict.observation;
    const leader = world.replicaOn(NODE.PEER_A);
    printObservation(t, 'reachability', {observation, error: strict.error?.message,
      ownerRpc: strict.ownerRpc, hops: strict.hops});
    t.notOk(strict.error, `the strict read settles (${strict.error?.message})`);
    t.equal(observation?.available, true, 'the leader-required owner read is available');
    t.equal(observation?.rowSetComplete, true, 'with a complete row set');
    t.equal(observation?.source, AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
      'answered on the owner-RPC lane');
    t.ok(isValidLeaderReadAuthorityWitness(observation?.readAuthorityWitness,
      SERVICES_PARTITION_ID), 'witnessed by a leader');
    t.equal(observation?.readAuthorityWitness?.servingNodeId, NODE.PEER_A,
      'served on the leader\'s node');
    t.equal(observation?.readAuthorityWitness?.servingReplicaId, leader.replicaId,
      'by the leader replica');
    t.ok(strict.ownerRpc.filter(isGuardOwnerRpc).length >= 1, 'the owner RPC was issued');
    t.ok(strict.hops.some((hop) => hop.address === leader.unifiedAddress && !hop.refused),
      'and crossed to the leader\'s address');
  });

  await t.test('anchor (b): the leader genuinely unreachable (its hop refuses)',
    async (t) => {
      const host = openPlannerHost(t, world, {unreachableNodeIds: [NODE.PEER_A]});
      const first = await host.createAdd();
      const strict = await host.readServicesStrictly();
      const ledger = host.ledgerRows();
      const firstRead = guardReadOf(first);
      printObservation(t, 'unreachable-guard', {refusal: refusalOf(first.error),
        read: summarizeServicesRead(firstRead),
        guardOwnerRpcCalls: first.ownerRpc.filter(isGuardOwnerRpc).length,
        hops: first.hops, ledger: ledgerShape(ledger)});
      printObservation(t, 'unreachable-owner-read', {observation: strict.observation,
        error: strict.error?.message, hops: strict.hops});

      await t.test('anchor: the owner-RPC lane itself reports the leader unavailable',
        async (t) => {
          t.equal(strict.observation?.available, false,
            'a leader-required owner read is unavailable');
          const leaderHops = strict.hops.filter((hop) => hop.nodeId === NODE.PEER_A);
          t.ok(leaderHops.length > 0 && leaderHops.every((hop) => hop.refused),
            'every hop it made to the leader was refused');
        });

      await t.test('contract (red today): a typed unavailability with a named reason and ' +
        'an owned reconsideration', async (t) => {
        const refusal = refusalOf(first.error);
        t.ok(first.error, 'the request is refused');
        t.equal(refusal?.authoritativeAvailable, false, 'the authority is unavailable');
        t.ok(typeof refusal?.authoritativeReasonCode === 'string' &&
          refusal.authoritativeReasonCode.length > 0,
        `the refusal names why: ${JSON.stringify(refusal)}`);
        t.ok(reconsiderationOf(first.error),
          'the refusal carries its reconsideration (retry deadline or next action)');
        t.same(ledger, [], 'nothing is created');
      });
    });

  await t.test('anchor (c): the leader holds an occupant on the target that the planner\'s ' +
    'follower and cache have not received', async (t) => {
    world.seedLeaderOnlyRow(buildRuntimeOccupantRow(NODE.PLANNER, Date.now()));
    const runtimeRowsSql = 'SELECT service_id, node_id FROM services WHERE service_type = ?';
    const host = openPlannerHost(t, world);
    t.equal(world.tableRowsOn(NODE.PEER_A, runtimeRowsSql, [RUNTIME_SERVICE]).length, 1,
      'setup: the leader\'s replica holds the occupant');
    t.equal(world.tableRowsOn(NODE.PLANNER, runtimeRowsSql, [RUNTIME_SERVICE]).length, 0,
      'setup: the planner\'s follower replica does not yet');
    t.equal(host.cache.filter(TABLES.SERVICES, (row) => row.service_type === RUNTIME_SERVICE)
      .length, 0, 'setup: nor does the planner\'s cache');
    const first = await host.createAdd();
    const ledger = host.ledgerRows();
    const strict = await host.readServicesStrictly();
    printObservation(t, 'leader-only-occupant', {refusal: refusalOf(first.error),
      read: summarizeServicesRead(guardReadOf(first)), ledger: ledgerShape(ledger),
      leaderRows: strict.observation?.rows});

    await t.test('anchor (green, must stay green): no operation is created while the ' +
      'leader holds an occupant on the target', async (t) => {
      t.equal(first.operation, null, 'no operation is returned');
      t.same(ledger, [], 'no operation row exists');
      t.same(strict.observation?.rows?.map((row) => [row.service_id, row.node_id]),
        [[`${RUNTIME_SERVICE_ID}-r1`, NODE.PLANNER]],
        'the leader-required owner read returns the occupant');
    });

    await t.test('contract (red today): the guard refuses target_node_already_occupied, ' +
      'decided from the leader', async (t) => {
      t.equal(refusalOf(first.error)?.reason, TOPOLOGY_GUARD_REASON.TARGET_NODE_ALREADY_OCCUPIED,
        `refused on the leader's inventory: ${JSON.stringify(refusalOf(first.error))}`);
    });
  });
});

test('anchor (a, green today): the planner node leading services-p1 admits the same request',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const world = await openWorld(t, NODE.PLANNER, PORTS);
    const host = openPlannerHost(t, world);
    const first = await withDiagnosticStacks(() => host.createAdd());
    const ledger = host.ledgerRows();
    const firstRead = guardReadOf(first);
    printObservation(t, 'planner-led', {read: summarizeServicesRead(firstRead),
      refusal: refusalOf(first.error), operationId: first.operation?.operationId,
      guardOwnerRpcCalls: first.ownerRpc.filter(isGuardOwnerRpc).length,
      ledger: ledgerShape(ledger)});
    const rejection = printErrorChain(t, 'planner-led-rejection', first.error);
    t.same(rejection, [], 'createOperation settles without a rejection; its full stack ' +
      'and cause chain are printed above');
    t.equal(first.error, null, `the request is admitted: ${JSON.stringify(refusalOf(first.error))}`);
    t.type(first.operation?.operationId, 'string', 'an operation is returned');
    t.same(ledgerShape(ledger), [{entity_type: RUNTIME_SERVICE, entity_id: RUNTIME_SERVICE_ID,
      target_node_id: NODE.PLANNER}], 'exactly one operation row targets the planner node');
    t.ok(isLeaderWitnessedComplete(firstRead, NODE.PLANNER),
      'the guard read its own replica as the leader: complete and witnessed');
    t.equal(first.hops.length, 0, 'answered on the planner node itself, no transport hop');
    t.equal(first.ownerRpc.filter(isGuardOwnerRpc).length, 0,
      'and not through the query engine\'s owner RPC');
  });
