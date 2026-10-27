// W1, W2 and W9 end-to-end native CDC delivery witnesses over connected
// MessageRouters, released PartitionService sources and native MessageGroups.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {CONFIG_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {
  readCdcObligation,
  readCdcObligationStanding,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
  PARTITION_CDC_OBLIGATION_STANDING,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {
  CDC_COVERAGE_STATE,
  isCommittedCdcDelivery,
  unknownCdcAcceptance,
} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDC_DELIVERY_REMAINING_MS} from '../../src/cdc/cdc-delivery-budget.js';
import {copyCdcEvent} from '../../src/cdc/cdc-event-envelope.js';
import {
  buildDeliveryEnvelope,
  deliveryAnswerOf,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_STRATEGY,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {
  LATENCY_GROUP_STATE,
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_MESSAGE_TYPE,
} from '../../src/topology/latency-topology-constants.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {
  NODE_A,
  NODE_B,
  BUDGET_MS,
  nodeAddressOf,
  activeNodeRow,
  activeServiceRow,
  connectTwoRouters,
  driveWithPump,
  openMultiReplica,
  closeMultiReplica,
  wrapRouterDelivery,
  recordOf,
  cdcEvents,
} from '../message-group/message-group-native-w7-composition.js';
import {
  commandOf,
  writeReleasedSql,
  buildDualBridgeSubscribers,
  subscribeWithoutEagerDrive,
} from '../message-group/cdc-source-occurrence-helpers.js';

const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;

async function setupReleasedConfigProducer(t, f, {configPartId, tempPrefix}) {
  const members = [1, 2, 3].map((n) => [`${configPartId}-r${n}`, NODE_A]);
  f.producer = await formAdmittedGroup({
    partitionId: configPartId,
    members,
    tempPrefix,
    budgetMs: BUDGET_MS,
    serviceOptions: {
      tableName: TABLES.CONFIG,
      tableId: TABLES.CONFIG,
      schema: CONFIG_SCHEMA,
    },
  });
  f.releaseOwners = await attachPartitionReleaseOwners(f.producer.services, {
    directory: path.dirname(f.producer.dbFileOf(members[0])),
    budgetMs: BUDGET_MS,
  });
  t.after(async () => {
    for (const sub of f.subscribers) f.producerLeader?.unsubscribeFromCDC(sub);
    f.topology?.stop();
    f.tree?.stop();
    await Promise.allSettled(
      [...f.services.values()].map((s) => closeMultiReplica(f, s)),
    );
    await Promise.allSettled([
      f.routerA.shutdown(),
      f.routerB.shutdown(),
      f.releaseOwners?.dispose(),
    ]);
    await f.producer?.dispose({retainDirectory: false});
    f.events.length = 0;
    f.native.length = 0;
    f.heldNative.length = 0;
    f.services.clear();
    f.serviceRouters.clear();
    fs.rmSync(f.directory, {recursive: true, force: true});
  });

  const release = await f.releaseOwners.release(configPartId);
  assert.equal(release.outcome, PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER);
  f.producerLeader = f.producer.services[0];
}

test(
  'W1, W2 and W9: distinct same-row occurrences, seed/join bridges, ' +
    'grouped/safe/zero-target waves, 2-MiB CONFIG SQL and 65-event MG vector',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: NODE_A},
      logging: {level: 'fatal'},
      raft: {
        heartbeatIntervalMs: 20,
        electionTimeoutMinMs: 150,
        electionTimeoutMaxMs: 300,
      },
    });
    LoggingService.getInstance().initialize({level: 'fatal'});

    const {routerA, routerB, portA, portB} = await connectTwoRouters(24381, 24382);
    const f = {
      phase: 'setup',
      routerA,
      routerB,
      deliverA: routerA.deliver,
      deliverB: routerB.deliver,
      nodeRows: [
        activeNodeRow(NODE_A, portA, 'mg-w2-source'),
        activeNodeRow(NODE_B, portB, 'mg-w2-target'),
      ],
      services: new Map(),
      serviceRouters: new Map(),
      cutPeers: new Map(),
      events: [],
      native: [],
      heldNative: [],
      heldApplications: [],
      applicationSettlements: new Set(),
      subscribers: [],
      interceptSend: null,
      maxObservedInFlight: 0,
      directory: fs.mkdtempSync(path.join(os.tmpdir(), 'mg-w1-w2-w9-')),
    };
    wrapRouterDelivery(f, routerA, f.deliverA, 'routerA');
    wrapRouterDelivery(f, routerB, f.deliverB, 'routerB');

    const configPartId = 'config-w1-w2-w9';
    await setupReleasedConfigProducer(t, f, {
      configPartId,
      tempPrefix: 'mg-w1-w2-w9-part-',
    });

    const insertSql =
      'INSERT INTO config (config_key, config_value, value_type, ' +
      'default_value, created_at) VALUES (?, ?, ?, ?, ?)';
    const updateSql =
      'UPDATE config SET config_value = ?, updated_at = ? WHERE config_key = ?';

    // W1: two same-row/same-value writes with distinct entryIds
    const debtOcc1 = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      insertSql,
      ['w1-same-key', 'identical-value', 'string', '', 1],
      'w1-occurrence-1',
      TABLES.CONFIG,
    );
    const debtOcc2 = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      updateSql,
      ['identical-value', 2, 'w1-same-key'],
      'w1-occurrence-2',
      TABLES.CONFIG,
    );
    assert.notEqual(debtOcc1.eventKey, debtOcc2.eventKey);
    assert.ok(debtOcc1.logIndex < debtOcc2.logIndex);

    // W2 zero-target wave debt
    const debtZeroTarget = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      insertSql,
      ['w2-zero-target-key', 'zero-target-val', 'string', '', 1],
      'w2-zero-target',
      TABLES.CONFIG,
    );

    // W9: smaller paired row and 2-MiB ASCII payload row
    const twoMiBString = 'x'.repeat(2 * 1024 * 1024);
    const debtSmall = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      insertSql,
      ['w9-small-key', 'small-value', 'string', '', 1],
      'w9-small-row',
      TABLES.CONFIG,
    );
    const debt2MiB = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      insertSql,
      ['w9-2mib-key', twoMiBString, 'string', '', 1],
      'w9-2mib-row',
      TABLES.CONFIG,
    );
    const rawEventBytes = Buffer.byteLength(debt2MiB.eventJson);
    assert.ok(
      rawEventBytes > 2 * 1024 * 1024,
      `2-MiB source eventJson size ${rawEventBytes} exceeds 2 MiB`,
    );

    f.source = await openMultiReplica(f, {
      groupId: 'mg-w2-source',
      replicaId: 'mg-w2-source-r1',
      replicas: ['mg-w2-source-r1'],
      nodeId: NODE_A,
      router: routerA,
      rows: [],
      hints: [nodeAddressOf(NODE_A, 'mg-w2-source-r1')],
      table: TABLES.CONFIG,
    });
    const remoteTarget = await openMultiReplica(f, {
      groupId: 'mg-w2-target',
      replicaId: 'mg-w2-target-r1',
      replicas: ['mg-w2-target-r1'],
      nodeId: NODE_B,
      router: routerB,
      rows: [],
      hints: [nodeAddressOf(NODE_B, 'mg-w2-target-r1')],
      table: TABLES.CONFIG,
    });

    // W9 over-64 vector at the remote MG boundary over real remote router encoding
    const baseEvent = JSON.parse(debtSmall.eventJson);
    const vector65 = Array.from({length: 65}, (_unused, idx) =>
      copyCdcEvent({
        ...baseEvent,
        data: {...baseEvent.data, config_key: `w9-vec-key-${idx}`},
        eventKey: `w9-vec-event-${idx}`,
        entryId: `w9-vec-entry-${idx}`,
        sourceLogIndex: 100 + idx,
        sourceOrdinal: 0,
      }),
    );
    const batchDelivery = await driveWithPump(f, () =>
      routerA.deliver(
        remoteTarget.unifiedAddress,
        {
          type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
          events: vector65,
          sourceNodeId: NODE_A,
          sourceGroupId: 'mg-w2-source',
          targetGroupId: 'mg-w2-target',
          [CDC_DELIVERY_REMAINING_MS]: 5000,
        },
        {targetNodeId: NODE_B, timeoutMs: 5000},
      ),
    );
    assert.equal(
      isCommittedCdcDelivery(batchDelivery, vector65, 'mg-w2-target'),
      true,
      'over-64 durable batch vector commits all 65 occurrences without truncation',
    );
    assert.equal(deliveryAnswerOf(batchDelivery).cdcCommitted.length, 65);
    // W9 65-event vector paired negative controls: truncated 64-event receipt or
    // mutated 65th occurrence identity must fail committed verification.
    const truncated64Delivery = buildDeliveryEnvelope(
      {acknowledged: true},
      {
        ...deliveryAnswerOf(batchDelivery),
        cdcCommitted: deliveryAnswerOf(batchDelivery).cdcCommitted.slice(0, 64),
      },
    );
    assert.equal(
      isCommittedCdcDelivery(truncated64Delivery, vector65, 'mg-w2-target'),
      false,
      'W9 negative control: 64-event truncated receipt is rejected for 65-event vector',
    );
    const mutated65Vector = [
      ...vector65.slice(0, 64),
      {...vector65[64], eventKey: 'w9-vec-event-64-mutated'},
    ];
    assert.equal(
      isCommittedCdcDelivery(batchDelivery, mutated65Vector, 'mg-w2-target'),
      false,
      'W9 negative control: mutated 65th vector element is rejected',
    );

    // Connect both SeedRuntimeBridgeOwner and NodeJoiningPublicationActivation
    const {subSeed, subJoin} = buildDualBridgeSubscribers(
      f,
      TABLES.CONFIG,
      configPartId,
    );
    f.subscribers.push(subSeed, subJoin);
    await subscribeWithoutEagerDrive(f, subSeed, 'w2-seed-subscriber');
    await subscribeWithoutEagerDrive(f, subJoin, 'w2-joining-subscriber');

    // W2 paired negative control (unready bridge selection): while subscribersReady
    // is false, driveCdcObligations holds at the first obligation with zero deliveries.
    f.subscribersReady = false;
    const unreadyDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w2-negative-unready-selection'),
    );
    assert.equal(unreadyDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(readCdcObligation(f.producerLeader.db, debtOcc1.eventKey).delivered, false);
    f.subscribersReady = true;

    // W1 paired negative control: delivering debtOcc1 while withholding debtOcc2
    // must not coalesce or satisfy debtOcc2 despite identical row key and value.
    ConfigurationManager.getInstance().setByPath(
      LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE,
      LATENCY_PROPAGATION_MODE.SAFE,
    );
    let holdAtOcc2 = true;
    let holdAtSmall = true;
    const origApply = f.source.applyCDCBatch.bind(f.source);
    f.source.applyCDCBatch = async (events, options) => {
      if (holdAtOcc2 && events.some((e) => e.entryId === 'w1-occurrence-2')) {
        return unknownCdcAcceptance();
      }
      if (holdAtSmall && events.some((e) => e.entryId === 'w9-small-row')) {
        return unknownCdcAcceptance();
      }
      return origApply(events, options);
    };
    const w1NegativeDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w1-negative-hold-occ2'),
    );
    assert.equal(w1NegativeDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
    await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.flushCdcAcknowledgements('w1-occ1-ack'),
    );
    assert.equal(
      await f.producer.waitFor(() =>
        f.producer.services.every(
          (s) =>
            readCdcObligationStanding(s.db, debtOcc1).standing ===
            PARTITION_CDC_OBLIGATION_STANDING.RECLAIMED,
        ),
      ),
      true,
      'W1 negative control: first same-row occurrence acknowledged and reclaimed',
    );
    assert.equal(
      readCdcObligation(f.producerLeader.db, debtOcc2.eventKey).delivered,
      false,
      'W1 negative control: second same-row/same-value occurrence stays owed when withheld',
    );
    holdAtOcc2 = false;

    const zeroDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w2-zero-target-pass'),
    );
    assert.equal(zeroDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
    const zeroReturns = f.events.filter(
      (e) => e.kind === 'subscriber-return' && e.eventKey === debtZeroTarget.eventKey,
    );
    assert.equal(zeroReturns.length, 2, 'both seed and joining bridges ran zero-target wave');
    for (const ret of zeroReturns) {
      assert.equal(ret.result.targetGroupCount, 0);
      assert.equal(ret.result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    }

    // Now add remoteTarget to source cache + LATENCY_GROUPS to exercise GROUPED mode
    // on debtSmall and SAFE mode on debt2MiB
    holdAtSmall = false;
    f.source.applyCDCBatch = origApply;
    f.source.systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.INSERT,
      activeServiceRow(
        'mg-w2-target',
        'mg-w2-target-r1',
        NODE_B,
        RAFT_ROLE.LEADER,
      ),
    );
    for (const groupRow of [
      {
        group_id: 'mg-w2-source',
        coordinator_node_id: NODE_A,
        state: LATENCY_GROUP_STATE.ACTIVE,
      },
      {
        group_id: 'mg-w2-target',
        coordinator_node_id: NODE_B,
        state: LATENCY_GROUP_STATE.ACTIVE,
      },
    ]) {
      f.source.systemTableCache.applySystemTableChange(
        TABLES.LATENCY_GROUPS,
        CDC_OPERATION.INSERT,
        groupRow,
      );
    }
    f.tree.recompute();
    ConfigurationManager.getInstance().setByPath(
      LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE,
      LATENCY_PROPAGATION_MODE.GROUPED,
    );

    // W9 2-MiB paired negative control: reject the >2-MiB remote delivery on the
    // first pass and verify debt2MiB remains undelivered in the source ledger.
    let reject2MiBOnce = true;
    f.interceptSend = async ({router, envelope}) => {
      if (
        reject2MiBOnce &&
        router === 'routerA' &&
        cdcEvents(envelope).some((item) => item.eventKey === debt2MiB.eventKey)
      ) {
        reject2MiBOnce = false;
        return {
          overrideResult: buildDeliveryEnvelope(
            {acknowledged: true},
            unknownCdcAcceptance(),
          ),
        };
      }
      return null;
    };

    let switchToSafeOn2MiB = true;
    const origPropagate = f.topology.propagateCDCEvent.bind(f.topology);
    f.topology.propagateCDCEvent = async (opts) => {
      if (switchToSafeOn2MiB && opts.entryId === 'w9-2mib-row') {
        ConfigurationManager.getInstance().setByPath(
          LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE,
          LATENCY_PROPAGATION_MODE.SAFE,
        );
      }
      return origPropagate(opts);
    };

    const twoMiBNegativeDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w9-2mib-negative-pass'),
    );
    assert.equal(twoMiBNegativeDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(
      readCdcObligation(f.producerLeader.db, debt2MiB.eventKey).delivered,
      false,
      'W9 negative control: rejected 2-MiB remote delivery leaves debt2MiB owed',
    );
    f.interceptSend = null;

    const fullDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w1-w2-w9-full-pass'),
    );
    assert.equal(fullDrive.state, DRIVE.DRAINED);
    switchToSafeOn2MiB = false;

    const smallReturn = f.events.findLast(
      (e) =>
        e.kind === 'subscriber-return' &&
        e.eventKey === debtSmall.eventKey &&
        e.result.success === true,
    );
    assert.equal(smallReturn.result.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
    assert.equal(
      smallReturn.result.strategy,
      CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
    );
    assert.equal(smallReturn.result.targetGroupCount, 1);

    const twoMiBReturn = f.events.findLast(
      (e) =>
        e.kind === 'subscriber-return' &&
        e.eventKey === debt2MiB.eventKey &&
        e.result.success === true,
    );
    assert.equal(twoMiBReturn.result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
    assert.equal(
      twoMiBReturn.result.strategy,
      CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
    );
    assert.equal(twoMiBReturn.result.targetGroupCount, 1);

    const twoMiBSend = f.events.find(
      (e) =>
        e.kind === 'application-send' &&
        e.router === 'routerA' &&
        cdcEvents(e.envelope).some((item) => item.eventKey === debt2MiB.eventKey),
    );
    assert.ok(twoMiBSend, '2-MiB event traversed routerA remote delivery');
    assert.ok(
      twoMiBSend.encodedBytes > 2 * 1024 * 1024,
      `measured wire frame ${twoMiBSend.encodedBytes} > 2 MiB`,
    );

    // W1: verify both distinct occurrences for w1-same-key are retained in source MG
    const sourceRecord = recordOf(f.source);
    const sourceOccEntries = sourceRecord.entries.filter((entry) => {
      const cmd = commandOf(entry);
      const evs = cmd?.events ?? (cmd ? [cmd] : []);
      return evs.some(
        (ev) =>
          ev.eventKey === debtOcc1.eventKey || ev.eventKey === debtOcc2.eventKey,
      );
    });
    assert.ok(
      sourceOccEntries.length >= 2,
      'two same-row/same-value writes remain two distinct native occurrences',
    );
    assert.equal(
      remoteTarget.systemTableCache.get(TABLES.CONFIG, 'w9-2mib-key')?.config_value
        ?.length,
      2 * 1024 * 1024,
    );

    await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.flushCdcAcknowledgements('w1-w2-w9-ack'),
    );
    for (const debt of [debtOcc1, debtOcc2, debtZeroTarget, debtSmall, debt2MiB]) {
      assert.equal(
        await f.producer.waitFor(() =>
          f.producer.services.every(
            (s) =>
              readCdcObligationStanding(s.db, debt).standing ===
              PARTITION_CDC_OBLIGATION_STANDING.RECLAIMED,
          ),
        ),
        true,
        `source ACK reclaimed ${debt.entryId}`,
      );
    }
  },
);

test(
  'W9: 65 distinct native target groups complete across remote router window of 2',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: NODE_A},
      logging: {level: 'fatal'},
      raft: {
        heartbeatIntervalMs: 20,
        electionTimeoutMinMs: 150,
        electionTimeoutMaxMs: 300,
      },
    });
    LoggingService.getInstance().initialize({level: 'fatal'});

    const {routerA, routerB, portA, portB} = await connectTwoRouters(24383, 24384);
    const f = {
      phase: 'setup',
      routerA,
      routerB,
      deliverA: routerA.deliver,
      deliverB: routerB.deliver,
      nodeRows: [
        activeNodeRow(NODE_A, portA, 'mg-w9-source'),
        activeNodeRow(NODE_B, portB, 'mg-w9-target-01'),
      ],
      services: new Map(),
      serviceRouters: new Map(),
      cutPeers: new Map(),
      events: [],
      native: [],
      heldNative: [],
      heldApplications: [],
      applicationSettlements: new Set(),
      subscribers: [],
      interceptSend: null,
      maxObservedInFlight: 0,
      directory: fs.mkdtempSync(path.join(os.tmpdir(), 'mg-w9-65-targets-')),
    };
    wrapRouterDelivery(f, routerA, f.deliverA, 'routerA');
    wrapRouterDelivery(f, routerB, f.deliverB, 'routerB');

    const configPartId = 'config-w9-65';
    await setupReleasedConfigProducer(t, f, {
      configPartId,
      tempPrefix: 'mg-w9-65-part-',
    });

    const insertSql =
      'INSERT INTO config (config_key, config_value, value_type, ' +
      'default_value, created_at) VALUES (?, ?, ?, ?, ?)';
    const debt = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      insertSql,
      ['w9-fanout-65-key', 'fanout-65-value', 'string', '', 1],
      'w9-fanout-65',
      TABLES.CONFIG,
    );

    const targetGroupIds = Array.from(
      {length: 65},
      (_unused, idx) => `mg-w9-target-${String(idx + 1).padStart(2, '0')}`,
    );
    const serviceRows = [];
    for (const groupId of targetGroupIds) {
      const replicaId = `${groupId}-r1`;
      await openMultiReplica(f, {
        groupId,
        replicaId,
        replicas: [replicaId],
        nodeId: NODE_B,
        router: routerB,
        rows: [],
        hints: [nodeAddressOf(NODE_B, replicaId)],
        table: TABLES.CONFIG,
      });
      serviceRows.push(
        activeServiceRow(groupId, replicaId, NODE_B, RAFT_ROLE.LEADER),
      );
    }

    f.source = await openMultiReplica(f, {
      groupId: 'mg-w9-source',
      replicaId: 'mg-w9-source-r1',
      replicas: ['mg-w9-source-r1'],
      nodeId: NODE_A,
      router: routerA,
      rows: [
        activeServiceRow('mg-w9-source', 'mg-w9-source-r1', NODE_A, RAFT_ROLE.LEADER),
        ...serviceRows,
      ],
      hints: [nodeAddressOf(NODE_A, 'mg-w9-source-r1')],
      table: TABLES.CONFIG,
    });

    const {subSeed} = buildDualBridgeSubscribers(f, TABLES.CONFIG, configPartId);
    f.subscribers.push(subSeed);
    await subscribeWithoutEagerDrive(f, subSeed, 'w9-65-seed-sub');
    f.subscribersReady = true;

    // Paired negative control: fail the 65th target group (simulating a 64-target
    // truncation/refusal) and verify the wave stays incomplete with zero ACKs.
    const lastAddress = nodeAddressOf(NODE_B, 'mg-w9-target-65-r1');
    let withhold65th = true;
    f.interceptSend = async ({address}) => {
      if (withhold65th && address === lastAddress) {
        return {
          overrideResult: buildDeliveryEnvelope(
            {acknowledged: true},
            unknownCdcAcceptance(),
          ),
        };
      }
      return null;
    };

    const negativeDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w9-65th-withheld'),
    );
    assert.equal(negativeDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(readCdcObligation(f.producerLeader.db, debt.eventKey).delivered, false);
    const cell = f.producerLeader.cdcDelivery.obligationLane.currentObligation;
    assert.ok(cell, 'source progress cell retains the 64 completed target receipts');
    const branchTargets = cell.branches[0].topology.targets;
    assert.equal(branchTargets.length, 65);
    assert.equal(
      branchTargets.filter((t) => t.coverage.state === CDC_COVERAGE_STATE.COMMITTED)
        .length,
      64,
    );
    assert.equal(
      branchTargets.find((t) => t.groupId === 'mg-w9-target-65').coverage.state,
      CDC_COVERAGE_STATE.UNCOVERED,
    );

    // Restore the 65th target group and complete the wave
    withhold65th = false;
    f.interceptSend = null;
    const positiveDrive = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w9-65th-restored'),
    );
    assert.equal(positiveDrive.state, DRIVE.DRAINED);
    assert.ok(
      f.maxObservedInFlight <= 2,
      `active dispatches ${f.maxObservedInFlight} obey outboundQueueMaxConcurrent=2`,
    );
    for (const groupId of targetGroupIds) {
      const targetService = f.services.get(`${groupId}-r1`);
      assert.equal(
        targetService.systemTableCache.get(TABLES.CONFIG, 'w9-fanout-65-key')
          ?.config_value,
        'fanout-65-value',
      );
    }
    await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.flushCdcAcknowledgements('w9-65-ack'),
    );
    assert.equal(
      await f.producer.waitFor(() =>
        f.producer.services.every(
          (s) =>
            readCdcObligationStanding(s.db, debt).standing ===
            PARTITION_CDC_OBLIGATION_STANDING.RECLAIMED,
        ),
      ),
      true,
    );
  },
);
