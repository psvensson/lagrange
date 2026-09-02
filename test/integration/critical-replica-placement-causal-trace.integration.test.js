/**
 * S6a live causal trace (quest critical-placement-causal-trace).
 *
 * Forms a real three-node in-process cluster through the production join
 * path, then TRACES - never repairs - one critical partition chosen from the
 * measured baseline and one ordinary user-table control partition, stage by
 * stage along the convergence chain, sampling only persisted evidence: the
 * S3 three-state observation, the partitions policy rows, the services
 * holder rows, and the replica_operations ledger. The stage classifier
 * (test/integration/helpers/critical-placement-trace-classifier.js) then
 * names the FIRST transition that never occurred, with its owner; if the
 * ledger stage is the missing one, an active probe drives ONE evaluation of
 * the partition's own production rebalancer (real coordinator, real policy
 * service - the instances the cluster itself wired) to split planner
 * emission from admission. The full trace lands in
 * solve/report/critical-placement-causal-trace-live.json.
 */

import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import path from 'node:path';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  resolveCriticalPartitionPlacement,
} from '../../src/bootstrap/critical-placement-convergence.js';
import {
  observeCriticalPlacement,
} from '../../src/bootstrap/critical-placement-formation-observer.js';
import {
  evaluateOperationLedgerQuorumConcentration,
} from '../../src/rebalancer/operation-ledger-quorum-concentration.js';
import {
  classifyPlacementTrace,
  comparePlacementTraces,
} from './helpers/critical-placement-trace-classifier.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 300000;
const READY_TIMEOUT_MS = 12000;
// Join budget measured for this three-full-nodes-one-event-loop harness by
// three-node-seed-rebalance (node3 join observed 12441-14748ms).
const JOIN_READY_TIMEOUT_MS = 25000;
const FORMATION_DISCOVERY_MS = 250;
const POLL_INTERVAL_MS = 100;
const SAMPLE_INTERVAL_MS = 500;
const TRACE_BUDGET_MS = 90000;
const CONTROL_TABLE_NAME = 'trace_control_ordinary';
const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440100';
const NODE2_ID = '550e8400-e29b-41d4-a716-446655440101';
const NODE3_ID = '550e8400-e29b-41d4-a716-446655440102';
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const TRACE_ARTIFACT_PATH =
  'solve/report/critical-placement-causal-trace-live.json';

function readRows(systemTableCache, tableName, predicate) {
  return systemTableCache.filter(tableName, predicate || (() => true)) || [];
}

function partitionSample(systemTableCache, partitionId, atMs) {
  const partitionRow = systemTableCache.get(
    SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || null;
  const serviceRows = readRows(systemTableCache, SYSTEM_TABLE_NAME.SERVICES,
    (row) => row.partition_id === partitionId &&
      row.service_type === SERVICE_TYPE.PARTITION);
  const operations = readRows(systemTableCache,
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    (row) => row.partition_id === partitionId).map((row) => ({
    operation_id: row.operation_id,
    type: row.type,
    status: row.status,
    workflow_step: row.workflow_step,
    target_node_id: row.target_node_id,
    created_at: row.created_at,
    completed_at: row.completed_at ?? null,
  }));
  const placement = resolveCriticalPartitionPlacement({
    partitionId,
    partitionRow,
    serviceRows,
  });
  return {
    atMs,
    placement: {
      partitionId,
      evidenceState: placement.evidenceState,
      requiredReplicaCount: placement.requiredReplicaCount,
      requiredReplicaCountSource: placement.requiredReplicaCountSource,
      distinctNodeCount: placement.distinctNodeCount,
      distinctNodeIds: [...placement.distinctNodeIds],
      reasonCode: placement.reasonCode,
    },
    operations,
    serviceRows: serviceRows.map((row) => ({
      node_id: row.node_id,
      replica_id: row.replica_id,
      raft_role: row.raft_role,
      status: row.status,
    })),
  };
}

function laneStabilized(samples) {
  const tail = samples.slice(-3);
  return tail.length === 3 && tail.every((sample) =>
    sample.placement.evidenceState ===
      CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED);
}

async function sampleBothLanes(options) {
  const startedAt = Date.now();
  const criticalSamples = [];
  const controlSamples = [];
  const ledgerSamples = [];
  const ledgerHoldTimeline = [];
  while (Date.now() - startedAt < TRACE_BUDGET_MS) {
    const atMs = Date.now() - startedAt;
    criticalSamples.push(partitionSample(options.systemTableCache,
      options.tracedCriticalPartitionId, atMs));
    controlSamples.push(partitionSample(options.systemTableCache,
      options.controlPartitionId, atMs));
    ledgerSamples.push(partitionSample(options.systemTableCache,
      LEDGER_PARTITION_ID, atMs));
    const hold = summarizeLedgerHold(options.systemTableCache);
    const previous = ledgerHoldTimeline[ledgerHoldTimeline.length - 1];
    if (!previous ||
        JSON.stringify(previous.hold) !== JSON.stringify(hold)) {
      ledgerHoldTimeline.push({atMs, hold});
    }
    if (laneStabilized(criticalSamples) && laneStabilized(controlSamples)) {
      break;
    }
    await sleep(SAMPLE_INTERVAL_MS);
  }
  return {criticalSamples, controlSamples, ledgerSamples, ledgerHoldTimeline};
}

// The hold-owner's OWN projection, sampled per tick: whether the
// operation-ledger spread hold is engaged and what its cure believes about
// feasible targets. This is the boundary the first trace run implicated
// (coordinator: 'deferring dependent operation admission until the ledger
// spreads' with feasibleTargetNodeIds []), so the instrument measures the
// owner's answer directly rather than scraping logs.
function summarizeLedgerHold(systemTableCache) {
  const evaluation =
    evaluateOperationLedgerQuorumConcentration(systemTableCache);
  return {
    holdEngaged: evaluation.holdEngaged === true,
    concentratedPartitions: (evaluation.concentratedPartitions || [])
      .map((entry) => ({
        partitionId: entry.partitionId,
        targetReplicaCount: entry.targetReplicaCount ?? null,
        totalVoters: entry.totalVoters ?? null,
        maxVotersOnOneNode: entry.maxVotersOnOneNode ?? null,
        distinctVoterNodeIds: [...(entry.distinctVoterNodeIds || [])],
        feasibleTargetNodeIds: [...(entry.feasibleTargetNodeIds || [])],
        overTarget: entry.overTarget === true,
        spreadActionable: entry.spreadActionable === true,
      })),
  };
}

// The measured predicate for the terminal answer: what THIS run observed,
// stated so a reader can distinguish the stable facts from the run-dependent
// ones - hold engagement varies between runs (engaged throughout in some,
// released mid-trace in others) while the missing arrow itself has
// reproduced in every run.
function buildFirstMissingAnswer(options) {
  const {criticalTrace, criticalSamples, ledgerHoldTimeline,
    activeProbe} = options;
  const addLikeOperationsSeen = criticalSamples.some((sample) =>
    (sample.operations || []).some((row) =>
      ['ADD', 'REPLACE'].includes(String(row.type || '').toUpperCase())));
  const engagedEntries = ledgerHoldTimeline.filter(
    (entry) => entry.hold.holdEngaged);
  const firstEntry = ledgerHoldTimeline[0];
  const lastEntry = ledgerHoldTimeline[ledgerHoldTimeline.length - 1];
  const predicate = {
    addLikeOperationsRecordedForTracedPartition: addLikeOperationsSeen,
    sampleCount: criticalSamples.length,
    traceBudgetMs: TRACE_BUDGET_MS,
    holdTimelineStates: ledgerHoldTimeline.length,
    holdEngagedStates: engagedEntries.length,
    holdEngagedAtTraceStart: firstEntry?.hold.holdEngaged === true,
    holdEngagedAtTraceEnd: lastEntry?.hold.holdEngaged === true,
    activeProbeOutcome: activeProbe ?? null,
  };
  if (criticalTrace.firstMissingStage === null) {
    return {finding: 'all-transitions-complete',
      detail: criticalTrace.note, predicate};
  }
  return {finding: criticalTrace.firstMissingStage,
    owner: criticalTrace.firstMissingOwner,
    detail: criticalTrace.note, predicate};
}

function summarizeProbeMove(move) {
  const source = move || {};
  const admission = source.admission || {};
  return {
    operation: source.operation ?? null,
    nodeId: source.nodeId ?? null,
    skipped: source.skipped === true,
    reason: source.reason ?? null,
    admissionReason: admission.reason ?? null,
    admissionDecisionType: admission.decisionType ?? null,
  };
}

function sleep(delayMs) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, delayMs);
  });
}

// Active probe, only when the ledger arrow is the missing one: ONE
// evaluation of the partition's OWN production rebalancer (the instance the
// cluster itself wired - real coordinator, real policy service) splits
// planner emission from admission. The services map is keyed by REPLICA id.
async function runActiveProbeIfNeeded(options) {
  const {criticalTrace, partitionServices, tracedCriticalPartitionId,
    artifact} = options;
  if (criticalTrace.firstMissingStage !== 'operation_recorded') {
    return;
  }
  const serviceKeys = [...partitionServices.keys()];
  const tracedReplicaKey = serviceKeys.find((key) =>
    key.startsWith(`${tracedCriticalPartitionId}-r`));
  const partitionService = tracedReplicaKey ?
    partitionServices.get(tracedReplicaKey) :
    null;
  const productionRebalancer = partitionService?.rebalancer || null;
  artifact.partitionServicesDiagnostics = {
    keyCount: serviceKeys.length,
    keySample: serviceKeys.slice(0, 5),
    tracedReplicaKey: tracedReplicaKey || null,
    tracedServicePresent: Boolean(partitionService),
    tracedServiceHasRebalancer: Boolean(productionRebalancer),
  };
  if (!productionRebalancer) {
    artifact.activeProbe = {
      ran: false,
      reason: 'no production rebalancer instance for the traced ' +
        'partition on the seed - the evaluation lane itself is absent',
    };
    return;
  }
  const probeResult =
    await productionRebalancer.rebalance('s6a_causal_trace_probe');
  artifact.activeProbe = {
    ran: true,
    success: probeResult?.success === true,
    moves: (probeResult?.moves || []).map(summarizeProbeMove),
  };
}

test('critical placement causal trace', {timeout: TEST_TIMEOUT_MS},
  async (t) => {
    initializeTestEnvironment({nodeId: SEED_NODE_ID});
    LoggingService.getInstance().initialize({level: 'warn'});

    const seedWsPort = getUniquePort();
    const node2WsPort = getUniquePort();
    const node3WsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: SEED_NODE_ID,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {...TEST_CONFIG.bootstrap, leadershipWaitTimeoutMs: 2000},
    });

    let bootstrapResult = null;
    let seedApi = null;
    let node2JoinService = null;
    let node3JoinService = null;
    const artifact = {
      generatedAt: new Date().toISOString(),
      cluster: {seed: SEED_NODE_ID, joiners: [NODE2_ID, NODE3_ID]},
    };

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap succeeds');
      const systemTableCache =
        NodeService.getInstance().getSystemTableCache();
      const queryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        cdcIntegrationService: bootstrapService.cdcIntegrationService,
        rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
        nodeId: SEED_NODE_ID,
      });
      seedApi = new BootstrapAPI({
        seedNodeId: SEED_NODE_ID,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(queryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      const joinConfig = {
        ...TEST_CONFIG.bootstrap,
        httpTimeoutMs: 5000,
        leadershipWaitTimeoutMs: 12000,
        priorityPlacementFormationDiscoveryMs: FORMATION_DISCOVERY_MS,
      };
      node2JoinService = new NodeJoiningService({
        nodeId: NODE2_ID,
        nodeAddress: `ws://localhost:${node2WsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: node2WsPort,
        config: joinConfig,
        httpPost,
      });
      node3JoinService = new NodeJoiningService({
        nodeId: NODE3_ID,
        nodeAddress: `ws://localhost:${node3WsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: node3WsPort,
        config: joinConfig,
        httpPost,
      });

      const node2Result = await node2JoinService.join();
      t.equal(node2Result.success, true, 'node2 joins');
      const node3Result = await node3JoinService.join();
      t.equal(node3Result.success, true, 'node3 joins');

      const nodesReady = await waitFor(() => {
        const now = Date.now();
        const readyNodes = readRows(systemTableCache, SYSTEM_TABLE_NAME.NODES,
          (row) => isNodeRecordReady(row, {now, requireActiveStatus: true}));
        const readyIds = new Set(readyNodes.map((row) => row.node_id));
        return readyIds.has(SEED_NODE_ID) && readyIds.has(NODE2_ID) &&
          readyIds.has(NODE3_ID);
      }, JOIN_READY_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(nodesReady, true, 'all three nodes reach READY');

      await t.test('fresh-formation-critical-baseline-measured',
        async (st) => {
          const baseline = observeCriticalPlacement({systemTableCache});
          artifact.baselineObservation = {
            evidenceState: baseline.evidenceState,
            reasonCodes: [...baseline.reasonCodes],
            observedPartitionCount: baseline.observedPartitionCount,
            pendingPartitionIds: [...baseline.pendingPartitionIds],
            unknownPartitionIds: [...baseline.unknownPartitionIds],
            membershipEpoch: {...baseline.membershipEpoch},
          };
          st.ok(baseline.observedPartitionCount > 0,
            'the whole declared critical set is inspected');
          st.ok(baseline.evidenceState !==
            CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN ||
            baseline.unknownPartitionIds.length > 0 ||
            baseline.reasonCodes.length > 0,
          'the baseline is a typed measurement, never a shrug');
          st.equal(baseline.unknownPartitionIds.length, 0,
            'every critical partition has authoritative persisted policy ' +
            'on a fresh formation');
        });

      // The traced critical partition comes from the MEASUREMENT: the first
      // pending critical partition at baseline; a fully converged baseline
      // traces the first critical partition and records completion.
      const baselineObservation = observeCriticalPlacement({systemTableCache});
      const tracedCriticalPartitionId =
        baselineObservation.pendingPartitionIds[0] ||
        [...(readRows(systemTableCache, SYSTEM_TABLE_NAME.PARTITIONS)
          .map((row) => row.partition_id))].sort()[0];
      artifact.tracedCriticalPartitionId = tracedCriticalPartitionId;

      // The ordinary control lane: a real user table created through the
      // production engine AFTER formation, so its partition's whole chain
      // (policy row, provisioning, placement) runs beside the critical one.
      const createResult = await queryEngine.executeQuery(
        `CREATE TABLE ${CONTROL_TABLE_NAME} (id INTEGER PRIMARY KEY, ` +
        'payload TEXT)');
      t.equal(createResult.success !== false, true,
        'the ordinary control table is created');
      // Provisioning is MEASURED, never required: on the first live runs the
      // ordinary lane could not even provision its partition row - the same
      // deferred-admission mechanism that parks the critical lane parks
      // user-table provisioning. A stall here is A/B evidence, not a broken
      // instrument.
      let controlPartitionId = null;
      await waitFor(() => {
        const controlRows = readRows(systemTableCache,
          SYSTEM_TABLE_NAME.PARTITIONS,
          (row) => String(row.table_id || row.table_name || '') ===
            CONTROL_TABLE_NAME ||
            String(row.partition_id || '').startsWith(CONTROL_TABLE_NAME));
        controlPartitionId = controlRows[0]?.partition_id || null;
        return controlPartitionId !== null;
      }, READY_TIMEOUT_MS, POLL_INTERVAL_MS);
      artifact.controlPartitionId = controlPartitionId;
      artifact.controlProvisioning = controlPartitionId ?
        {completed: true} :
        {completed: false,
          detail: 'CREATE TABLE succeeded but no partitions row appeared ' +
            `within ${READY_TIMEOUT_MS}ms - ordinary user-plane ` +
            'provisioning is starved before the control lane can even ' +
            'acquire authoritative policy'};
      t.ok(true,
        `control provisioning measured: ${JSON.stringify(
          artifact.controlProvisioning)}`);

      // Sample both lanes on one clock until budget or joint stabilization.
      const {criticalSamples, controlSamples, ledgerSamples,
        ledgerHoldTimeline} = await sampleBothLanes({
        systemTableCache,
        tracedCriticalPartitionId,
        controlPartitionId,
      });
      const ledgerTrace = classifyPlacementTrace({
        baseline: ledgerSamples[0], samples: ledgerSamples});
      artifact.ledger = {
        partitionId: LEDGER_PARTITION_ID,
        sampleCount: ledgerSamples.length,
        firstSample: ledgerSamples[0],
        lastSample: ledgerSamples[ledgerSamples.length - 1],
        stages: ledgerTrace.stages,
        firstMissingStage: ledgerTrace.firstMissingStage,
        firstMissingOwner: ledgerTrace.firstMissingOwner,
      };
      artifact.ledgerHoldTimeline = ledgerHoldTimeline;
      const criticalTrace = classifyPlacementTrace({
        baseline: criticalSamples[0], samples: criticalSamples});
      const controlTrace = classifyPlacementTrace({
        baseline: controlSamples[0], samples: controlSamples});
      artifact.critical = {
        partitionId: tracedCriticalPartitionId,
        sampleCount: criticalSamples.length,
        firstSample: criticalSamples[0],
        lastSample: criticalSamples[criticalSamples.length - 1],
        stages: criticalTrace.stages,
        firstMissingStage: criticalTrace.firstMissingStage,
        firstMissingOwner: criticalTrace.firstMissingOwner,
      };
      artifact.control = {
        partitionId: controlPartitionId,
        sampleCount: controlSamples.length,
        firstSample: controlSamples[0],
        lastSample: controlSamples[controlSamples.length - 1],
        stages: controlTrace.stages,
        firstMissingStage: controlTrace.firstMissingStage,
        firstMissingOwner: controlTrace.firstMissingOwner,
      };
      artifact.comparison = controlPartitionId ?
        comparePlacementTraces(criticalTrace, controlTrace) :
        Object.freeze({
          shape: 'control_provisioning_stalled',
          detail: 'the ordinary lane never provisioned its partition, so ' +
            'it stops before authority_known - starved even earlier than ' +
            'the critical lane by the same deferred-admission mechanism',
        });

      // Active probe, only when the ledger arrow is the missing one: ONE
      // evaluation of the partition's OWN production rebalancer (the
      // instance the cluster wired, real coordinator, real policy service)
      // splits planner emission from admission.
      await runActiveProbeIfNeeded({
        criticalTrace,
        partitionServices: bootstrapResult.partitionServices,
        tracedCriticalPartitionId,
        artifact,
      });

      await t.test('one-critical-partition-traced-stage-by-stage',
        async (st) => {
          st.ok(criticalSamples.length >= 3,
            'the critical lane is sampled repeatedly, not snapshotted once');
          st.equal(criticalTrace.stages.length, 9,
            'every stage of the declared chain is measured');
          for (const stage of criticalTrace.stages) {
            st.ok(Object.hasOwn(stage, 'reached') && stage.owner,
              `${stage.stage} carries reached + owner`);
          }
        });

      await t.test('ordinary-control-traced-beside-critical', async (st) => {
        st.ok(controlSamples.length >= 3,
          'the control lane is sampled on the same clock');
        st.ok(artifact.comparison.shape,
          'the A/B comparison resolves one of the diagnostic shapes: ' +
          artifact.comparison.shape);
      });

      await t.test('first-missing-transition-named-with-owner-and-predicate',
        async (st) => {
          const answer = buildFirstMissingAnswer({
            criticalTrace, criticalSamples, ledgerHoldTimeline,
            activeProbe: artifact.activeProbe,
          });
          const predicate = answer.predicate;
          artifact.firstMissingTransitionAnswer = answer;
          st.ok(answer.finding,
            `the terminal answer is specific: ${JSON.stringify(answer.finding)}`);
          st.ok(answer.predicate &&
            typeof answer.predicate.sampleCount === 'number',
          'the answer carries its measured predicate');
          if (criticalTrace.firstMissingStage !== null) {
            st.ok(criticalTrace.firstMissingOwner,
              'a missing transition names its owning module');
            st.equal(predicate.addLikeOperationsRecordedForTracedPartition,
              false,
              'the missing operation_recorded arrow is the measured absence ' +
              'of any add-like ledger row for the traced partition');
          }
        });
    } finally {
      fs.mkdirSync(path.dirname(TRACE_ARTIFACT_PATH), {recursive: true});
      fs.writeFileSync(TRACE_ARTIFACT_PATH,
        `${JSON.stringify(artifact, null, 2)}\n`);
      try {
        await gracefulJoiningShutdown(node3JoinService);
      } catch (error) {
        t.comment(`node3 shutdown: ${error.message}`);
      }
      try {
        await gracefulJoiningShutdown(node2JoinService);
      } catch (error) {
        t.comment(`node2 shutdown: ${error.message}`);
      }
      try {
        await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      } catch (error) {
        t.comment(`cluster shutdown: ${error.message}`);
      }
      await cleanupTestEnvironment();
    }
  });
