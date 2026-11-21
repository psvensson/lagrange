// Placement-owner authority fixture: the proof transfer of the surrogate
// scheduling requirements onto the production ReplicaPlacementOwner (owner
// decision 2026-11-21, reports/placement-owner-proof-transfer.md P0-P15).
//
// REAL, production constructors and paths:
// - ControlPlaneSetup.create on every node: its RebalanceCoordinator with the
//   bound placement-owner factory, workflow owner, StorageCapacityAccountingService
//   and ControlPlaneReadinessService.
// - PartitionService for replica_operations-p1 (and for target partitions):
//   the canonical schema, the committed apply path, raft role events delivered
//   by the consensus port (applyReplicaLeadership/applyReplicaDemotion, the
//   leader activation gate and its 250 ms holdoff), the owner attached by
//   maybeInitializeRebalancer through the coordinator.
// - SystemTableCache per node; every row enters through applySystemTableChange.
// - ServeEligibilityOwner per node (the placement owner's node authority).
// - The leader publication producer of a target partition: applyReplicaLeadership
//   -> queueRoleUpdate (collapses leader to follower) and queueLeaderNodeUpdate
//   -> the partition's AuthoritativeRowMutationHelper -> gateway.submitMutation.
// SUBSTITUTED (evidence ceiling, stated in every witness record):
// - Consensus: one ControllableConsensusPort per replica. The ledger log, its
//   order, which replica applies an entry and when, and which entries a deposed
//   leader got into the log are the fixture's (LedgerLog), not rs-raft
//   election, quorum or truncation. As raft-rs does, a leader appends an empty
//   TERM-START entry when it is elected or leads a new term; a replica applies
//   entries in log order, and a held replica applies no COMMAND (an empty
//   entry only when nothing earlier is unapplied on it). Each ledger replica's
//   port status carries currentTermApplied, the rs-raft status field
//   (raft-rs-status-observation.js) the double omits, answered from that log;
//   APPLIED_PROGRESS is announced when a replica's applied position advances.
// - The committed NODES / control_plane_publications read of each
//   ServeEligibilityOwner is answered by the fixture (FORMED, ready nodes).
// - The publication transport: the mutation the real producer submits is
//   delivered by the fixture as an UPDATE into each node's cache through
//   applySystemTableChange (immediately, or when released).
// - ControlPlaneSetup.create's router, CDC integration and SQL engine are inert.
// Leader identity is the production shape: SERVICES rows carry follower roles
// only (raft_role 'leader' is never written); the leader is PARTITIONS
// leader_node_id.
//
// Counts: the owner object is instrumented by transparent instance wrappers
// (runPass, readPartitionPlacementRows, readStorageExcludedTargets,
// isCandidateAdmissibleNow, admitPlacement, releasePlacementHold). Each record
// carries the owner's boolean, the ledger service's leadershipTenure object,
// the core's role/term at the time of the call and the pass it belongs to: the
// pass in whose asynchronous context the call runs (AsyncLocalStorage), exact
// also while an obsolete pass and a current one are both outstanding.
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import fs from 'node:fs';
import {after} from 'node:test';
import {ControlPlaneSetup} from '../../src/bootstrap/shared/control-plane-setup.js';
import {
  REPLICA_OPERATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {COLUMN} from '../../src/constants/columns.js';
import {CDC_OPERATION, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {ServeEligibilityOwner} from '../../src/control-plane/serve-eligibility-owner.js';
import {RAFT_EVENT, RAFT_ROLE} from '../../src/raft/constants.js';
import {createRaftOperationPort, deepFreeze} from '../../src/raft/raft-operation-port.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {createControllablePartitionService} from '../partition/partition-service-test-support.js';
import {ControllableConsensusPort} from '../test-helpers/controllable-consensus-port.js';
import {
  resumeFixtureParticipantAdmission, settleTicks, shutdownAll, startReplica, temporaryDbPath,
} from '../test-helpers/participant-transaction-fixture.js';

const LEDGER = 'replica_operations-p1';
const LEASE_MS = 3_600_000;
const STORAGE_BUDGET_BYTES = 64 * 1024 * 1024 * 1024;
const FORMATION_EPOCH = 3;
const WAIT_MS = 5_000;
const POLL_MS = 5;
const TEST_TABLE_SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT'},
]});

const settle = () => new Promise((resolve) => setImmediate(resolve));
const LEAKED_TIMERS = [];
const TIMER_STACK_FRAMES = 64;
const PLACEMENT_OWNER_FRAME = /\/src\/rebalancer\/replica-placement-owner[^/]*\.js/u;

// Timers created while a world runs (global setTimeout/setInterval, looked up
// at call time by the production owners), so that teardown can name every
// ref'd timer still alive after every owner was shut down.
function trackWorldTimers() {
  const originals = {setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval};
  const created = [];
  const track = (kind) => function trackedTimer(...args) {
    const timer = originals[kind].apply(this, args);
    // The whole synchronous creation stack, so a timer armed by a callee on a
    // module's behalf in the same turn is attributed to that module too.
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = TIMER_STACK_FRAMES;
    const stack = new Error().stack;
    Error.stackTraceLimit = limit;
    created.push({timer, kind, stack});
    return timer;
  };
  globalThis.setTimeout = track('setTimeout');
  globalThis.setInterval = track('setInterval');
  return {
    restore() {
      globalThis.setTimeout = originals.setTimeout;
      globalThis.setInterval = originals.setInterval;
    },
    // The src creators of the ref'd timers alive now (a diagnostic census).
    // placementOwner: a frame of a src/rebalancer/replica-placement-owner*
    // module is on the timer's synchronous creation stack.
    aliveCreators() {
      return created.filter(({timer}) => timer && timer._destroyed !== true &&
        typeof timer.hasRef === 'function' && timer.hasRef()).map(({kind, timer, stack}) => ({
        kind, ms: timer._idleTimeout ?? null,
        placementOwner: PLACEMENT_OWNER_FRAME.test(stack),
        creator: stack.split('\n').filter((line) => line.includes('/src/')).slice(0, 2)
          .map((line) => line.trim().replace(/^at /u, '').replace(/\(.*\/src\//u, '(src/'))}));
    },
    // Ref'd timers still alive: reported as a teardown finding, then cleared
    // so the test process can exit.
    reclaim(label) {
      const alive = created.filter(({timer}) => timer && timer._destroyed !== true &&
        typeof timer.hasRef === 'function' && timer.hasRef());
      for (const {timer, kind, stack} of alive) {
        LEAKED_TIMERS.push({world: label, kind, ms: timer._idleTimeout ?? null,
          creator: stack.split('\n').filter((line) => line.includes('/src/'))
            .slice(0, 3).map((line) => line.trim().replace(/^at /u, '')
              .replace(/\(.*\/src\//u, '(src/'))});
        clearTimeout(timer);
      }
      return alive.length;
    },
  };
}

after(() => {
  if (LEAKED_TIMERS.length > 0) {
    process.stderr.write(`placement-owner-authority-fixture: ${LEAKED_TIMERS.length} ref'd ` +
      `timer(s) alive after world shutdown: ${JSON.stringify(LEAKED_TIMERS)}\n`);
  }
  process.stderr.write('placement-owner-authority-fixture: active resources after the ' +
    `last world: ${JSON.stringify(process.getActiveResourcesInfo())}\n`);
});

async function waitUntil(predicate, label, timeoutMs = WAIT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  assert.fail(`fixture wait expired after ${timeoutMs} ms: ${label}`);
  return false;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

function nodeRowOf(nodeId, hostId, nowMs) {
  return {[COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.HOST_ID]: hostId, [COLUMN.BOOT_INCARNATION]: 1, storage_incarnation: 1,
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + LEASE_MS,
    [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
    [COLUMN.CREATED_AT]: nowMs, [COLUMN.UPDATED_AT]: nowMs};
}

function partitionRowOf(partitionId, {replicaCount = 3, leaderNodeId = null}, nowMs) {
  return {[COLUMN.PARTITION_ID]: partitionId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    replica_count: replicaCount, [COLUMN.LEADER_NODE_ID]: leaderNodeId,
    [COLUMN.CREATED_AT]: nowMs, [COLUMN.UPDATED_AT]: nowMs};
}

// A voter's SERVICES row as the production producer publishes it: the role is
// always the collapsed follower role (queueRoleUpdate), never 'leader'.
function serviceRowOf(partitionId, nodeId, nowMs, replicaId = `${partitionId}-${nodeId}`) {
  return {[COLUMN.SERVICE_ID]: replicaId, [COLUMN.REPLICA_ID]: replicaId,
    [COLUMN.PARTITION_ID]: partitionId, [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: 'partition', [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER, address: `${nodeId}/partition/${replicaId}`,
    [COLUMN.CREATED_AT]: nowMs - 1_000, [COLUMN.UPDATED_AT]: nowMs - 1_000};
}

function formationPublications(nodeIds, hostIds, nowMs) {
  const membership = {publication_id: `cluster_membership-${FORMATION_EPOCH}`,
    publication_kind: 'cluster_membership', publication_epoch: FORMATION_EPOCH,
    publisher_node_id: nodeIds[0], published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds), acknowledged_node_ids: JSON.stringify(nodeIds),
    priority_partition_summary: null, status: 'PUBLISHED', created_at: nowMs, updated_at: nowMs};
  const formation = {publication_id: 'cluster_formation', publication_kind: 'cluster_formation',
    publication_epoch: FORMATION_EPOCH, publisher_node_id: nodeIds[0], status: 'FORMED',
    created_at: nowMs, updated_at: nowMs,
    formation_record: JSON.stringify({version: 1, status: 'FORMED',
      clusterId: 'placement-owner-authority', declaredHostCount: hostIds.length,
      declaredByNodeId: nodeIds[0], declaredAt: nowMs, formedAt: nowMs,
      formedByNodeId: nodeIds[0], formedPublicationEpoch: FORMATION_EPOCH,
      formedHostIds: hostIds, formedReadyNodeIds: nodeIds, priorityPartitionVoters: {}})};
  return [membership, formation];
}

// The inert collaborators ControlPlaneSetup.create needs (as in
// replica-placement-owner-test-support.js runCorrectionBProductionAssemblyWitness).
function inertSqlEngine() {
  return {execute: async () => ({rows: []}), executeQuery: async () => ({success: true, rows: []}),
    setRuntimeAccessPolicyOwner: () => {}, registerServiceLifecycleCommandOwner: () => {},
    setServiceLifecycleCommandOwner: () => {},
    transactionCoordinator: {begin: async () => ({execute: async () => ({rows: []}),
      commit: async () => {}, rollback: async () => {}})}};
}

function inertCdcIntegration() {
  return {registerTableChangeCallback: () => {}, unregisterTableChangeCallback: () => {},
    sqlQueryEngine: inertSqlEngine()};
}

function routerOf(world, nodeId) {
  return {
    deliver: async (address, payload) => world.route(nodeId, address, payload),
    registerHandler: () => {}, unregisterHandler: () => {}, on: () => {}, off: () => {},
    getConnectedNodes: () => world.nodeIds, getConnectionState: () => 'CONNECTED',
    hasScheduledReconnect: () => false, getQueryDataPlaneTransportReadiness: () => ({ready: true}),
    getLocalBootIncarnationIdentity: () => ({bootIncarnation: 1}),
    getCurrentPrimaryConnectionBootIncarnation: () => 1, nodeConnections: new Map(),
  };
}

async function createControlPlane(world, node, existingCoordinator = null) {
  return ControlPlaneSetup.create({
    nodeId: node.nodeId, nodeAddress: `ws://127.0.0.1:0/${node.nodeId}`, bootIncarnation: 1,
    messageRouter: node.router,
    cdcGroupPropagationService: {getPublicationModeDiagnostics: () => ({currentMode: 'GROUPED'})},
    cdcIntegrationService: node.cdc, systemTableCache: node.cache,
    tablePolicyService: node.tablePolicy,
    rebalanceCoordinator: existingCoordinator,
    nodeService: {getState: () => 'ACTIVE', getNodeStats: async () => ({cpu: {count: 4,
      usagePercent: 10}, memory: {totalBytes: 1024, usagePercent: 10}, diskGb: 10,
    diskUsagePercent: 10})},
  });
}

// A real ServeEligibilityOwner whose committed read the fixture answers;
// installed as the readiness service's node authority (controlled substitute).
async function installNodeAuthority(world, node) {
  const readiness = node.coordinator.controlPlaneReadinessService;
  node.serveEligibilityOwnerAtInstall = readiness.serveEligibilityOwner;
  readiness.serveEligibilityOwner?.shutdown?.();
  const authority = new ServeEligibilityOwner({
    now: () => Date.now(), readTimeoutMs: WAIT_MS,
    setTimeout: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      handle.unref?.();
      return handle;
    },
    clearTimeout: (handle) => clearTimeout(handle), isNodeLoadReady: () => true,
    readCommittedRows: async (tableName) => world.committedRows(tableName),
  });
  readiness.serveEligibilityOwner = authority;
  await authority.readServeEligibility();
  node.nodeAuthority = authority;
  return authority;
}

function seedCache(world, cache) {
  for (const row of world.nodeRows) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, row);
  }
  for (const row of world.partitionRows) {
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT, row);
  }
  for (const row of world.serviceRows) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
  }
}

// Every proposal that reaches a ledger replica's consensus port, the ordered
// ledger log, and each replica's application of it. A proposal from a port
// whose term is older than the group's current term is a deposed leader's: it
// is recorded and never enters the log (truncated), unless `admitStale` lets it.
class LedgerLog {
  constructor(world) {
    this.world = world;
    this.term = 1;
    this.entries = [];
    this.proposals = [];
    this.applyFailures = [];
    this.applied = new Map();
    this.held = new Set();
    this.termStarts = new Map();
    this.dropNext = null;
  }

  // The empty entry a leader appends at the start of its term (raft-rs
  // become_leader); a replica's own term is applied once it applied this one.
  appendTermStart(node) {
    const term = node.ledger.controllablePort.term;
    this.termStarts.set(`${node.nodeId}@${term}`, this.entries.length);
    this.entries.push({term, command: null, proposer: node.nodeId, termStart: true});
    this.deliverAll();
  }

  // rs-raft's currentTermApplied: this replica leads and has applied an entry
  // of its current term (its term start).
  currentTermApplied(node) {
    const port = node.ledger.controllablePort;
    if (port.role !== RAFT_ROLE.LEADER) return false;
    const index = this.termStarts.get(`${node.nodeId}@${port.term}`);
    return index !== undefined && this.applied.get(node) > index;
  }

  attach(node) {
    if (!this.applied.has(node)) this.applied.set(node, 0);
    node.ledger.controllablePort.setProposeHandler(async (entry) => {
      this.propose(node, entry);
    });
  }

  propose(node, entry) {
    const port = node.ledger.controllablePort;
    const record = {nodeId: node.nodeId, entryId: entry.entryId, type: entry.type,
      partitionId: entry.body?.partitionId ?? null, bodyText: entry.bodyText ?? null,
      portTerm: port.term,
      groupTerm: this.term, role: port.role, appended: false, stale: port.term < this.term};
    this.proposals.push(record);
    if (record.stale) return;
    if (this.dropNext?.(node, entry)) {
      this.dropNext = null;
      record.dropped = true;
      return;
    }
    record.appended = true;
    record.logIndex = this.entries.length;
    this.entries.push({term: port.term, command: entry, proposer: node.nodeId});
    queueMicrotask(() => this.deliverAll());
  }

  deliverAll() {
    for (const node of this.applied.keys()) this.deliver(node);
  }

  // Apply in log order; a held replica stops at its first command.
  deliver(node, through = this.entries.length) {
    const port = node.ledger.controllablePort;
    const before = this.applied.get(node);
    let applied = before;
    while (applied < through) {
      const {term, command, termStart} = this.entries[applied];
      if (termStart !== true) {
        if (this.held.has(node)) break;
        this.commitOn(node, port, term, command);
      }
      applied += 1;
    }
    this.applied.set(node, applied);
    if (applied > before) port.emitEvent(RAFT_EVENT.APPLIED_PROGRESS);
  }

  commitOn(node, port, term, command) {
    const current = port.term;
    port.term = term;
    try {
      port.commit(command);
    } catch (error) {
      this.applyFailures.push({nodeId: node.nodeId, entryId: command.entryId,
        error: error?.code ?? error?.message ?? String(error)});
    } finally {
      port.term = current;
    }
  }

  hold(node) {
    this.held.add(node);
  }

  // A committed ordinary ledger statement (a workflow transition written by
  // its owner) appended to the log and applied by every replica in order.
  appendCommitted(command) {
    this.entries.push({term: this.term, command, proposer: 'fixture'});
    this.deliverAll();
  }

  release(node) {
    this.held.delete(node);
    this.deliver(node);
  }
}

function ownerOf(node) {
  return node.ledger?.replicaPlacementOwnerAttachment?.owner ?? null;
}

// A ledger replica's port as the double builds it, with the rs-raft status
// field currentTermApplied answered by the fixture's ledger log. Installed
// right after the replica started, before any subscriber or delivery holds
// the port; every other operation is the double's own.
function withTermStartStatus(port, currentTermApplied) {
  return createRaftOperationPort({...port, readStatus: () => deepFreeze({
    ...port.readStatus(), currentTermApplied: currentTermApplied()})});
}

// Transparent instance wrappers on the production owner object: every call
// goes to the original method with the original arguments and result.
// The armed gate of one kind, honouring its skip count.
function takeGate(gates, kind) {
  const gate = gates[kind];
  if (!gate) return null;
  if (gate.skip > 0) {
    gate.skip -= 1;
    return null;
  }
  gates[kind] = null;
  gate.armed = true;
  return gate;
}

// A transparent wrapper of one of the owner's two submitters (admitPlacement,
// releasePlacementHold): every call is recorded; a BEFORE gate holds it between
// the owner's last check and the submitter, an ANSWER gate holds the answer
// after it returned.
function instrumentSubmitter(owner, name, {attempts, gates, context}) {
  const original = owner[name];
  owner[name] = async (payload) => {
    const before = takeGate(gates, 'before');
    const attempt = {...context(), entryId: payload.entryId,
      partitionId: payload.body?.partitionId ?? null,
      operationId: payload.body?.operationId ?? null, held: before !== null};
    attempts.push(attempt);
    if (before) {
      before.reached.resolve(attempt);
      await before.release.promise;
      attempt.afterHold = context();
    }
    const answer = await original(payload);
    attempt.answer = answer;
    const after = takeGate(gates, 'answer');
    if (after) {
      after.reached.resolve(attempt);
      await after.release.promise;
      attempt.afterAnswerHold = context();
    }
    return answer;
  };
}

function instrumentOwner(node) {
  const owner = ownerOf(node);
  assert.ok(owner, `${node.nodeId}: a placement owner is attached before it is instrumented`);
  const ledger = node.ledger;
  const passScope = new AsyncLocalStorage();
  const probe = {nodeId: node.nodeId, passes: [], constructions: [], capacityChecks: [],
    candidateChecks: [], admissionAttempts: [], releaseAttempts: [], inFlight: 0,
    gates: {admitPlacement: {before: null, answer: null},
      releasePlacementHold: {before: null, answer: null}}};
  const context = () => {
    const status = ledger.raft?.readStatus?.() ?? {};
    return {ownerIsLeader: owner.isLeader, tenure: ledger.leadershipTenure ?? null,
      coreRole: status.role ?? null, coreTerm: status.term ?? null,
      pass: passScope.getStore() ?? null};
  };
  probe.context = context;
  const wrap = (name, record) => {
    const original = owner[name];
    owner[name] = function wrapped(...args) {
      record(...args);
      return original.apply(this, args);
    };
  };
  const originalRunPass = owner.runPass;
  owner.runPass = async function wrappedRunPass(triggers) {
    const pass = {sequence: probe.passes.length + 1, triggers: [...triggers], ...context(),
      done: false};
    pass.startTenure = pass.tenure;
    probe.passes.push(pass);
    probe.inFlight += 1;
    try {
      return await passScope.run(pass, () => originalRunPass.call(this, triggers));
    } catch (error) {
      pass.threw = error?.message ?? String(error);
      throw error;
    } finally {
      probe.inFlight -= 1;
      pass.done = true;
    }
  };
  wrap('readPartitionPlacementRows', () => probe.constructions.push(context()));
  wrap('readStorageExcludedTargets', () => probe.capacityChecks.push(context()));
  wrap('isCandidateAdmissibleNow', (candidate) => probe.candidateChecks.push({...context(),
    partitionId: candidate.partitionId}));
  instrumentSubmitter(owner, 'admitPlacement', {attempts: probe.admissionAttempts,
    gates: probe.gates.admitPlacement, context});
  instrumentSubmitter(owner, 'releasePlacementHold', {attempts: probe.releaseAttempts,
    gates: probe.gates.releasePlacementHold, context});
  node.probe = probe;
  return probe;
}

function armSubmitterGate(node, name, kind, skip = 0) {
  const gate = {reached: deferred(), release: deferred(), skip, armed: false};
  (node.gates ??= []).push(() => gate.release.resolve());
  node.probe.gates[name][kind] = gate;
  return gate;
}

// Hold the next admission call of a node's owner between its last planning
// check and the admission boundary (requestPlacementAdmission).
function holdNextAdmission(node, {skip = 0} = {}) {
  return armSubmitterGate(node, 'admitPlacement', 'before', skip);
}

// Hold the answer of the next admission (await A4): the entry is proposed and
// answered; the owner's continuation receives the answer only when released.
function holdNextAdmissionAnswer(node) {
  return armSubmitterGate(node, 'admitPlacement', 'answer');
}

// Hold the next hold-release call of a node's owner (await A2 or A5) between
// the owner's last check and the release boundary (requestPlacementHoldRelease).
function holdNextHoldRelease(node) {
  return armSubmitterGate(node, 'releasePlacementHold', 'before');
}

// The workflow owner's reads the REMOVE admissibility of a pass makes after
// its first await (A3: canAdmitRemove), recorded with the probe's context:
// the committed node floor read, the voter-ready count, the policy minimum.
function recordRemoveSafetyReads(node) {
  const workflowOwner = node.coordinator.workflowOwner;
  const reads = [];
  const record = (target, name) => {
    const original = target[name];
    target[name] = function recorded(...args) {
      reads.push({...node.probe.context(), read: name});
      return original.apply(this, args);
    };
  };
  record(workflowOwner.controlPlaneReadinessService, 'readServeEligibility');
  record(workflowOwner, 'isVoterReadyFloorCountableReplica');
  record(workflowOwner, 'getCriticalMinReplicaCount');
  return reads;
}

// Hold the next getCriticalReplicaRowsForSafety (the first await of a REMOVE's
// admissibility, A3) and answer it with `rows` (the substituted authoritative
// SERVICES read: the fixture's control-plane read is inert).
function holdNextRemoveSafetyRows(node, rows) {
  const workflowOwner = node.coordinator.workflowOwner;
  const original = workflowOwner.getCriticalReplicaRowsForSafety;
  const gate = {reached: deferred(), release: deferred(), calls: 0};
  (node.gates ??= []).push(() => gate.release.resolve());
  workflowOwner.getCriticalReplicaRowsForSafety = async function heldRows(partitionId) {
    workflowOwner.getCriticalReplicaRowsForSafety = original;
    gate.calls += 1;
    gate.reached.resolve({...node.probe.context(), partitionId});
    await gate.release.promise;
    return rows.map((row) => ({...row}));
  };
  return gate;
}

// Hold the next LEADERSHIP_START reconciliation's CDC drive (await point A1 of
// runPass) on a node's ledger service.
function holdNextLeadershipStartDrive(node) {
  const delivery = node.ledger.cdcDelivery;
  const original = delivery.driveCdcObligations;
  const gate = {reached: deferred(), release: deferred(), calls: 0};
  (node.gates ??= []).push(() => gate.release.resolve());
  delivery.driveCdcObligations = function heldDrive(reason) {
    if (reason !== 'LEADERSHIP_START') return original.call(this, reason);
    delivery.driveCdcObligations = original;
    gate.calls += 1;
    gate.reached.resolve(reason);
    return gate.release.promise.then(() => original.call(this, reason));
  };
  return gate;
}

// Hold every LEADERSHIP_START CDC drive of a node's ledger service (a
// subscriber that does not answer) until releaseAll().
function holdLeadershipStartDrives(node) {
  const delivery = node.ledger.cdcDelivery;
  const original = delivery.driveCdcObligations;
  const release = deferred();
  const gate = {calls: 0, released: false};
  delivery.driveCdcObligations = function heldDrive(reason) {
    if (reason !== 'LEADERSHIP_START' || gate.released) return original.call(this, reason);
    gate.calls += 1;
    return release.promise.then(() => original.call(this, reason));
  };
  gate.releaseAll = () => {
    gate.released = true;
    delivery.driveCdcObligations = original;
    release.resolve();
  };
  (node.gates ??= []).push(gate.releaseAll);
  return gate;
}

class PlacementWorld {
  constructor({nodes, partitions}) {
    const nowMs = Date.now();
    this.nowMs = nowMs;
    this.nodeIds = nodes.map((node) => node.nodeId);
    this.hostIds = nodes.map((node) => node.hostId);
    this.nodeRows = nodes.map((node) => nodeRowOf(node.nodeId, node.hostId, nowMs));
    this.partitionRows = partitions.map((partition) =>
      partitionRowOf(partition.partitionId, partition, nowMs));
    this.serviceRows = partitions.flatMap((partition) => partition.replicaNodeIds.map((nodeId) =>
      serviceRowOf(partition.partitionId, nodeId, nowMs)));
    this.publications = formationPublications(this.nodeIds, this.hostIds, nowMs);
    // The committed PARTITIONS/SERVICES rows behind the substituted
    // publication owner: what an authoritative point read answers.
    this.durable = new Map([
      [TABLES.PARTITIONS, new Map(this.partitionRows.map((row) =>
        [row[COLUMN.PARTITION_ID], {...row}]))],
      [TABLES.SERVICES, new Map(this.serviceRows.map((row) =>
        [row[COLUMN.SERVICE_ID], {...row}]))],
    ]);
    this.nodes = new Map();
    this.log = new LedgerLog(this);
    this.routes = [];
    this.publishedMutations = [];
    this.heldPublications = [];
    this.publicationHeld = false;
    this.targets = [];
    this.temporaries = [];
  }

  committedRows(tableName) {
    if (this.authorityUnavailable) {
      return {success: false, error: 'fixture: committed read unavailable', rows: []};
    }
    if (tableName === TABLES.NODES) return {success: true, rows: this.nodeRows};
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      return {success: true, rows: this.publications};
    }
    return {success: false, error: 'not-in-fixture', rows: []};
  }

  async route(fromNodeId, address, payload) {
    this.routes.push({fromNodeId, address, type: payload?.type ?? null});
    for (const node of this.nodes.values()) {
      if (node.ledger && address.includes(node.ledger.replicaId)) {
        return buildDeliveryEnvelope({acknowledged: true},
          await node.ledger.handleApplicationMessage(payload));
      }
    }
    return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
  }

  node(nodeId) {
    return this.nodes.get(nodeId);
  }

  async addNode(nodeId, {controlPlane = true} = {}) {
    const cache = new SystemTableCache();
    seedCache(this, cache);
    const node = {nodeId, cache, cdc: inertCdcIntegration(),
      tablePolicy: {getReplicationFactor: () => 3}, ledger: null};
    node.router = routerOf(this, nodeId);
    this.nodes.set(nodeId, node);
    if (controlPlane) await this.addControlPlane(node);
    return node;
  }

  async addControlPlane(node, existingCoordinator = null) {
    node.controlPlane = await createControlPlane(this, node, existingCoordinator);
    node.coordinator = node.controlPlane.rebalanceCoordinator;
    return node.controlPlane;
  }

  // One ledger replica on a node, started through the participant fixture's
  // startReplica (controllable port, canonical schema, generation origin).
  async startLedgerReplica(node, {replicaIds = this.ledgerReplicaIds(), dbPath, bind = true,
    authority = true} = {}) {
    const temporary = dbPath ? null : temporaryDbPath();
    if (temporary) this.temporaries.push(temporary.directory);
    node.dbPath = dbPath ?? temporary.dbPath;
    node.ledger = await startReplica(`${LEDGER}-${node.nodeId}`, {
      tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, schema: REPLICA_OPERATIONS_SCHEMA,
      nodeId: node.nodeId, replicaIds, systemTableCache: node.cache, dbPath: node.dbPath,
    }, LEDGER);
    node.ledger.raft = withTermStartStatus(node.ledger.raft,
      () => this.log.currentTermApplied(node));
    this.log.attach(node);
    if (authority) await installNodeAuthority(this, node);
    if (bind) node.ledger.setRebalanceCoordinator(node.coordinator);
    return node.ledger;
  }

  ledgerReplicaIds() {
    return this.nodeIds.map((nodeId) => `${LEDGER}-${nodeId}`);
  }

  // A target partition replica whose leader publication is real up to the
  // gateway: the fixture's gateway delivers the submitted PARTITIONS mutation
  // into every node's cache (held while publication is stalled).
  async startTargetReplica(node, partitionId, replicaIds) {
    const port = new ControllableConsensusPort();
    const service = createControllablePartitionService({partitionId, tableId: 'test_table',
      tableName: 'test_table', replicaId: `${partitionId}-${node.nodeId}`, replicaIds,
      nodeId: node.nodeId, peerAddresses: replicaIds.map((id) => `${node.nodeId}/partition/${id}`),
      systemTableCache: node.cache, schema: TEST_TABLE_SCHEMA, dbPath: ':memory:',
      cdcIntegrationService: node.cdc, sqlQueryEngine: inertSqlEngine(),
      tablePolicyService: node.tablePolicy, messageRouter: node.router,
      rebalanceCoordinator: node.coordinator}, port);
    const gateway = this.publicationGateway();
    service.controlPlaneSystemTableGateway = gateway;
    service.leaderNodeMutationHelper.setControlPlaneSystemTableGateway(gateway);
    service.roleMutationHelper.setControlPlaneSystemTableGateway(gateway);
    await service.initialize();
    this.targets.push(service);
    return service;
  }

  durableKeyOf(tableName, fields) {
    if (tableName === TABLES.PARTITIONS) return fields?.[COLUMN.PARTITION_ID] ?? null;
    return fields?.[COLUMN.SERVICE_ID] ?? fields?.[COLUMN.REPLICA_ID] ?? null;
  }

  // The gateway of the substituted publication boundary: an authoritative
  // point read of the committed row, a compare-and-set mutation applied to the
  // committed row, and its CDC delivered to every node's cache (held while
  // publication is stalled).
  publicationGateway() {
    return {
      readAuthoritativeRows: async (tableName, _sql, params) => {
        const row = this.durable.get(tableName)?.get(params?.[0]) ?? null;
        return {success: true, rows: row ? [{...row}] : [], rowSetComplete: true};
      },
      submitMutation: async (mutation) => {
        const record = {tableName: mutation.tableName, whereClause: {...mutation.whereClause},
          data: {...mutation.data}, affectedRows: 0};
        this.publishedMutations.push(record);
        const rows = this.durable.get(record.tableName);
        const key = this.durableKeyOf(record.tableName, record.whereClause);
        const current = rows?.get(key) ?? null;
        const guarded = current !== null && Object.entries(record.whereClause).every(
          ([field, value]) => current[field] === value || field === COLUMN.REPLICA_ID ||
            field === COLUMN.SERVICE_ID);
        if (guarded) {
          rows.set(key, {...current, ...record.data});
          record.affectedRows = 1;
          record.row = {...rows.get(key)};
          if (this.publicationHeld) {
            this.heldPublications.push(record);
          } else {
            this.deliverPublication(record);
          }
        }
        return {success: true, partitionResult: {affectedRows: record.affectedRows}};
      },
    };
  }

  deliverPublication(record) {
    if (record.tableName !== TABLES.PARTITIONS && record.tableName !== TABLES.SERVICES) return;
    for (const node of this.nodes.values()) {
      node.cache.applySystemTableChange(record.tableName, CDC_OPERATION.UPSERT, {...record.row});
    }
  }

  // Every node's NODES row republished (a lease extension), delivered to
  // every cache: the source change a node authority refreshes on.
  publishNodeRows() {
    const nowMs = Date.now();
    this.nodeRows = this.nodeRows.map((row) => ({...row, [COLUMN.UPDATED_AT]: nowMs,
      [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + LEASE_MS}));
    for (const node of this.nodes.values()) {
      for (const row of this.nodeRows) {
        node.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {...row});
      }
    }
  }

  // A committed row change published to every node's cache through the CDC
  // apply entry (the substituted publication owner's own write).
  publishRow(tableName, fields) {
    const rows = this.durable.get(tableName);
    const key = this.durableKeyOf(tableName, fields);
    const row = {...(rows.get(key) ?? {}), ...fields, [COLUMN.UPDATED_AT]: Date.now()};
    rows.set(key, row);
    const record = {tableName, whereClause: {}, data: fields, affectedRows: 1, row: {...row}};
    this.publishedMutations.push(record);
    if (this.publicationHeld) {
      this.heldPublications.push(record);
    } else {
      this.deliverPublication(record);
    }
    return record;
  }

  releasePublications() {
    this.publicationHeld = false;
    const held = this.heldPublications.splice(0);
    for (const record of held) this.deliverPublication(record);
    return held;
  }

  // Elect `next` as the ledger leader at a new group term. With
  // `notifyDeposed: false` the previous leader's core is not told: it keeps
  // its LEADER role at the old term (delayed leadership notification). With
  // `deliverLeaderEvent: false` the new leader's role event is delayed until
  // deliverLeaderEvent(next).
  async electLedger(next, {notifyDeposed = true, awaitOwner = true,
    deliverLeaderEvent = true} = {}) {
    this.log.term += 1;
    for (const node of this.nodes.values()) {
      if (!node.ledger) continue;
      const port = node.ledger.controllablePort;
      const deposed = node !== next && port.role === RAFT_ROLE.LEADER;
      if (deposed && !notifyDeposed) continue;
      port.term = this.log.term;
      if (node !== next && port.role !== RAFT_ROLE.FOLLOWER) port.setRole(RAFT_ROLE.FOLLOWER);
    }
    await settleTicks();
    if (deliverLeaderEvent) await this.deliverLeaderEvent(next, {awaitOwner});
  }

  async deliverLeaderEvent(next, {awaitOwner = true} = {}) {
    this.log.appendTermStart(next);
    next.ledger.controllablePort.setRole(RAFT_ROLE.LEADER);
    await settleTicks();
    await resumeFixtureParticipantAdmission(next.ledger);
    if (awaitOwner) {
      await waitUntil(() => ownerOf(next)?.isLeader === true,
        `${next.nodeId} placement owner activated`);
    }
  }

  // A new group term observed by a leader that keeps leading: no role edge,
  // only the consensus core's term announcement.
  announceTermWithoutRoleEdge(node) {
    this.log.term += 1;
    for (const peer of this.nodes.values()) {
      if (peer.ledger) peer.ledger.controllablePort.term = this.log.term;
    }
    this.log.appendTermStart(node);
    node.ledger.controllablePort.emitEvent('term change', this.log.term);
  }

  // A target partition replica wins its own election: the port's role event
  // drives applyReplicaLeadership and the replica's own publication.
  electTarget(service, peers = []) {
    for (const peer of peers) {
      if (peer !== service && peer.controllablePort.role !== RAFT_ROLE.FOLLOWER) {
        peer.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      }
    }
    service.controllablePort.setRole(RAFT_ROLE.LEADER);
  }

  // Restart a node's ledger replica over its own database file: the service
  // and its owner are discarded, a new PartitionService opens the file, and
  // the coordinator attaches a new owner (stays a follower until elected).
  async restartLedgerReplica(node) {
    ownerOf(node)?.setLeader(false);
    await shutdownAll(node.ledger);
    node.restartedFrom = node.ledger;
    await this.startLedgerReplica(node, {dbPath: node.dbPath, authority: false});
    return instrumentOwner(node);
  }

  // The deposed leader learns of the new term late.
  notifyDeposed(node) {
    const port = node.ledger.controllablePort;
    port.term = this.log.term;
    port.setRole(RAFT_ROLE.FOLLOWER);
  }

  async idle({except = []} = {}) {
    for (let round = 0; round < 3; round += 1) {
      await settleTicks();
      for (const node of this.nodes.values()) {
        const owner = ownerOf(node);
        if (owner && !except.includes(node)) await owner.awaitCurrentWorkIdle();
      }
    }
    await settleTicks();
  }

  ledgerRows(node, partitionId = null) {
    const rows = node.ledger.db.prepare('SELECT * FROM replica_operations ORDER BY rowid').all();
    return partitionId === null ? rows : rows.filter((row) => row.partition_id === partitionId);
  }

  statementOutcomes(node) {
    return node.ledger.db.prepare('SELECT entry_key, owner_result_text FROM ' +
      '_partition_statement_outcomes WHERE entry_key LIKE ? ORDER BY rowid')
      .all('%placement-owner:%').map((row) => ({entryKey: row.entry_key,
        result: row.owner_result_text ? JSON.parse(row.owner_result_text) : null}));
  }

  async shutdown() {
    const failures = [];
    for (const node of this.nodes.values()) {
      for (const release of node.gates ?? []) release();
    }
    await settleTicks();
    for (const node of this.nodes.values()) {
      try {
        ownerOf(node)?.setLeader(false);
      } catch (error) {
        failures.push(error);
      }
    }
    const services = [...this.targets, ...[...this.nodes.values()].map((node) => node.ledger)];
    try {
      await shutdownAll(...services);
    } catch (error) {
      failures.push(error);
    }
    for (const node of this.nodes.values()) {
      node.nodeAuthority?.shutdown();
      // The production teardown order of the setup's services
      // (bootstrap-service-seed-delegates.js): membership driver, heartbeat,
      // lease, endpoint, dispatch; then the coordinator.
      node.controlPlane?.membershipPublicationService?.stopOwnerMembershipDriver?.();
      node.controlPlane?.heartbeatService?.stop?.();
      node.controlPlane?.leaseService?.stop?.();
      node.controlPlane?.endpointService?.stop?.();
      node.controlPlane?.dispatchService?.stop?.();
      try {
        await node.coordinator?.shutdown?.();
      } catch (error) {
        failures.push(error);
      }
    }
    for (const directory of this.temporaries) fs.rmSync(directory, {recursive: true, force: true});
    if (failures.length > 0) throw new AggregateError(failures, 'placement world shutdown failed');
  }
}

/**
 * Run `measure(world)` on a world of `nodes` and `partitions`, then shut it down.
 * @param {Object} spec - {nodes: [{nodeId, hostId}], partitions: [{partitionId,
 *   replicaCount, leaderNodeId, replicaNodeIds}]}.
 * @param {Function} measure - The witness.
 * @return {Promise<*>} The witness's result.
 */
async function withPlacementWorld(spec, measure) {
  // The participant release recovery measures the runtime build once per
  // process; measured here so it never overlaps a leadership activation.
  await runtimeBuildProvenance();
  const timers = trackWorldTimers();
  const world = new PlacementWorld(spec);
  world.timers = timers;
  let failure = null;
  let result;
  try {
    result = await measure(world);
  } catch (error) {
    failure = error;
  }
  try {
    await world.shutdown();
  } catch (error) {
    if (failure === null) failure = error;
  } finally {
    timers.restore();
    world.leakedTimerCount = timers.reclaim(spec.label ?? 'world');
  }
  if (failure !== null) throw failure;
  return result;
}

const THREE_NODES = Object.freeze([{nodeId: 'n1', hostId: 'h1'}, {nodeId: 'n2', hostId: 'h2'},
  {nodeId: 'n3', hostId: 'h3'}]);

// A three-node world whose ledger has a replica (and an owner) on every node.
async function startThreeNodeLedger(world) {
  const nodes = [];
  for (const {nodeId} of THREE_NODES) nodes.push(await world.addNode(nodeId));
  for (const node of nodes) await world.startLedgerReplica(node);
  for (const node of nodes) instrumentOwner(node);
  return nodes;
}

// The admitted operations of a partition on one replica, each with the
// placement entry that admitted it (its durable identity for replay).
function admittedOperations(world, node, partitionId) {
  return world.ledgerRows(node, partitionId).map((row) => {
    const admission = JSON.parse(row.steps_history)?.[0]?.placementAdmission ?? null;
    const entryId = admission?.entryId ?? null;
    return {operationId: row.operation_id, type: row.type, targetNodeId: row.target_node_id,
      sourceNodeId: row.source_node_id, entryId,
      proposerNodeId: entryId?.split(':')[1] ?? null};
  });
}

const boundaryTenureOf = (attempt) =>
  (attempt.afterHold ? attempt.afterHold.tenure : attempt.tenure);
const decisionTenureOf = (attempt) => attempt.pass?.startTenure ?? null;

function attemptOutcomeOf(attempt) {
  const answer = attempt.answer;
  if (answer === undefined) return 'pending';
  return answer?.placementResult?.outcome ?? answer?.failureCode ?? answer?.code ??
    (answer?.success === false ? 'refused' : 'answered');
}

// Counts by node, by tenure and by operation identity: every admission is
// explained by the node, the tenure its pass started under, the tenure
// current at the admission boundary, and the operation it admitted.
function transferReport(world, partitionId) {
  const labels = new Map();
  const label = (tenure, nodeId) => {
    if (!tenure) return 'none';
    if (!labels.has(tenure)) labels.set(tenure, `${nodeId}#${labels.size + 1}@t${tenure.term}`);
    return labels.get(tenure);
  };
  const nodes = [...world.nodes.values()].filter((node) => node.probe);
  const tally = (records, nodeId) => {
    const byTenure = {};
    for (const record of records) {
      const start = label(record.pass?.startTenure, nodeId);
      const key = record.pass?.startTenure === record.tenure ? start :
        `${start}->ended(${label(record.tenure, nodeId)})`;
      byTenure[key] = (byTenure[key] ?? 0) + 1;
    }
    return byTenure;
  };
  const report = {nodes: nodes.map((node) => ({nodeId: node.nodeId,
    currentTenure: label(node.ledger.leadershipTenure, node.nodeId),
    passes: node.probe.passes.map((pass) => ({sequence: pass.sequence,
      triggers: pass.triggers.join('+'), startTenure: label(pass.startTenure, node.nodeId),
      done: pass.done, ...(pass.threw ? {threw: pass.threw} : {})})),
    constructionPasses: tally(node.probe.constructions, node.nodeId),
    capacityChecks: tally(node.probe.capacityChecks, node.nodeId),
    candidateChecks: tally(node.probe.candidateChecks.filter((check) =>
      check.partitionId === partitionId), node.nodeId),
    admissionAttempts: node.probe.admissionAttempts.filter((attempt) =>
      attempt.partitionId === partitionId).map((attempt) => ({
      entryId: attempt.entryId.split(':').slice(0, 4).join(':') + ':' +
        attempt.entryId.slice(-6),
      decisionTenure: label(decisionTenureOf(attempt), node.nodeId),
      boundaryTenure: label(boundaryTenureOf(attempt), node.nodeId),
      boundaryCore: `${attempt.afterHold?.coreRole ?? attempt.coreRole}@t` +
        `${attempt.afterHold?.coreTerm ?? attempt.coreTerm}`,
      outcome: attemptOutcomeOf(attempt)}))})),
  proposals: world.log.proposals.filter((proposal) => proposal.partitionId === partitionId)
    .map((proposal) => ({nodeId: proposal.nodeId, entryTail: proposal.entryId.slice(-6),
      portTerm: proposal.portTerm, groupTerm: proposal.groupTerm,
      disposition: proposal.stale ? 'stale-term-never-committed' :
        proposal.dropped ? 'dropped' : `log[${proposal.logIndex}]`})),
  admitted: nodes.map((node) => ({replica: node.nodeId,
    operations: admittedOperations(world, node, partitionId).map((operation) =>
      `${operation.operationId}<=${operation.proposerNodeId}:${operation.entryId?.slice(-6)}`)})),
  committedOutcomes: world.statementOutcomes(nodes[0]).filter((outcome) =>
    outcome.entryKey.includes(`:${partitionId}:`)).map((outcome) => ({
    entryTail: outcome.entryKey.slice(-6), outcome: outcome.result?.outcome,
    reason: outcome.result?.reason ?? null, operationIds: outcome.result?.operationIds ?? []}))};
  return report;
}

// Every node of the world with its control plane; a ledger replica (and an
// owner) only on `ledgerNodeIds`.
async function startLedgerOn(world, ledgerNodeIds) {
  const nodes = [];
  for (const nodeId of world.nodeIds) nodes.push(await world.addNode(nodeId));
  const replicaIds = ledgerNodeIds.map((nodeId) => `${LEDGER}-${nodeId}`);
  for (const node of nodes) {
    if (ledgerNodeIds.includes(node.nodeId)) {
      await world.startLedgerReplica(node, {replicaIds});
    }
  }
  for (const node of nodes) {
    if (node.ledger) instrumentOwner(node);
  }
  return nodes;
}

function summarizeProbe(probe) {
  return {nodeId: probe.nodeId, passes: probe.passes.length,
    constructionPasses: probe.constructions.length, capacityChecks: probe.capacityChecks.length,
    candidateChecks: probe.candidateChecks.length,
    admissionAttempts: probe.admissionAttempts.length};
}

export {
  LEDGER,
  admittedOperations,
  attemptOutcomeOf,
  boundaryTenureOf,
  decisionTenureOf,
  deferred,
  transferReport,
  THREE_NODES,
  holdLeadershipStartDrives,
  holdNextAdmission,
  holdNextAdmissionAnswer,
  holdNextHoldRelease,
  holdNextLeadershipStartDrive,
  holdNextRemoveSafetyRows,
  recordRemoveSafetyReads,
  inertCdcIntegration,
  inertSqlEngine,
  installNodeAuthority,
  instrumentOwner,
  ownerOf,
  settle,
  startLedgerOn,
  startThreeNodeLedger,
  summarizeProbe,
  TEST_TABLE_SCHEMA,
  waitUntil,
  withPlacementWorld,
};
