// Recovery stage, unit 1 (design RECOVERY-DESIGN-20261017, Revision 5 governs,
// then Revisions 4-1 and the draft): the restart inventory of bound creations
// on the C6 embedding. Every witness here models a `host` restart (R1-I):
// handler + lifecycle + driver + runtime + manager rebuilt over the SAME data
// directory and component journal, the process owner released and
// re-acquired, a bumped boot incarnation. A host restart proves memo loss,
// record/journal survival and re-acquisition; it cannot prove un-checkpointed
// WAL recovery, death mid-CAS or raft-rs mid-Ready state (the child-process
// witness P-R10 is unit 2's). A crash between two retirement steps is a
// LABELLED SEAM: the production step after it is made to fail once, then the
// host restarts; the durable state it leaves is the crash point's.
// Evidence ceiling: bound-creation-handler-embedding-fixture.js header.
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {embedding} from './bound-creation-handler-embedding-fixture.js';
import {ReplicaOperationMessageType as TYPE, ReplicaOperationResponseStatus as REPLY} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE as OUTCOME} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {runtimeServiceConsensusIdentity} from
  '../../src/rebalancer/runtime-service-replica-identity.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {acquireDataDirectoryProcessOwner} from '../../src/storage/data-directory-process-owner.js';
import {acquireStartupOwner, createStartupAcquisitionLedger, runStartupWithCleanup} from
  '../../src/entrypoint-startup-acquisition-ledger.js';

const FAULT = 'COMPONENT_AUTHORITATIVE_READ_UNAVAILABLE';
const CRASH = 'LABELLED_SEAM_HOST_CRASH';
const NOT_READY = 'runtime_service_not_ready';
const ALREADY_OWNED = 'DATA_DIRECTORY_ALREADY_OWNED';

function physicalOf(host) {
  return runtimeServiceConsensusIdentity(host.intent.consensusBinding,
    host.intent.consensusSlotRequest);
}
function creationId(host) {
  return host.intent.consensusSlotRequest.operationId;
}
function replicaIdOf(host) {
  return host.intent.consensusSlotRequest.replicaId;
}
function memoOf(host) {
  return host.handler.getLocalReplica(replicaIdOf(host));
}
function count(host, type) {
  return host.outcomes.filter((outcome) => outcome.outcomeType === type).length;
}
function lastOutcome(host) {
  return host.outcomes.at(-1) ?? null;
}
function rowOf(e, host) {
  return e.metadata.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
    .get(creationId(host)) ?? null;
}
function slotPhase(e, host) {
  return e.metadata.state().selected.resources[host.slot].phase;
}
function servicesRow(e, host) {
  return e.rows('services').find((row) => row.service_id === physicalOf(host).replicaId) ?? null;
}
function endpointRow(e, host) {
  return e.rows('service_endpoints').find((row) =>
    row.endpoint_id === `${physicalOf(host).replicaId}-ep-${host.nodeId}`) ?? null;
}
function dbPathOf(host) {
  const physical = physicalOf(host);
  return host.dataDirectoryManager.getWasmServiceDbPath(physical.groupId, physical.replicaId);
}
// The local record read by path through a second, read-only connection.
function localRecord(host) {
  const db = new Database(dbPathOf(host), {readonly: true, fileMustExist: true});
  try {
    return JSON.parse(db.prepare('SELECT record FROM _wasm_creation_local WHERE id = 1')
      .get().record);
  } finally {
    db.close();
  }
}
function plansOf(host) {
  return host.inventory.map((plan) => [plan.creation.operationId, plan.local, plan.action]);
}
function trackResumes(host) {
  const ids = [];
  const resume = host.manager.resumeConsensusCreation.bind(host.manager);
  host.manager.resumeConsensusCreation = (operationId, ...rest) => {
    ids.push(operationId);
    return resume(operationId, ...rest);
  };
  return ids;
}
// One production call made to fail once, then restored (the LABELLED SEAM).
function crashOnce(target, method) {
  const original = target[method];
  target[method] = async () => {
    target[method] = original;
    throw new Error(CRASH);
  };
}

// LABELLED SEAM (C6-8's): the next CLOSED CAS applies, its reply is lost and
// the owner's reread is faulted (crash after CLOSED, before STOPPED).
function closeAppliedReplyLost(e) {
  const owner = e.metadata.primary;
  const close = owner.closeInstanceResource;
  owner.closeInstanceResource = (...args) => {
    owner.closeInstanceResource = close;
    e.metadata.loseReply('owner-a', () =>
      e.metadata.setGatewayReadFault('owner-a', new Error(FAULT)));
    return Reflect.apply(close, owner, args);
  };
}

async function hostsOf(t) {
  const e = await embedding(t);
  for (let slot = 0; slot < 3; slot += 1) await e.addHost(slot);
  return e;
}

async function heldGroup(t) {
  const e = await hostsOf(t);
  for (const host of e.hosts) {
    host.retained = await e.retain(host);
    assert.equal(host.retained.outcome, 'ADMISSION_RETAINED');
  }
  for (const host of e.hosts) {
    assert.equal((await e.dispatch(host, TYPE.CREATE_REPLICA)).status, REPLY.INITIATED);
  }
  await e.settle(() => e.hosts.every((host) =>
    count(host, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) > 0), 'founders held');
  return e;
}

async function publishedGroup(t) {
  const e = await heldGroup(t);
  await e.form();
  await e.settle(() => e.hosts.every((host) =>
    count(host, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) === 1), 'founders active');
  return e;
}

async function removeAndSettle(e, host, operationId, type) {
  const reply = await e.dispatch(host, TYPE.REMOVE_REPLICA, operationId);
  await e.settle(() => count(host, type) > 0, `${host.nodeId} ${type}`);
  return reply;
}

// The restarted host's retirement re-drive settled: memo REMOVED, nothing in flight.
async function settleRedrive(e, host) {
  await e.settle(() => memoOf(host)?.status === ReplicaStatus.REMOVED, 'restart re-drive');
}

function assertRetiredAndCompleted(e, host) {
  assert.equal(slotPhase(e, host), 'CLOSED');
  assert.equal(localRecord(host).phase, 'RETIRED');
  assert.equal(servicesRow(e, host), null, 'STOPPED projected (services row removed)');
  assert.equal(endpointRow(e, host), null);
  assert.equal(rowOf(e, host).state, 'completed', 'creation row COMPLETED at CLOSED (R1-D)');
}

describe('recovery unit 1: host restart of bound creations (inventory, memo, re-entry)', () => {
  test('P-R1 host: a retained creation with no local file is ABSENT_UNCLAIMED, memo HELD, one ' +
    're-entry under its id; a REMOVE afterwards routes bound and completes', async (t) => {
    const e = await hostsOf(t);
    const host = e.hosts[1];
    assert.equal((await e.retain(host)).outcome, 'ADMISSION_RETAINED');
    assert.equal(fs.existsSync(dbPathOf(host)), false, 'no local file before the restart');
    const restarted = await e.restartHost(host);
    const resumes = trackResumes(restarted);
    assert.notEqual(restarted.bootIncarnation, host.bootIncarnation, 'a new boot incarnation');
    assert.deepEqual(plansOf(restarted), [[creationId(host), 'ABSENT_UNCLAIMED', 'REENTER']]);
    assert.deepEqual([memoOf(restarted)?.status, memoOf(restarted)?.operationId],
      [ReplicaStatus.HELD, creationId(host)], 'the memo is written before ready');
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) === 1, 're-entry');
    assert.deepEqual(resumes, [creationId(host)], 'one re-entry, under the creation id');
    assert.deepEqual(restarted.outcomes.map((o) => [o.outcomeType, o.operationId]),
      [[OUTCOME.RUNTIME_SERVICE_CREATE_HELD, creationId(host)]]);
    assert.equal(localRecord(restarted).phase, 'ADMITTED', 'the re-entry opened FRESH');
    const reply = await removeAndSettle(e, restarted, 'remove-p-r1',
      OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(reply.status, REPLY.INITIATED, 'NOT_FOUND is the pre-recovery answer (N6)');
    assertRetiredAndCompleted(e, restarted);
  });

  test('P-R1b host: a claim without its file (ABSENT_CLAIMED) is a permanent ' +
    'CREATION_STORAGE_MISSING, never a FRESH reopen; a REMOVE closes the slot', async (t) => {
    const e = await hostsOf(t);
    const host = e.hosts[2];
    const retained = await e.retain(host);
    assert.equal((await host.manager.claimConsensusCreationOpening(retained)).outcome,
      'FRESH_OPENING');
    const restarted = await e.restartHost(host);
    assert.deepEqual(plansOf(restarted), [[creationId(host), 'ABSENT_CLAIMED', 'REENTER']]);
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1,
      'storage missing');
    const failed = lastOutcome(restarted);
    assert.deepEqual([failed.operationId, failed.errorCode, failed.deferRetry],
      [creationId(host), 'CREATION_STORAGE_MISSING', undefined], 'permanent, typed');
    assert.deepEqual([memoOf(restarted).status, memoOf(restarted).operationId,
      memoOf(restarted).deferRetry], [ReplicaStatus.FAILED, creationId(host), undefined]);
    assert.equal(fs.existsSync(dbPathOf(restarted)), false, 'NO_FRESH_REOPEN_AFTER_A_CLAIM');
    await removeAndSettle(e, restarted, 'remove-p-r1b', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(slotPhase(e, restarted), 'CLOSED');
    assert.equal(rowOf(e, restarted).state, 'completed');
  });

  test('P-R4 host: local ADMITTED + metadata PUBLISHED (the grant CAS reply lost, owner ' +
    'reachable): reopen HELD, the re-grant is idempotent, SERVING and ACTIVE', async (t) => {
    const e = await heldGroup(t);
    const host = e.hosts[1];
    // LABELLED SEAM: the owner's grant CAS applied, its reply never reached the replica.
    assert.equal((await e.metadata.primary.grantInstanceResource(host.intent.consensusBinding,
      host.retained.token)).outcome, 'PUBLISHED');
    assert.equal(localRecord(host).phase, 'ADMITTED');
    const restarted = await e.restartHost(host);
    assert.deepEqual(plansOf(restarted), [[creationId(host), 'ADMITTED', 'REENTER']]);
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) === 1, 'held');
    assert.equal(e.replicaOf(restarted).servingState, 'HELD', 'reopened RETAINED, HELD');
    await e.form();
    await e.settle(() => e.hosts.every((each) =>
      count(each, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) === 1), 'founders active');
    const record = localRecord(restarted);
    assert.equal(record.phase, 'PUBLISHED');
    assert.deepEqual(record.grant.token, host.retained.token);
    assert.equal(slotPhase(e, restarted), 'PUBLISHED');
    assert.equal(e.replicaOf(restarted).servingState, 'SERVING');
    assert.deepEqual([memoOf(restarted).status, memoOf(restarted).operationId],
      [ReplicaStatus.ACTIVE, creationId(host)]);
  });

  test('P-R5 host: retired-not-closed (CLOSE_UNRESOLVED) before the restart: inventory ' +
    'RETIRED, memo REMOVING, an in-flight REMOVE entry, the re-drive closes, projects ' +
    'STOPPED, completes the row and emits NO outcome', async (t) => {
    const e = await publishedGroup(t);
    const host = e.hosts[1];
    // LABELLED SEAM: the CLOSED CAS is not applied (crash between tombstone and CLOSED).
    crashOnce(e.metadata.primary, 'closeInstanceResource');
    await removeAndSettle(e, host, 'remove-p-r5', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
    assert.equal(slotPhase(e, host), 'RELEASING');
    assert.equal(localRecord(host).phase, 'RETIRED');
    const restarted = await e.restartHost(host);
    assert.deepEqual(plansOf(restarted), [[creationId(host), 'RETIRED', 'REDRIVE']]);
    assert.deepEqual([memoOf(restarted).status, memoOf(restarted).operationId],
      [ReplicaStatus.REMOVING, creationId(host)]);
    const inFlight = [];
    const stop = restarted.manager.stopReplica.bind(restarted.manager);
    restarted.manager.stopReplica = (...args) => {
      inFlight.push(restarted.handler.hasInProgressReplicaRemoval(replicaIdOf(host)));
      return stop(...args);
    };
    await settleRedrive(e, restarted);
    assert.deepEqual(inFlight, [true], 'the re-drive ran under an in-flight REMOVE entry');
    assertRetiredAndCompleted(e, restarted);
    assert.deepEqual(restarted.outcomes, [], 'THE_RESTART_REDRIVE_EMITTED_AN_OUTCOME');
    // I's CLOSED wake is re-derived from the redone CAS (D-R7), reason and token.
    const closedWakes = restarted.wakes.filter((entry) =>
      entry.wake.reason === RECONCILE_REASON.CREATION_RESOURCE_CLOSED);
    assert.deepEqual(closedWakes.map((entry) => [entry.wake.token.operationId,
      entry.answer.outcome]), [[creationId(host), 'RECORDED']]);
    // A coordinator REMOVE retry after the re-drive: the REMOVED reply, no outcome (N12).
    assert.equal((await e.dispatch(restarted, TYPE.REMOVE_REPLICA, 'remove-p-r5')).status,
      REPLY.COMPLETED);
    assert.deepEqual(restarted.outcomes, []);
  });

  test('P-R6 host: metadata RELEASING, crash before the tombstone: the re-entry is a ' +
    'permanent RESOURCE_CLOSED; the next REMOVE retires by path, closes and completes',
  async (t) => {
    const e = await publishedGroup(t);
    const host = e.hosts[2];
    const initialization = e.replicaOf(host).writerState.meta().initialization;
    // LABELLED SEAM: the fenced stop fails before closing the file: no tombstone.
    crashOnce(host.lifecycle, 'stopOwnedReplica');
    await removeAndSettle(e, host, 'remove-p-r6', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
    assert.equal(slotPhase(e, host), 'RELEASING');
    assert.equal(endpointRow(e, host), null, 'the endpoint was withdrawn first');
    const restarted = await e.restartHost(host);
    assert.equal(localRecord(restarted).phase, 'PUBLISHED');
    assert.deepEqual(plansOf(restarted), [[creationId(host), 'PUBLISHED', 'REENTER']]);
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1,
      'resource closed');
    assert.deepEqual([lastOutcome(restarted).errorCode, lastOutcome(restarted).deferRetry],
      ['RESOURCE_CLOSED', undefined]);
    assert.equal(e.replicaOf(restarted), null, 'nothing reopened');
    await removeAndSettle(e, restarted, 'remove-p-r6', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assertRetiredAndCompleted(e, restarted);
    assert.ok(initialization !== null, 'the founder had its one INIT before the restart');
  });

  test('P-R7 host: a crash after each of the five retirement steps (R1-D) recovers ' +
    'idempotently', async (t) => {
    // (1) endpoint removed, crash before the fence: reopen SERVING; an explicit
    // CREATE re-dispatch (the coordinator; unit 2 owns the confirming-run wake,
    // R1-C 7) re-projects at the new incarnation; the lost REMOVE is re-sent.
    {
      const e = await publishedGroup(t);
      const host = e.hosts[1];
      crashOnce(host.driver, 'stop');
      await removeAndSettle(e, host, 'remove-c1', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
      assert.equal(endpointRow(e, host), null);
      assert.equal(slotPhase(e, host), 'PUBLISHED');
      const restarted = await e.restartHost(host);
      assert.deepEqual(plansOf(restarted), [[creationId(host), 'PUBLISHED', 'REENTER']]);
      await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) +
        count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) > 0, 'reopened');
      assert.equal(e.replicaOf(restarted).servingState, 'SERVING', 'reopened on its grant');
      await e.form();
      await e.settle();
      if (count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) === 0) {
        await e.dispatch(restarted, TYPE.CREATE_REPLICA);
        await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) === 1,
          'confirmed');
      }
      assert.ok(endpointRow(e, restarted), 'the endpoint is re-projected');
      await removeAndSettle(e, restarted, 'remove-c1', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
      assertRetiredAndCompleted(e, restarted);
    }
    // (2) fence + RELEASING, crash before the tombstone: P-R6 (above).
    // (3) tombstone written, CLOSED not; (4) CLOSED written, STOPPED not;
    // (5) STOPPED written, the row not COMPLETED: each is the RETIRED re-drive.
    for (const crash of ['tombstone', 'closed', 'stopped']) {
      const e = await publishedGroup(t);
      const host = e.hosts[1];
      if (crash === 'tombstone') crashOnce(e.metadata.primary, 'closeInstanceResource');
      if (crash === 'closed') closeAppliedReplyLost(e);
      if (crash === 'stopped') e.metadata.setJournalFault('before-admission');
      const settled = crash === 'stopped' ? OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED :
        OUTCOME.RUNTIME_SERVICE_REMOVE_HELD;
      await removeAndSettle(e, host, `remove-${crash}`, settled);
      e.metadata.setGatewayReadFault('owner-a', null);
      e.metadata.setJournalFault(null);
      assert.equal(slotPhase(e, host), crash === 'tombstone' ? 'RELEASING' : 'CLOSED', crash);
      assert.equal(rowOf(e, host).state, 'in_progress', `${crash}: the row is not COMPLETED`);
      assert.equal(servicesRow(e, host) === null, crash === 'stopped', `${crash} services row`);
      const restarted = await e.restartHost(host);
      assert.deepEqual(plansOf(restarted), [[creationId(host), 'RETIRED', 'REDRIVE']], crash);
      const from = e.metadata.writes.length;
      await settleRedrive(e, restarted);
      assertRetiredAndCompleted(e, restarted);
      assert.deepEqual(restarted.outcomes, [], `${crash}: no outcome from the re-drive`);
      const writes = e.metadata.writes.slice(from);
      const closedAt = writes.findIndex((write) => /\bservice_instances\b/u.test(write.sql) &&
        write.changes === 1 && write.state?.selected?.resources?.[host.slot]?.phase === 'CLOSED');
      const rowDelete = writes.findIndex((write) => /^DELETE FROM services\b/u.test(write.sql) &&
        JSON.stringify(write.params).includes(physicalOf(host).replicaId) && write.changes === 1);
      if (crash === 'tombstone') {
        assert.ok(closedAt >= 0 && rowDelete > closedAt, `ORDER closed=${closedAt} row=${rowDelete}`);
      } else {
        assert.equal(closedAt, -1, `${crash}: CLOSED is monotonic, no second CLOSED write`);
      }
    }
  });

  test('P-R8 in-process: a COMPLETED creation row re-enters as the permanent TERMINAL memo, ' +
    'its REMOVE is REMOVE_COMPLETED; after a host restart the same REMOVE is NOT_FOUND ' +
    '(recorded honest answer)', async (t) => {
    const e = await publishedGroup(t);
    const host = e.hosts[2];
    await removeAndSettle(e, host, 'remove-p-r8', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(rowOf(e, host).state, 'completed');
    assert.equal((await e.dispatch(host, TYPE.CREATE_REPLICA)).status, REPLY.INITIATED);
    await e.settle(() => count(host, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1, 'terminal');
    assert.deepEqual([lastOutcome(host).errorCode, lastOutcome(host).deferRetry],
      ['TERMINAL_OPERATION', undefined]);
    assert.deepEqual([memoOf(host).status, memoOf(host).operationId, memoOf(host).deferRetry],
      [ReplicaStatus.FAILED, creationId(host), undefined]);
    const completedBefore = count(host, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    await e.dispatch(host, TYPE.REMOVE_REPLICA, 'remove-p-r8-again');
    await e.settle(() => count(host, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED) ===
      completedBefore + 1, 'idempotent REMOVE of a COMPLETED row');
    assert.equal(count(host, OUTCOME.RUNTIME_SERVICE_REMOVE_FAILED), 0);
    const restarted = await e.restartHost(host);
    assert.deepEqual(restarted.inventory, [], 'a COMPLETED row is not an inventory entry');
    assert.equal((await e.dispatch(restarted, TYPE.REMOVE_REPLICA, 'remove-p-r8-late')).status,
      REPLY.NOT_FOUND, 'memo gone, row excluded, services row deleted (R16)');
  });

  test('P-R9 host: CREATION_STORAGE_MISSING, CORRUPT_STATE and CONTENT_CONFLICT (a copied ' +
    'file) are permanent typed memos, no reopen, no tombstone inferred; a REMOVE closes only ' +
    'the storage-missing slot', async (t) => {
    const e = await publishedGroup(t);
    const [missing, corrupt, copied] = e.hosts;
    const seams = {
      [missing.nodeId]: (host) => {
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPathOf(host)}${suffix}`, {force: true});
      },
      [corrupt.nodeId]: (host) => {
        const db = new Database(dbPathOf(host), {fileMustExist: true});
        try {
          db.prepare('UPDATE _wasm_creation_local SET record = ? WHERE id = 1')
            .run('{"corrupt":true}');
        } finally {
          db.close();
        }
      },
      [copied.nodeId]: (host) => {
        const path = dbPathOf(host);
        fs.copyFileSync(path, `${path}.copy`);
        fs.rmSync(path);
        fs.renameSync(`${path}.copy`, path);
      },
    };
    const expected = {[missing.nodeId]: ['ABSENT_CLAIMED', 'CREATION_STORAGE_MISSING'],
      [corrupt.nodeId]: ['CORRUPT_STATE', 'CORRUPT_STATE'],
      [copied.nodeId]: ['CONTENT_CONFLICT', 'CONTENT_CONFLICT']};
    const restarted = [];
    for (const host of [missing, corrupt, copied]) {
      restarted.push(await e.restartHost(host, {beforeCompose: seams[host.nodeId]}));
    }
    for (const host of restarted) {
      const [local, code] = expected[host.nodeId];
      assert.deepEqual(plansOf(host), [[creationId(host), local, 'REENTER']], host.nodeId);
      await e.settle(() => count(host, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1, host.nodeId);
      assert.deepEqual([lastOutcome(host).errorCode, lastOutcome(host).deferRetry],
        [code, undefined], `${host.nodeId} permanent typed`);
      assert.deepEqual([memoOf(host).status, memoOf(host).operationId],
        [ReplicaStatus.FAILED, creationId(host)]);
      assert.notEqual(e.replicaOf(host)?.initialized, true, `${host.nodeId} never reopened`);
    }
    const [missingNow, corruptNow, copiedNow] = restarted;
    assert.equal(fs.existsSync(dbPathOf(missingNow)), false, 'no file recreated');
    await removeAndSettle(e, missingNow, 'remove-missing', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(slotPhase(e, missingNow), 'CLOSED', 'typed absence allows CLOSED (D2\')');
    for (const host of [corruptNow, copiedNow]) {
      await removeAndSettle(e, host, `remove-${host.nodeId}`, OUTCOME.RUNTIME_SERVICE_REMOVE_FAILED);
      assert.deepEqual([lastOutcome(host).errorCode, lastOutcome(host).deferRetry],
        [expected[host.nodeId][1], undefined], `${host.nodeId} REMOVE_FAILED typed`);
      assert.notEqual(slotPhase(e, host), 'CLOSED', `${host.nodeId}: never closed`);
    }
    assert.equal(localRecord(copiedNow).phase, 'PUBLISHED', 'NO_TOMBSTONE_INFERRED_ON_A_COPY');
  });

  test('P-R11 host: a message before ready is NOT_READY + deferRetry, nothing emitted; a wake ' +
    'between the memo write and the re-entry finds the memo; one re-entry', async (t) => {
    const e = await hostsOf(t);
    const host = e.hosts[1];
    await e.retain(host);
    const restarted = await e.restartHost(host, {inventory: false});
    for (const type of [TYPE.CREATE_REPLICA, TYPE.REMOVE_REPLICA]) {
      const reply = await e.dispatch(restarted, type);
      assert.deepEqual([reply.status, reply.errorCode, reply.deferRetry],
        [REPLY.ERROR, NOT_READY, true], type);
    }
    assert.deepEqual(restarted.outcomes, []);
    const resumes = trackResumes(restarted);
    restarted.inventory = await restarted.handler.recoverRetainedCreations();
    const wake = restarted.handler.onCreationWake(e.serviceId, {
      reason: RECONCILE_REASON.CREATION_GENESIS_OBSERVED,
      binding: host.intent.consensusBinding, token: {operationId: creationId(host)}});
    assert.equal(wake.outcome, 'QUEUED', 'the memo was written before the re-entry');
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) > 0, 'held');
    assert.deepEqual(resumes, [creationId(host)], 'exactly one re-entry');
    assert.equal((await e.dispatch(restarted, TYPE.CREATE_REPLICA)).status, REPLY.IN_PROGRESS,
      'after ready the HELD memo answers normally');
  });

  test('P-R12 host: a PENDING row: the REMOVE resolves the reservation first (applied -> ' +
    'retired, sealed -> CANCELLED, unavailable -> HELD); a restart re-enters PENDING, never ' +
    'CANCELLED', async (t) => {
    const e = await hostsOf(t);
    const [unavailable, applied, sealed] = e.hosts;
    const owner = e.metadata.primary;
    const reserve = owner.reserveInstanceResource;
    const reserves = () => e.metadata.events.filter((event) => event.kind === 'reserve');
    // Applied, reply lost twice (producer and CREATE): the row stays PENDING.
    e.metadata.loseReservation();
    assert.equal((await e.retain(applied)).outcome, 'UNKNOWN');
    e.metadata.loseReservation();
    await e.dispatch(applied, TYPE.CREATE_REPLICA);
    await e.settle(() => count(applied, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1, 'deferred');
    assert.deepEqual([rowOf(e, applied).state, slotPhase(e, applied)], ['pending', 'ADMITTED']);
    // Never applied: the producer's and the CREATE's reservation do not reach the owner.
    owner.reserveInstanceResource = async () => {
      throw new Error('RESERVATION_NOT_REACHED');
    };
    for (const host of [unavailable, sealed]) {
      assert.equal((await e.retain(host)).outcome, 'UNKNOWN');
      await e.dispatch(host, TYPE.CREATE_REPLICA);
      await e.settle(() => count(host, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1, host.nodeId);
    }
    owner.reserveInstanceResource = reserve;
    // A different request takes the sealed host's slot first.
    assert.equal((await reserve(sealed.intent.consensusBinding,
      e.metadata.slotRequest(sealed.slot, 0, 'foreign-operation'))).outcome, 'ADMITTED');
    await removeAndSettle(e, applied, 'remove-applied', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.deepEqual(reserves().at(-1).request, applied.intent.consensusSlotRequest, 'same request');
    assert.equal(slotPhase(e, applied), 'CLOSED', 'NO_ORPHANED_ADMITTED_SLOT');
    assert.equal(rowOf(e, applied).state, 'completed');
    await removeAndSettle(e, sealed, 'remove-sealed', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(rowOf(e, sealed).state, 'cancelled');
    assert.equal(JSON.parse(rowOf(e, sealed).error).reason, 'CONFLICT');
    assert.equal(slotPhase(e, sealed), 'ADMITTED', 'the foreign request keeps its slot');
    e.metadata.setGatewayReadFault('owner-a', new Error(FAULT));
    await removeAndSettle(e, unavailable, 'remove-unavailable', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
    e.metadata.setGatewayReadFault('owner-a', null);
    assert.deepEqual([rowOf(e, unavailable).state, memoOf(unavailable).status],
      ['pending', ReplicaStatus.REMOVING]);
    // R3-D: a repeated REMOVE of the CANCELLED creation is REMOVE_COMPLETED.
    await e.dispatch(sealed, TYPE.CREATE_REPLICA);
    await e.settle(() => count(sealed, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 2, 'terminal');
    assert.equal(lastOutcome(sealed).errorCode, 'TERMINAL_OPERATION');
    await removeAndSettle(e, sealed, 'remove-sealed-again', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(count(sealed, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED), 2);
    assert.equal(count(sealed, OUTCOME.RUNTIME_SERVICE_REMOVE_FAILED), 0, 'NEVER_REMOVE_FAILED');
    const unavailableNow = await e.restartHost(unavailable);
    const sealedNow = await e.restartHost(sealed);
    assert.deepEqual(plansOf(unavailableNow), [[creationId(unavailable), 'ABSENT_UNCLAIMED',
      'REENTER']]);
    assert.deepEqual(sealedNow.inventory, [], 'a CANCELLED row is never re-entered');
    await e.settle(() => count(unavailableNow, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) === 1,
      'the PENDING row resolves the same request on re-entry');
    assert.equal(rowOf(e, unavailable).state, 'in_progress');
  });

  test('P-R12c host: the REMOVE-time resolution persisted the token, crash before CLOSED: the ' +
    'restart re-enters a HELD founder and the REMOVE retry retires it (no orphan)', async (t) => {
    const e = await hostsOf(t);
    const host = e.hosts[1];
    e.metadata.loseReservation();
    await e.retain(host);
    e.metadata.loseReservation();
    await e.dispatch(host, TYPE.CREATE_REPLICA);
    await e.settle(() => count(host, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1, 'deferred');
    // LABELLED SEAM: the bound STOP after the resolution fails (the crash window).
    crashOnce(host.manager, 'stopReplica');
    await removeAndSettle(e, host, 'remove-p-r12c', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
    assert.deepEqual([rowOf(e, host).state, rowOf(e, host).opening_json, slotPhase(e, host)],
      ['in_progress', null, 'ADMITTED']);
    assert.ok(rowOf(e, host).admission_json, 'the token was persisted');
    const restarted = await e.restartHost(host);
    assert.deepEqual(plansOf(restarted), [[creationId(host), 'ABSENT_UNCLAIMED', 'REENTER']]);
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) === 1, 'held');
    await removeAndSettle(e, restarted, 'remove-p-r12c', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assertRetiredAndCompleted(e, restarted);
  });

  test('P-R13 host: two hosts restart over the shared journal; each inventory holds only its ' +
    'own node\'s creation', async (t) => {
    const e = await heldGroup(t);
    const first = await e.restartHost(e.hosts[1]);
    const second = await e.restartHost(e.hosts[2]);
    for (const host of [first, second]) {
      assert.deepEqual(host.inventory.map((plan) => plan.creation.operationId), [creationId(host)]);
      assert.deepEqual([...host.handler.localReplicas.keys()], [replicaIdOf(host)]);
    }
    await e.settle(() => [first, second].every((host) =>
      count(host, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) === 1), 'own re-entries');
    for (const host of [first, second]) {
      assert.deepEqual(host.outcomes.map((o) => o.operationId), [creationId(host)]);
    }
  });

  test('P-R14 host: a REMOVE racing the restart re-entry takes custody: the re-entry is not ' +
    'started, the creation link survives, one REMOVE_COMPLETED', async (t) => {
    const e = await heldGroup(t);
    const host = e.hosts[1];
    const restarted = await e.restartHost(host, {inventory: false});
    const resumes = trackResumes(restarted);
    restarted.inventory = await restarted.handler.recoverRetainedCreations();
    assert.equal((await e.dispatch(restarted, TYPE.REMOVE_REPLICA, 'remove-p-r14')).status,
      REPLY.INITIATED);
    await e.settle(() => count(restarted, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED) === 1,
      'removed');
    assert.deepEqual(resumes, [], 'the REMOVING memo is not raced by a CREATE re-entry');
    assert.deepEqual([memoOf(restarted).status, memoOf(restarted).operationId],
      [ReplicaStatus.REMOVED, creationId(host)], 'NO_SECOND_WRITER_DROPPED_THE_LINK');
    assert.deepEqual(restarted.outcomes.map((o) => o.outcomeType),
      [OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED]);
    assertRetiredAndCompleted(e, restarted);
  });

  test('P-R15 process custody: no second composition runs the inventory while the owner ' +
    'lock is held; a failed startup cleanup keeps the lock (ledger path, labelled)',
  async (t) => {
    const e = await heldGroup(t);
    const host = e.hosts[1];
    await assert.rejects(e.composeHost(host.slot), {code: ALREADY_OWNED});
    assert.deepEqual([memoOf(host).status, memoOf(host).operationId],
      [ReplicaStatus.HELD, creationId(host)], 'the live host is untouched');
    await e.stopHost(host);
    // LEDGER PATH (once): the startup acquires the owner through the
    // acquisition ledger, an ordinary cleanup fails, the startup fails before
    // any inventory: the exclusive owner is withheld (PROCESS-CUSTODY).
    const dataDir = host.dataDirectoryManager.getDataDir();
    let kept = null;
    const ledger = createStartupAcquisitionLedger();
    try {
      await assert.rejects(runStartupWithCleanup(ledger, async () => {
        kept = await acquireStartupOwner({acquire: () => acquireDataDirectoryProcessOwner(dataDir),
          register: (owner) => ledger.defer(() => owner.release(),
            {requiresSuccessfulCleanup: true}),
          assertActive: () => {}});
        ledger.defer(async () => {
          throw new Error('STARTUP_CLEANUP_FAILED');
        });
        throw new Error('STARTUP_FAILED_BEFORE_INVENTORY');
      }), AggregateError);
      assert.ok(kept, 'the startup acquired the owner through the ledger');
      assert.throws(() => acquireDataDirectoryProcessOwner(dataDir), {code: ALREADY_OWNED},
        'the failed cleanup kept the lock');
      await assert.rejects(e.composeHost(host.slot), {code: ALREADY_OWNED},
        'no inventory runs under a lock another composition holds');
    } finally {
      kept?.release();
    }
  });
});

describe('recovery unit 1: typed open-time refusals reach the handler (R1-B, R3-B)', () => {
  test('R3-B an open-time UNAVAILABLE of a RETAINED creation is the NAMED deferral, decided ' +
    'by the opening module on its own owner read; distinct from the UNROUTED row', async (t) => {
    const e = await hostsOf(t);
    const host = e.hosts[1];
    await e.retain(host);
    const owner = e.metadata.primary;
    const resolve = owner.resolveInstanceResource.bind(owner);
    let reads = 0;
    owner.resolveInstanceResource = (...args) => {
      reads += 1;
      return resolve(...args);
    };
    e.metadata.setGatewayReadFault('owner-a', new Error(FAULT));
    await e.dispatch(host, TYPE.CREATE_REPLICA);
    await e.settle(() => count(host, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED) === 1, 'deferred');
    e.metadata.setGatewayReadFault('owner-a', null);
    assert.deepEqual([lastOutcome(host).operationId, lastOutcome(host).errorCode,
      lastOutcome(host).deferRetry], [creationId(host), 'UNAVAILABLE', true]);
    assert.deepEqual([memoOf(host).status, memoOf(host).operationId, memoOf(host).deferRetry],
      [ReplicaStatus.FAILED, creationId(host), true], 'NAMED, unlike the nameless UNROUTED row');
    assert.equal(reads, 2, 'the manager passed the phase through; the opening module read again');
    assert.equal(rowOf(e, host).opening_json, null, 'refused before the opening claim');
    assert.equal(fs.existsSync(dbPathOf(host)), false, 'nothing opened');
  });
});

// Independent witnesses; append to bound-creation-restart.integration.test.js.
test('independent U1: an inventory suspended across shutdown cannot restart a resource after process custody transfers', async (t) => {
  const e = await hostsOf(t);
  const original = e.hosts[1];
  await e.retain(original);
  const host = await e.restartHost(original, {inventory: false});
  const resumes = trackResumes(host);
  const scanned = Promise.withResolvers();
  const release = Promise.withResolvers();
  const recover = host.manager.recoverPendingOperations.bind(host.manager);
  host.manager.recoverPendingOperations = async (...args) => {
    const rows = await recover(...args);
    scanned.resolve();
    await release.promise;
    return rows;
  };
  const inventory = host.handler.recoverRetainedCreations();
  await scanned.promise;
  await e.stopHost(host);
  // An actual second composition now holds the same directory's real owner.
  const successor = await e.composeHost(host.slot, {inventory: false});
  const index = e.hosts.indexOf(host);
  e.hosts[index] = successor;
  e.clocks[index] = successor.timeSource;
  t.after(async () => {
    host.handler.shutdown();
    await host.lifecycle.shutdownAll();
  });
  release.resolve();
  await inventory;
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  t.diagnostic(JSON.stringify({oldStopped: host.stopped, resumedAfterCustodyTransfer: resumes,
    oldMemo: memoOf(host), oldInFlight: [...host.handler.inProgressOperations],
    newCompositionOwnsDirectory: Boolean(successor.processOwner)}));
  assert.deepEqual(resumes, [], 'INVENTORY_REENTERED_AFTER_PROCESS_CUSTODY_TRANSFER');
});

test('independent U1: RETIRED restart redrive and coordinator REMOVE share one in-flight retirement', async (t) => {
  const e = await publishedGroup(t);
  const original = e.hosts[1];
  crashOnce(e.metadata.primary, 'closeInstanceResource');
  await removeAndSettle(e, original, 'independent-initial-remove',
    OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
  const host = await e.restartHost(original, {inventory: false});
  const firstEntered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const stop = host.manager.stopReplica.bind(host.manager);
  let entries = 0;
  host.manager.stopReplica = async (...args) => {
    entries += 1;
    if (entries === 1) {
      firstEntered.resolve();
      await release.promise;
    }
    return stop(...args);
  };
  host.inventory = await host.handler.recoverRetainedCreations();
  const reply = await e.dispatch(host, TYPE.REMOVE_REPLICA, 'independent-concurrent-remove');
  assert.equal(reply.status, REPLY.IN_PROGRESS);
  await firstEntered.promise;
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  const concurrentEntries = entries;
  release.resolve();
  await e.settle(() => memoOf(host)?.status === ReplicaStatus.REMOVED, 'independent retirement');
  t.diagnostic(JSON.stringify({concurrentEntries, totalEntries: entries,
    outcomes: host.outcomes, rowState: rowOf(e, host).state}));
  assert.equal(concurrentEntries, 1, 'RESTART_REDRIVE_BYPASSED_EXISTING_REMOVE_SINGLE_FLIGHT');
});

// Independent live-versus-restart discrimination witness: both calls begin
// before ready, and the late earlier scan must not overwrite the newer state.
test('independent U1: overlapping startup inventories cannot overwrite an ACTIVE creation with a stale HELD memo', async (t) => {
  const e = await publishedGroup(t);
  const host = await e.restartHost(e.hosts[1], {inventory: false});
  const resumes = trackResumes(host);
  const scanned = Promise.withResolvers();
  const release = Promise.withResolvers();
  const recover = host.manager.recoverPendingOperations.bind(host.manager);
  let invocations = 0;
  host.manager.recoverPendingOperations = async (...args) => {
    invocations += 1;
    const rows = await recover(...args);
    if (invocations === 1) {
      scanned.resolve();
      await release.promise;
    }
    return rows;
  };
  const first = host.handler.recoverRetainedCreations();
  await scanned.promise;
  // V3 preserves the independent coalescence oracle without waiting on a
  // second scan that a correct shared startup promise must never perform.
  const second = host.handler.recoverRetainedCreations();
  await inventoryTurns();
  const scansBeforeRelease = invocations;
  release.resolve();
  const [firstPlans, secondPlans] = await Promise.all([first, second]);
  host.inventory = firstPlans;
  await e.form();
  await e.settle(() => memoOf(host)?.status === ReplicaStatus.ACTIVE, 'inventory reached ACTIVE');
  const before = {...memoOf(host)};
  const replay = await host.handler.recoverRetainedCreations();
  const after = {...memoOf(host)};
  t.diagnostic(JSON.stringify({invocations, scansBeforeRelease, before, after, resumes}));
  assert.equal(scansBeforeRelease, 1, 'OVERLAPPING_INVENTORY_STARTED_A_SECOND_SCAN');
  assert.strictEqual(firstPlans, secondPlans, 'CALLERS_DID_NOT_SHARE_THE_APPLIED_PLAN');
  assert.strictEqual(replay, firstPlans, 'SUCCESSFUL_INVENTORY_WAS_RESCANNED');
  assert.deepEqual(after, before, 'STALE_STARTUP_SCAN_OVERWROTE_LIVE_ACTIVE_MEMO');
});

// An admitted by-path retirement belongs to the lifecycle until it is joined.
test('independent U1: shutdown cannot release process custody while an admitted by-path retirement is paused', async (t) => {
  const e = await publishedGroup(t);
  const host = await e.restartHost(e.hosts[1], {inventory: false});
  const retained = await host.manager.readRetainedCreation(creationId(host));
  const owner = e.metadata.primary;
  const releaseResource = owner.releaseInstanceResource.bind(owner);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  owner.releaseInstanceResource = async (...args) => {
    entered.resolve();
    await release.promise;
    return releaseResource(...args);
  };
  assert.equal(host.lifecycle.activeReplicas.size, 0, 'retirement uses the unopened file path');
  assert.equal(localRecord(host).phase, 'PUBLISHED');
  const retiring = host.lifecycle.retireReplica(retained);
  await entered.promise;
  let shutdownFinished = false;
  const shuttingDown = e.stopHost(host).then(() => {
    shutdownFinished = true;
  });
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  const custodyReleasedWhileRetirementPending = shutdownFinished;
  let successor = null;
  if (custodyReleasedWhileRetirementPending) {
    successor = await e.composeHost(host.slot, {inventory: false});
    const index = e.hosts.indexOf(host);
    e.hosts[index] = successor;
    e.clocks[index] = successor.timeSource;
  }
  release.resolve();
  const retired = await retiring;
  await shuttingDown;
  t.diagnostic(JSON.stringify({custodyReleasedWhileRetirementPending,
    newCompositionOwnsDirectory: Boolean(successor?.processOwner), retired,
    localPhaseAfterRelease: localRecord(host).phase, resourcePhase: slotPhase(e, host)}));
  assert.equal(custodyReleasedWhileRetirementPending, false,
    'PROCESS_OWNER_RELEASED_WITH_ADMITTED_BY_PATH_RETIREMENT_OUTSTANDING');
});

// Two retained creations for one canonical replica are legitimate when the
// predecessor CLOSED, its completion-row write was lost, and a successor was selected.
for (const order of ['predecessor-first', 'successor-first']) {
  test(`independent U1: ${order} inventory preserves both predecessor cleanup and successor reentry`, async (t) => {
    const e = await publishedGroup(t);
    const host = e.hosts[1];
    const predecessorId = creationId(host);
    const predecessorTime = rowOf(e, host).created_at;
    const previousBinding = host.intent.consensusBinding;
    // Existing labelled crash point 5, after CLOSED/STOPPED, before row completion.
    e.metadata.setJournalFault('before-admission');
    await e.dispatch(host, TYPE.REMOVE_REPLICA, 'independent-old-remove');
    await e.settle();
    e.metadata.setJournalFault(null);
    assert.equal(rowOf(e, host).state, 'in_progress');
    for (const other of e.hosts.filter((item) => item !== host)) {
      await removeAndSettle(e, other, `independent-other-remove-${other.slot}`, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    }
    assert.ok(e.metadata.state().selected.resources.every((slot) => slot.phase === 'CLOSED'));
    const successor = await e.metadata.primary.selectConsensusInstance(
      e.metadata.request(1, 91, previousBinding.incarnation));
    assert.equal(successor.outcome, 'SELECTED');
    const successorId = order === 'predecessor-first' ? 'z-successor-1' : 'a-successor-1';
    const intent = structuredClone(host.intent);
    intent.consensusBinding = successor.binding;
    intent.consensusSlotRequest = e.metadata.slotRequest(host.slot, 0, successorId);
    assert.equal(intent.consensusSlotRequest.replicaId, replicaIdOf(host));
    // Equal creation milliseconds are legal. Operation ids break the scan tie.
    host.manager._timeSource = {now: () => predecessorTime};
    const retained = await host.manager.prepareConsensusCreation(intent);
    assert.equal(retained.outcome, 'ADMISSION_RETAINED');
    const restarted = await e.restartHost(host, {inventory: false});
    const resumes = trackResumes(restarted);
    restarted.inventory = await restarted.handler.recoverRetainedCreations();
    await e.settle();
    const predecessorRow = e.metadata.db.prepare('SELECT state FROM wasm_operations WHERE operation_id = ?').get(predecessorId);
    const successorRow = e.metadata.db.prepare('SELECT state FROM wasm_operations WHERE operation_id = ?').get(successorId);
    const observations = {order, plans: plansOf(restarted), resumes, memo: memoOf(restarted),
      predecessorRow: predecessorRow.state, successorRow: successorRow.state,
      outcomes: restarted.outcomes};
    t.diagnostic(JSON.stringify(observations));
    assert.deepEqual({predecessorRow: observations.predecessorRow,
      successorRow: observations.successorRow,
      memoId: observations.memo?.operationId, memoStatus: observations.memo?.status, resumes},
    {predecessorRow: 'completed', successorRow: 'in_progress', memoId: successorId,
      memoStatus: ReplicaStatus.HELD, resumes: [successorId]},
    'DISTINCT_RETAINED_CREATION_OBLIGATION_LOST_BY_INVENTORY_ORDER');
  });
}

// The same canonical-replica collision is not limited to a RETIRED plan.
for (const order of ['predecessor-first', 'successor-first']) {
  test(`independent U1: ${order} older ABSENT reentry cannot hide the successor`, async (t) => {
    const e = await hostsOf(t);
    await e.retain(e.hosts[1]);
    const host = await e.restartHost(e.hosts[1], {inventory: false});
    const previousBinding = host.intent.consensusBinding;
    const previousTime = rowOf(e, host).created_at;
    host.inventory = await host.handler.recoverRetainedCreations();
    // REMOVE takes custody before the queued opening, and closes on genuine absence.
    e.metadata.setJournalFault('before-admission');
    await e.dispatch(host, TYPE.REMOVE_REPLICA, 'independent-absent-remove');
    await e.settle();
    e.metadata.setJournalFault(null);
    assert.equal(fs.existsSync(dbPathOf(host)), false);
    assert.equal(rowOf(e, host).state, 'in_progress');
    assert.equal(slotPhase(e, host), 'CLOSED');
    const selected = await e.metadata.primary.selectConsensusInstance(
      e.metadata.request(1, 92, previousBinding.incarnation));
    assert.equal(selected.outcome, 'SELECTED');
    const successorId = order === 'predecessor-first' ? 'z-live-1' : 'a-live-1';
    const intent = e.intentFor(host.slot, selected.binding, successorId);
    host.manager._timeSource = {now: () => previousTime};
    assert.equal((await host.manager.prepareConsensusCreation(intent)).outcome, 'ADMISSION_RETAINED');
    const restarted = await e.restartHost(host, {inventory: false});
    const resumes = trackResumes(restarted);
    restarted.inventory = await restarted.handler.recoverRetainedCreations();
    await e.settle();
    t.diagnostic(JSON.stringify({order, plans: plansOf(restarted), resumes,
      memo: memoOf(restarted)}));
    assert.deepEqual([resumes.includes(successorId), memoOf(restarted)?.operationId,
      memoOf(restarted)?.status], [true, successorId, ReplicaStatus.HELD],
    'OLDER_REENTER_PLAN_SUPPRESSED_SUCCESSOR_REENTRY');
  });
}

// Direct behavioral observations supplement convergence assertions in M02,
// M05 and M12. A missing event fails its own assertion after runner turns.
test('independent U1 control: restart invokes the retained operation id without a scan identity', async (t) => {
  const e = await hostsOf(t);
  await e.retain(e.hosts[1]);
  const host = await e.restartHost(e.hosts[1], {inventory: false});
  const resumes = trackResumes(host);
  host.inventory = await host.handler.recoverRetainedCreations();
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(resumes, [creationId(host)], 'RESTART_USED_AN_ID_OTHER_THAN_RETAINED_CREATION');
});
test('independent U1 control: a RETIRED startup plan enters one bound stop', async (t) => {
  const e = await publishedGroup(t);
  const old = e.hosts[1];
  crashOnce(e.metadata.primary, 'closeInstanceResource');
  await removeAndSettle(e, old, 'independent-control-retire', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
  const host = await e.restartHost(old, {inventory: false});
  let stops = 0;
  const stop = host.manager.stopReplica.bind(host.manager);
  host.manager.stopReplica = (...args) => {
    stops += 1; return stop(...args);
  };
  host.inventory = await host.handler.recoverRetainedCreations();
  assert.equal(host.inventory[0].local, 'RETIRED');
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stops, 1, 'RETIRED_PLAN_NEVER_ENTERED_CANONICAL_STOP');
});
test('independent U1 control: a corrupt local record yields REMOVE_FAILED after the actual stop settles', async (t) => {
  const e = await publishedGroup(t);
  const host = await e.restartHost(e.hosts[1], {beforeCompose: (old) => {
    const db = new Database(dbPathOf(old), {fileMustExist: true});
    try {
      db.prepare('UPDATE _wasm_creation_local SET record = ? WHERE id = 1').run('{"corrupt":true}');
    } finally {
      db.close();
    }
  }});
  await e.settle();
  assert.equal(lastOutcome(host).errorCode, 'CORRUPT_STATE');
  await e.dispatch(host, TYPE.REMOVE_REPLICA, 'independent-control-corrupt-remove');
  await e.settle();
  assert.deepEqual([lastOutcome(host).outcomeType, lastOutcome(host).errorCode],
    [OUTCOME.RUNTIME_SERVICE_REMOVE_FAILED, 'CORRUPT_STATE'], 'CORRUPT_LOCAL_RECORD_WAS_LEFT_REDRIVABLE');
});


// V3 exact-plan and lifetime witnesses. Reuse the real C6 owners and their
// labelled pause seams; no test chooses physical authority by scan order.
const INVENTORY_TURNS = 4;
async function inventoryTurns() {
  for (let turn = 0; turn < INVENTORY_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

for (const memoStatus of [ReplicaStatus.HELD, ReplicaStatus.ACTIVE]) {
  test(`U1 v3 D1: original future CREATE retries itself while ${memoStatus} belongs to J`,
    async (t) => {
      const e = memoStatus === ReplicaStatus.ACTIVE ? await publishedGroup(t) : await heldGroup(t);
      const original = e.hosts[1];
      const currentId = creationId(original);
      const futureId = 'future-retained-operation';
      const request = e.metadata.request(1, 97, original.intent.consensusBinding.incarnation);
      const revision = await e.metadata.primary.catalogOwner.getCreationRevision(
        request.revisionId, request.tenantId);
      const {selectInstanceState} = await import(
        '../../src/control-plane/owners/service-instance-state.js');
      const predicted = selectInstanceState(e.metadata.state(), request, revision).result.binding;
      const futureIntent = e.intentFor(original.slot, predicted, futureId);
      assert.equal((await original.manager.prepareConsensusCreation(futureIntent)).outcome,
        'STALE_BINDING', 'the original immutable future request is not selected yet');
      const futureRow = () => e.metadata.db.prepare(
        'SELECT * FROM wasm_operations WHERE operation_id = ?').get(futureId);
      const originalIntentJson = futureRow().intent_json;
      assert.equal(futureRow().state, 'pending');
      const host = await e.restartHost(original, {inventory: false});
      // Reorder actual owner rows so the inherited implementation at least
      // reaches J; its retry will still incorrectly dispatch J for F.
      const recover = host.manager.recoverPendingOperations.bind(host.manager);
      host.manager.recoverPendingOperations = async (...args) => {
        const rows = await recover(...args);
        return [...rows.filter((entry) => entry.operationId === futureId),
          ...rows.filter((entry) => entry.operationId !== futureId)];
      };
      host.inventory = await host.handler.recoverRetainedCreations();
      await e.settle();
      if (memoStatus === ReplicaStatus.ACTIVE) {
        await e.form();
        await e.settle(() => memoOf(host)?.status === ReplicaStatus.ACTIVE, 'J active');
      }
      assert.equal(memoOf(host)?.operationId, currentId, 'J owns the live memo');
      assert.equal(memoOf(host)?.status, memoStatus);
      const exactObject = e.replicaOf(host);
      const resumes = trackResumes(host);
      const reply = await e.dispatch(host, TYPE.CREATE_REPLICA, futureId);
      await e.settle();
      assert.equal(reply.status, REPLY.IN_PROGRESS);
      assert.deepEqual(resumes, [futureId], 'KNOWN_RETAINED_F_REDIRECTED_TO_CURRENT_J');
      assert.equal(futureRow().state, 'pending');
      assert.equal(futureRow().intent_json, originalIntentJson);
      assert.equal(memoOf(host)?.operationId, currentId);
      assert.strictEqual(e.replicaOf(host), exactObject);
      const selected = await e.metadata.primary.selectConsensusInstance(request);
      assert.equal(selected.outcome, 'SELECTED');
      assert.deepEqual(selected.binding, predicted, 'real future selection matches the request');
      resumes.length = 0;
      await e.dispatch(host, TYPE.CREATE_REPLICA, futureId);
      await e.settle();
      assert.deepEqual(resumes, [futureId], 'LATER_EXACT_F_TRIGGER_WAS_UNREACHABLE');
      assert.equal(futureRow().state, 'in_progress', 'original admission is durably retained');
      assert.equal(futureRow().intent_json, originalIntentJson);
      assert.equal(JSON.parse(futureRow().admission_json).operationId, futureId);
      assert.strictEqual(e.replicaOf(host), exactObject, 'F cannot replace physical live J');
      assert.equal(memoOf(host)?.operationId, currentId, 'F refusal cannot replace J memo');
    });
}

test('U1 v3: a local inspection suspended past shutdown has no late handler effect', async (t) => {
  const e = await hostsOf(t);
  const original = e.hosts[1];
  await e.retain(original);
  const host = await e.restartHost(original, {inventory: false});
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const inspect = host.manager.inspectRetainedCreation.bind(host.manager);
  host.manager.inspectRetainedCreation = async (...args) => {
    const result = await inspect(...args);
    entered.resolve();
    await release.promise;
    return result;
  };
  const resumes = trackResumes(host);
  let readyOpened = false;
  host.handler.ready.then(() => {
    readyOpened = true;
  });
  const inventory = host.handler.recoverRetainedCreations();
  await entered.promise;
  await e.stopHost(host);
  const successor = await e.composeHost(host.slot, {inventory: false});
  e.hosts[e.hosts.indexOf(host)] = successor;
  release.resolve();
  await inventory;
  await inventoryTurns();
  assert.deepEqual(resumes, [], 'STOPPED_LOCAL_INSPECTION_ADMITTED_A_CREATION');
  assert.equal(host.handler.localReplicas.size, 0, 'STOPPED_LOCAL_INSPECTION_WROTE_MEMOS');
  assert.equal(host.handler.inProgressOperations.size, 0);
  assert.equal(readyOpened, false, 'STOPPED_LOCAL_INSPECTION_REOPENED_READY');
  assert.deepEqual(host.outcomes, [], 'STOPPED_LOCAL_INSPECTION_EMITTED_AN_OUTCOME');
});

test('U1 v3: RETIRED physical closure keeps startup debt until original journal confirms',
  async (t) => {
    const e = await publishedGroup(t);
    const original = e.hosts[1];
    crashOnce(e.metadata.primary, 'closeInstanceResource');
    await removeAndSettle(e, original, 'v3-prepare-retired', OUTCOME.RUNTIME_SERVICE_REMOVE_HELD);
    const host = await e.restartHost(original, {inventory: false});
    e.metadata.setJournalFault('before-admission');
    host.inventory = await host.handler.recoverRetainedCreations();
    await e.settle();
    assert.equal(slotPhase(e, host), 'CLOSED', 'physical closure is complete');
    assert.equal(localRecord(host).phase, 'RETIRED');
    assert.equal(rowOf(e, host).state, 'in_progress', 'completion is still owed');
    assert.equal(memoOf(host)?.status, ReplicaStatus.REMOVING,
      'PHYSICAL_CLOSED_DISCHARGED_UNCONFIRMED_ORIGINAL_JOURNAL');
    assert.deepEqual(host.outcomes, [], 'startup housekeeping emits no workflow outcome');
    e.metadata.setJournalFault(null);
    await removeAndSettle(e, host, 'v3-completion-retry', OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assertRetiredAndCompleted(e, host);
    assert.equal(e.rows('wasm_operations').filter((row) => row.operation_id.startsWith('v3-')).length,
      0, 'retirement retry created a separate STOP journal');
  });

test('U1 v3: one journal SELECT observes a PENDING-to-IN_PROGRESS transition once', async (t) => {
  const e = await hostsOf(t);
  const host = e.hosts[1];
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const reserve = e.metadata.primary.reserveInstanceResource.bind(e.metadata.primary);
  e.metadata.primary.reserveInstanceResource = async (...args) => {
    entered.resolve();
    await release.promise;
    return reserve(...args);
  };
  const preparing = e.retain(host);
  await entered.promise;
  assert.equal(rowOf(e, host).state, 'pending');
  const queries = [];
  host.manager.setRecoveryReader(async (sql, params) => {
    queries.push({sql, params});
    if (params.length === 1 && params[0] === 'in_progress') {
      await preparing;
      return e.metadata.reader(sql, params);
    }
    const rows = await e.metadata.reader(sql, params);
    release.resolve();
    await preparing;
    return rows;
  });
  const result = await host.manager.recoverPendingOperations({resolveServiceContext: () => null});
  assert.equal(rowOf(e, host).state, 'in_progress', 'real journal transition occurred');
  assert.equal(queries.length, 1, 'RECOVERY_TORE_ONE_JOURNAL_SNAPSHOT_INTO_TWO_READS');
  assert.deepEqual(queries[0].params, ['pending', 'in_progress']);
  assert.deepEqual(result.map((entry) => entry.operationId), [creationId(host)],
    'PENDING_TO_IN_PROGRESS_RETURNED_ONE_ORIGINAL_OBLIGATION_TWICE');
});

for (const conflict of [false, true]) {
  test(`U1 v3: duplicate journal observation is ${conflict ? 'refused' : 'folded'} by identity`,
    async (t) => {
      const e = await hostsOf(t);
      const original = e.hosts[1];
      await e.retain(original);
      const host = await e.restartHost(original, {inventory: false});
      host.manager.setRecoveryReader(async (sql, params) => {
        const rows = await e.metadata.reader(sql, params);
        if (!rows.length) return rows;
        const duplicate = structuredClone(rows[0]);
        if (conflict) duplicate.intent_json = '{}';
        return [...rows, duplicate];
      });
      const resumes = trackResumes(host);
      let readyOpened = false;
      host.handler.ready.then(() => {
        readyOpened = true;
      });
      if (conflict) {
        await assert.rejects(host.handler.recoverRetainedCreations(),
          {code: 'CORRUPT_STATE'}, 'CONFLICTING_OBSERVATIONS_WERE_ORDERED_INTO_A_WINNER');
        await inventoryTurns();
        assert.equal(readyOpened, false);
        assert.equal(host.handler.localReplicas.size, 0);
        assert.deepEqual(resumes, []);
      } else {
        host.inventory = await host.handler.recoverRetainedCreations();
        await e.settle();
        assert.equal(host.inventory.length, 1, 'SAME_OBLIGATION_WAS_RETAINED_TWICE');
        assert.deepEqual(resumes, [creationId(host)]);
      }
    });
}

// U1's ordinary-memo clarification: F was inventoried before J existed. J is
// therefore represented only by its real HELD memo when an explicit F retry
// takes the canonical gate. All origin, journal and physical setup is C6;
// only F's manager continuation is paused at its existing owner boundary.
const MEMO_WAKE_REPEATS = 6;
const FUTURE_WAKE_REQUEST_NONCE = 97;
const SUCCESSOR_WAKE_REQUEST_NONCE = 98;
async function ordinaryHeldBehindFuture(t) {
  const e = await hostsOf(t);
  const original = e.hosts[1];
  const futureId = 'memo-wake-future';
  const request = e.metadata.request(1, FUTURE_WAKE_REQUEST_NONCE,
    original.intent.consensusBinding.incarnation);
  const revision = await e.metadata.primary.catalogOwner.getCreationRevision(
    request.revisionId, request.tenantId);
  const {selectInstanceState} = await import(
    '../../src/control-plane/owners/service-instance-state.js');
  const predicted = selectInstanceState(e.metadata.state(), request, revision).result.binding;
  assert.equal((await original.manager.prepareConsensusCreation(
    e.intentFor(original.slot, predicted, futureId))).outcome, 'STALE_BINDING');
  const host = await e.restartHost(original, {inventory: false});
  host.inventory = await host.handler.recoverRetainedCreations();
  await e.settle();
  assert.deepEqual(host.inventory.map((plan) => plan.creation.operationId), [futureId]);
  const retained = await e.retain(host);
  assert.equal(retained.outcome, 'ADMISSION_RETAINED');
  assert.equal((await e.dispatch(host, TYPE.CREATE_REPLICA)).status, REPLY.INITIATED);
  await e.settle(() => memoOf(host)?.status === ReplicaStatus.HELD, 'ordinary J held');
  const memo = memoOf(host);
  assert.equal(memo.operationId, creationId(host));
  const replica = e.replicaOf(host);
  const release = Promise.withResolvers();
  const resumes = [];
  let entered = false;
  const resume = host.manager.resumeConsensusCreation.bind(host.manager);
  host.manager.resumeConsensusCreation = async (operationId, ...args) => {
    resumes.push(operationId);
    if (operationId === futureId && !entered) {
      entered = true;
      await release.promise;
    }
    return resume(operationId, ...args);
  };
  try {
    assert.equal((await e.dispatch(host, TYPE.CREATE_REPLICA, futureId)).status, REPLY.IN_PROGRESS);
    await inventoryTurns();
    assert.equal(entered, true, 'EXACT_F_RETRY_DID_NOT_ENTER_ITS_OWNER');
    const wake = {reason: RECONCILE_REASON.CREATION_GENESIS_OBSERVED,
      binding: retained.intent.consensusBinding, token: retained.token};
    return {e, host, futureId, retained, memo, replica, release, resumes, wake};
  } catch (error) {
    release.resolve();
    throw error;
  }
}

function queueOrdinaryMemoWake(witness) {
  const {e, host, futureId, memo, wake} = witness;
  for (let repeat = 0; repeat < MEMO_WAKE_REPEATS; repeat += 1) {
    assert.equal(host.handler.onCreationWake(e.serviceId, wake).outcome, 'QUEUED');
  }
  assert.equal(memo.wakePending, true, 'ORDINARY_J_WAKE_WAS_LOST_BEHIND_F');
  const entry = host.handler.inProgressOperations.get(futureId);
  assert.equal(entry.wakePending, false, 'J_WAKE_MUTATED_F_EXECUTION');
  assert.equal(host.inventory[0].wakePending, false, 'J_WAKE_MUTATED_F_PLAN');
  assert.equal(host.inventory[0].origin.token, null, 'J_WAKE_ADOPTED_ITS_TOKEN_INTO_F');
}

test('U1 memo wake: real HELD J retains one wake behind exact F through handler gate release',
  async (t) => {
    const witness = await ordinaryHeldBehindFuture(t);
    const {e, host, futureId, retained, memo, replica, release, resumes, wake} = witness;
    const rowsBefore = e.rows('wasm_operations');
    try {
      const foreign = {...wake, token: {...wake.token, operationId: 'foreign-memo-wake'}};
      assert.equal(host.handler.onCreationWake(e.serviceId, foreign).outcome,
        'NO_LOCAL_OPERATION');
      assert.notEqual(memo.wakePending, true);
      assert.equal(host.handler.onCreationWake(e.serviceId, {...wake,
        reason: RECONCILE_REASON.CREATION_GRANT_HELD,
        grant: {outcome: 'UNAVAILABLE'}}).outcome, 'RECORDED');
      assert.notEqual(memo.wakePending, true);
      assert.equal(host.handler.onCreationWake(e.serviceId, {...wake,
        reason: RECONCILE_REASON.CREATION_RESOURCE_CLOSED}).outcome, 'RECORDED');
      assert.notEqual(memo.wakePending, true);
      await inventoryTurns();
      assert.deepEqual(resumes, [futureId], 'NONQUALIFYING_WAKE_RESUMED_J');
      queueOrdinaryMemoWake(witness);
      await inventoryTurns();
      assert.deepEqual(resumes, [futureId], 'J_BYPASSED_F_CANONICAL_GATE');
      release.resolve();
      await e.settle();
      assert.deepEqual(resumes, [futureId, creationId(host)],
        'GATE_RELEASE_DID_NOT_CONSUME_EXACTLY_ONE_ORIGINAL_J_WAKE');
      assert.strictEqual(e.replicaOf(host), replica);
      assert.equal(memoOf(host)?.operationId, creationId(host));
      assert.equal(memoOf(host)?.status, ReplicaStatus.HELD);
      assert.deepEqual(JSON.parse(rowOf(e, host).admission_json), retained.token);
      assert.deepEqual(e.rows('wasm_operations'), rowsBefore,
        'WAKE_CREATED_A_NEW_JOURNAL_OR_CHANGED_ORIGINAL_RESERVATION');
    } finally {
      release.resolve();
      await inventoryTurns();
    }
  });

for (const replacement of ['memo', 'physical']) {
  test(`U1 memo wake: ${replacement} replacement refuses stale J admission at gate settlement`,
    async (t) => {
      const witness = await ordinaryHeldBehindFuture(t);
      const {e, host, memo, release, resumes} = witness;
      try {
        queueOrdinaryMemoWake(witness);
        let physical = e.replicaOf(host);
        if (replacement === 'memo') {
          // LABELLED volatile replacement seam through the handler's existing
          // registration API. The replacement never inherits the old bit.
          host.handler.registerExistingReplica({...memo, wakePending: false});
        } else {
          // A real successor is admitted and materialized by the lower
          // owners while the old handler continuation is suspended.
          await host.lifecycle.stopReplica(e.serviceId);
          const selected = await e.metadata.primary.selectConsensusInstance(
            e.metadata.request(1, SUCCESSOR_WAKE_REQUEST_NONCE,
              host.intent.consensusBinding.incarnation));
          assert.equal(selected.outcome, 'SELECTED');
          const successorId = 'memo-wake-physical-successor';
          const admitted = await host.manager.prepareConsensusCreation(
            e.intentFor(host.slot, selected.binding, successorId));
          assert.equal(admitted.outcome, 'ADMISSION_RETAINED');
          assert.equal((await host.manager.resumeConsensusCreation(successorId,
            {nodeId: host.nodeId})).status, 'BOOTSTRAPPED_HELD');
          physical = e.replicaOf(host);
          assert.notStrictEqual(physical, witness.replica);
        }
        const replacementMemo = memoOf(host);
        const prepared = host.driver._prepared.get(e.serviceId);
        const state = structuredClone(host.manager._replicaStateById.get(replicaIdOf(host)));
        release.resolve();
        await e.settle();
        assert.equal(resumes.filter((operationId) => operationId === creationId(host)).length, 0,
          'STALE_ORDINARY_J_WAKE_ENTERED_AFTER_REPLACEMENT');
        assert.strictEqual(memoOf(host), replacementMemo, 'STALE_WAKE_REWROTE_CANONICAL_MEMO');
        assert.strictEqual(e.replicaOf(host), physical, 'STALE_WAKE_REPLACED_PHYSICAL_OWNER');
        assert.strictEqual(host.driver._prepared.get(e.serviceId), prepared,
          'STALE_WAKE_REWROTE_SUCCESSOR_PREPARATION');
        assert.deepEqual(host.manager._replicaStateById.get(replicaIdOf(host)), state,
          'STALE_WAKE_REWROTE_SUCCESSOR_LIFECYCLE_STATE');
      } finally {
        release.resolve();
        await inventoryTurns();
      }
    });
}
// Mutation controls for the lab: removing memo.wakePending retention must fail
// ORDINARY_J_WAKE_WAS_LOST_BEHIND_F. Removing the CURRENT admission fence must
// fail STALE_ORDINARY_J_WAKE_ENTERED_AFTER_REPLACEMENT in the physical case.

// The coordinator-owned half of the shared gate: the entry's captured
// creationOperationId is part of duplicate identity, not its raw params.
test('U1 gate: coordinator-first exact REMOVE repeats share one retirement and one outcome',
  async (t) => {
    const e = await publishedGroup(t);
    const host = e.hosts[1];
    const removeId = 'coordinator-first-remove';
    const foreignId = 'coordinator-first-foreign';
    const release = Promise.withResolvers();
    let stops = 0;
    const stop = host.manager.stopReplica.bind(host.manager);
    host.manager.stopReplica = async (...args) => {
      stops += 1;
      await release.promise;
      return stop(...args);
    };
    try {
      assert.equal((await e.dispatch(host, TYPE.REMOVE_REPLICA, removeId)).status, REPLY.INITIATED);
      await inventoryTurns();
      assert.equal(stops, 1, 'COORDINATOR_REMOVE_DID_NOT_REACH_ORIGINAL_OWNER');
      for (let repeat = 0; repeat < MEMO_WAKE_REPEATS; repeat += 1) {
        assert.equal((await e.dispatch(host, TYPE.REMOVE_REPLICA, removeId)).status,
          REPLY.IN_PROGRESS, 'IDENTICAL_COORDINATOR_REQUEST_LOST_ITS_CAPTURED_TARGET');
      }
      const changed = await host.handler.handleRemoveReplica(
        {...e.request(host, TYPE.REMOVE_REPLICA, removeId), reason: 'different-remove-reason'});
      assert.deepEqual([changed.status, changed.errorCode, changed.deferRetry],
        [REPLY.ERROR, 'CONTENT_CONFLICT', false]);
      const foreign = await e.dispatch(host, TYPE.REMOVE_REPLICA, foreignId);
      assert.deepEqual([foreign.status, foreign.deferRetry], [REPLY.ERROR, true],
        'FOREIGN_COORDINATOR_REQUEST_WAS_UNBOUNDEDLY_ADMITTED');
      await inventoryTurns();
      assert.equal(stops, 1, 'DUPLICATE_COORDINATOR_REMOVE_ENTERED_ANOTHER_STOP');
      release.resolve();
      await e.settle(() => rowOf(e, host).state === 'completed', 'coordinator retirement');
      const outcomes = host.outcomes.filter((outcome) => outcome.operationId === removeId);
      assert.deepEqual(outcomes.map((outcome) => outcome.outcomeType),
        [OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED], 'COALESCED_REMOVE_EMITTED_MULTIPLE_OUTCOMES');
      assert.equal(host.outcomes.some((outcome) => outcome.operationId === foreignId), false);
      assert.equal(e.rows('wasm_operations').some((row) => row.operation_id === removeId), false,
        'REMOVE_MINTED_A_REPLACEMENT_JOURNAL');
    } finally {
      release.resolve();
      await inventoryTurns();
    }
  });
