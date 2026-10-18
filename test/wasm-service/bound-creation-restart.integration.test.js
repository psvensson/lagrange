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
