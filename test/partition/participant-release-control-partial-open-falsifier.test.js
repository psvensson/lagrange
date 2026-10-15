// Test-only decisive partial-RESUME falsifier (PR #122 review).
//
// Establishes a previously durably released clean SQL_TRANSACTIONS control
// cohort, then begins another release. After ALL PAUSE replies have completed
// and BEFORE the next post-PAUSE cohort operation is dispatched (the old
// source's second INSPECT round; the candidate's RESUME round), one replica's
// real lifecycle owner (its own PartitionService shutdown) makes it
// unavailable. The injection point is identical in both implementations and
// requires no production modification.
//
// The safety contract asserted here is the sealed
// seed-control-current-proof-amortization full-fallback constraint: on a
// failed guard the release must leave every closed member closed and return a
// typed refusal; no surviving member may reopen its admission or commit an
// ordinary write before an actual successful release or recovery.

import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES as CORE_TABLES,
} from '../../src/constants/index.js';
import {CDCOperation, PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';

assert.ok(PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED);

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_ID = 'sql-control-three-voter-falsifier';
const MEMBERS = Object.freeze([1, 2, 3].map((n) =>
  Object.freeze([`${PARTITION_ID}-r${n}`, NODE_ID])));
const TIMEOUT_MS = 150000;
const RELEASE_BUDGET_MS = 15000;
const TABLE = TABLES.SQL_TRANSACTIONS;
const WRITE_SQL = `INSERT INTO ${TABLE} (transaction_id, session_id, status,
  transaction_epoch, timeout_deadline, transaction_mode, participant_set_state,
  participant_set_text, commit_mode, frozen_participant_count, created_at,
  updated_at)
  VALUES (?, ?, 'ACTIVE', ?, ?, 'AUTOCOMMIT', 'OPEN', '[]', 'NOT_SELECTED',
    0, ?, ?)`;
const TX_ID = '0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f';
const RECOVERY_TX_ID = '0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e';
const writeParams = (service, txId) => [txId, 'falsifier-session',
  Math.floor(service.timeSource.now()), Math.floor(service.timeSource.now()),
  Math.floor(service.timeSource.now()), Math.floor(service.timeSource.now())];

function admissionStates(services) {
  return Object.fromEntries(services.map((service) => [service.replicaId,
    participantReleaseAdmissionOf(service).state]));
}

function durableTable(dbFile, txId) {
  const db = new Database(dbFile, {readonly: true});
  try {
    return db.prepare(`SELECT count(*) AS count FROM ${TABLE}
      WHERE transaction_id = ?`).get(txId).count;
  } finally {
    db.close();
  }
}

let falsifierWriteSequence = 0;

async function writeOrdinary(service, txId) {
  falsifierWriteSequence += 1;
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: WRITE_SQL,
    params: writeParams(service, txId),
    entryId: `falsifier-write-${falsifierWriteSequence}`,
  });
}

async function observeWrite(group, services, txId) {
  const answer = {};
  for (const service of services) {
    answer[service.replicaId] = {
      admission: participantReleaseAdmissionOf(service).state,
      write: await writeOrdinary(service, txId),
    };
  }
  const rows = {};
  for (const member of MEMBERS) {
    rows[member[0]] = durableTable(group.dbFileOf(member), txId);
  }
  return Object.freeze({attempt: answer, durableRows: rows, txId});
}

function retain(current, error, label) {
  return current === null ? error : new AggregateError([current, error], label);
}

test('a failed control release leaves every surviving member closed until recovery',
  {timeout: TIMEOUT_MS}, async () => {
    const transport = createLoopbackTransport();
    let group = null;
    let handler = null;
    let failure = null;
    const observations = {shas: {
      old: '47ceb42e4a36757007f0d8006d2014fa1400d9c8',
      candidate: '9233c9e0edc830fabd7e0f64a7ff1eebfe0ddada',
    }};
    try {
      group = await formAdmittedGroup({
        partitionId: PARTITION_ID,
        members: MEMBERS,
        tempPrefix: 'control-partial-open-falsifier-',
        budgetMs: RELEASE_BUDGET_MS,
        serviceOptions: {tableId: TABLE, tableName: TABLE, schema: SQL_TRANSACTIONS_SCHEMA},
        transport,
      });
      const leader = group.services.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      assert.ok(leader, 'setup: the native group has an actual elected leader');
      const victim = group.services.find((service) => service !== leader);
      assert.ok(victim, 'setup: a follower exists to make unavailable');
      handler = new ReplicaHandler({
        nodeId: NODE_ID, ownerIncarnation: 1,
        systemTableCache: leader.systemTableCache,
        cdcIntegrationService: {},
        createPartitionService: (options) =>
          new PartitionService({...options, transport}),
        messageRouter: transport,
        dataDir: path.dirname(group.dbFileOf(MEMBERS[0])),
      });
      handler.registerWithRouter(transport);
      for (const service of group.services) {
        handler.localServices.set(service.replicaId, service);
      }
      const build = await runtimeBuildProvenance();
      const release = () => handler.participantReleaseRecovery.releaseOperator({
        partitionId: PARTITION_ID, targetBuildDigest: build.digest,
        deadlineAtMs: handler.timeSource.now() + RELEASE_BUDGET_MS,
      });

      // 1. A previously durably released clean control cohort.
      const first = await release();
      assert.equal(first.outcome, OUTCOME.CUT_OVER,
        'setup: the first release installed the durable origins: ' +
          JSON.stringify(first));
      observations.positiveControl = {
        outcome: first.outcome,
        admissions: admissionStates(group.services),
        origins: group.services.map((service) => ({replicaId: service.replicaId,
          origin: readPartitionWriteOrigin(service.db)})),
      };
      assert.ok(observations.positiveControl.origins.every((x) => x.origin !== null),
        'setup: every member holds a durable write origin');
      const originBefore = JSON.stringify(
        observations.positiveControl.origins.find((x) =>
          x.replicaId === leader.replicaId).origin);

      // 2. Begin another release. The deliver seam holds the LAST PAUSE
      // reply until the whole PAUSE cohort has replied and the victim's real
      // lifecycle shutdown has completed, so the unavailability exists before
      // any post-PAUSE cohort operation is dispatched.
      const deliveryLog = [];
      let phase = 'pre-pause';
      let victimUnavailable = null;
      const pauseReplies = [];
      const originalDeliver = transport.deliver;
      transport.deliver = function(address, payload, ...rest) {
        if (payload?.type !== PARTICIPANT_RELEASE_TYPE ||
            payload.partitionId !== PARTITION_ID) {
          return Reflect.apply(originalDeliver, this, [address, payload, ...rest]);
        }
        if (payload.action === ACTION.PAUSE && phase === 'pre-pause') {
          const reply = (async () =>
            Reflect.apply(originalDeliver, this, [address, payload, ...rest]))();
          pauseReplies.push(reply);
          if (pauseReplies.length === 3) {
            return reply.then(async (answer) => {
              // All PAUSE replies of this release attempt have completed.
              await Promise.all(pauseReplies.map((p) => p.catch(() => null)));
              await victim.shutdown();
              victimUnavailable = Date.now();
              phase = 'post-pause';
              return answer;
            });
          }
          return reply;
        }
        deliveryLog.push({action: payload.action,
          replicaId: payload.replicaId ?? null, phase});
        return Reflect.apply(originalDeliver, this, [address, payload, ...rest]);
      };
      let second;
      try {
        second = await release();
      } finally {
        transport.deliver = originalDeliver;
      }
      assert.ok(victimUnavailable !== null,
        'injection: the victim became unavailable after every PAUSE reply ' +
        'completed and before any post-PAUSE cohort operation was dispatched');
      observations.injection = {
        victimReplicaId: victim.replicaId,
        victimUnavailableAfterAllPauseReplies: true,
        secondOutcome: second,
        postPauseCohortOperations: deliveryLog,
        resumedMembers: deliveryLog.filter((entry) =>
          entry.action === ACTION.RESUME).map((entry) => entry.replicaId),
        inspectsAfterPause: deliveryLog.filter((entry) =>
          entry.action === ACTION.INSPECT && entry.phase === 'post-pause')
          .map((entry) => entry.replicaId),
      };
      const servicesUp = group.services.filter((service) => service !== victim);
      observations.afterFailedRelease = {
        admissions: Object.fromEntries(group.services.map((service) =>
          [service.replicaId,
            service === victim ? 'shutdown' :
              participantReleaseAdmissionOf(service).state])),
        originOfSurvivorUnchanged: JSON.stringify(
          readPartitionWriteOrigin(leader.db)) === originBefore,
        origins: group.services.map((service) => ({replicaId: service.replicaId,
          origin: service.db === null || service.db === undefined ?
            null : readPartitionWriteOrigin(service.db)})),
      };

      // 3. Can a surviving member admit and commit an ordinary write?
      observations.writeDuringFailedRelease = await observeWrite(group,
        servicesUp, TX_ID);

      // 4. Recovery: the unavailable member returns through a real production
      // construction restart of its replica on its own durable database (the
      // same build shape the formation fixture uses), then a full release
      // must restore every member.
      const victimMember = MEMBERS.find(([replicaId]) =>
        replicaId === victim.replicaId);
      const restartCache = new SystemTableCache();
      restartCache.applySystemTableChange(CORE_TABLES.PARTITIONS,
        CDCOperation.INSERT, {partition_id: PARTITION_ID, replica_count: 3});
      for (const member of MEMBERS) {
        restartCache.applySystemTableChange(CORE_TABLES.SERVICES,
          CDCOperation.INSERT, {service_id: member[0], replica_id: member[0],
            partition_id: PARTITION_ID, service_type: SERVICE_TYPE.PARTITION,
            node_id: member[1], status: SERVICE_STATUS.ACTIVE});
      }
      const replacement = new PartitionService(withFoundingStamp({
        tableId: TABLE, tableName: TABLE, schema: SQL_TRANSACTIONS_SCHEMA,
        partitionId: PARTITION_ID,
        replicaId: victimMember[0],
        replicaIds: MEMBERS.map(([replicaId]) => replicaId),
        peerAddresses: MEMBERS.map((member) => group.addressOf(member)),
        nodeId: victimMember[1],
        dbPath: group.dbFileOf(victimMember),
        transport,
        systemTableCache: restartCache,
      }));
      await replacement.initialize();
      handler.replaceLocalReplicaService(victim.replicaId, replacement);
      const victimAddress = group.addressOf(MEMBERS.find(([replicaId]) =>
        replicaId === victim.replicaId));
      const rejoined = await group.waitFor(() => {
        const status = leader.raft.readStatus();
        const progress = status.followerProgress?.[victimAddress];
        return progress !== undefined && progress === status.commitIndex;
      });
      // The replacement's connection generation keeps incrementing while its
      // raft reconnects; release only once it is quiet and fully caught up.
      const _settled = await group.waitFor(async () => {
        const before = replacement.raft.readStatus();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const after = replacement.raft.readStatus();
        return before.connectionGeneration === after.connectionGeneration &&
          after.commitIndex === leader.raft.readStatus().commitIndex;
      });
      let third = null;
      try {
        third = await release();
      } catch (error) {
        third = {outcome: 'THREW', error: String(error?.message ?? error)};
      }
      const servicesAfter = group.services.map((service) =>
        service === victim ? replacement : service);
      observations.recovery = {
        victimReturned: rejoined && _settled !== false,
        victimStatus: replacement.raft?.readStatus?.() ?? null,
        leaderProgressKeys: Object.keys(leader.raft.readStatus().
          followerProgress ?? {}),
        outcome: third,
        admissions: admissionStates(servicesAfter),
        postRecoveryWrite: await observeWrite(group, servicesAfter,
          RECOVERY_TX_ID),
      };
      console.log('FALSIFIER_RECOVERY_ENVELOPE ' + JSON.stringify(
        observations.recovery));
      console.log('FALSIFIER_ENVELOPE ' + JSON.stringify(observations));

      // Seeded full-fallback constraint: a failed guard leaves closed and
      // returns a typed refusal. Everything below asserts captured snapshots.
      assert.notEqual(second.outcome, OUTCOME.CUT_OVER,
        'the failed release must refuse overall');
      for (const [replicaId, state] of
        Object.entries(observations.afterFailedRelease.admissions)) {
        assert.notEqual(state, ADMISSION.OPEN,
          `${replicaId}: a failed release must leave closed members closed ` +
          '(no partial OPEN)');
      }
      assert.equal(observations.afterFailedRelease.originOfSurvivorUnchanged,
        true, 'durable origin must not change on a failed release');
      const writes = observations.writeDuringFailedRelease.attempt;
      for (const [replicaId, observation] of Object.entries(writes)) {
        assert.notEqual(observation.admission, ADMISSION.OPEN,
          `${replicaId}: no surviving member is open after a failed release`);
      }
      for (const row of
        Object.values(observations.writeDuringFailedRelease.durableRows)) {
        assert.equal(row, 0,
          'an ordinary write committed after a failed release (partial OPEN)');
      }
      assert.ok(observations.recovery.victimReturned,
        'recovery: the unavailable member returned');
      assert.equal(third.outcome, OUTCOME.CUT_OVER,
        'recovery: the following release restores the whole cohort: ' +
          JSON.stringify(third));
      assert.equal(
        Object.values(observations.recovery.admissions).every((state) =>
          state === ADMISSION.OPEN), true,
        'recovery: every member reopens through the recovering release');
    } catch (error) {
      failure = error;
    } finally {
      try {
        if (handler !== null) {
          await handler.participantReleaseRecovery.shutdown();
          handler.unregisterFromRouter(transport);
        }
      } catch (error) {
        failure = retain(failure, error, 'release-owner cleanup');
      }
      try {
        await group?.dispose({retainDirectory: failure !== null});
      } catch (error) {
        failure = retain(failure, error, 'native three-member shutdown');
      }
    }
    if (failure !== null) throw failure;
  });
