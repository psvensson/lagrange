// Test-only late-failure falsifier for the inherited partial-RESUME race
// (PR #122 review, old source 47ceb42e4a36757007f0d8006d2014fa1400d9c8).
//
// This is a NEW falsifier of the OLD implementation; it is not a rerun of the
// PR #122 witness. The earlier witness injected the follower loss after every
// PAUSE reply, where the old source's second INSPECT refuses before any
// RESUME and every member stays closed. This witness goes one boundary
// deeper: PAUSE and the old second INSPECT cohort complete successfully, and
// one follower is made unavailable through its actual lifecycle owner (its
// own PartitionService shutdown) only after the entire second INSPECT cohort
// has settled but before RESUME is dispatched.
//
// It observes which replicas receive RESUME, the overall release outcome,
// every member's admission state, whether an ordinary proposal reaches real
// Raft consensus, whether durable application effects commit (distinguished
// from Raft-log commitment), and whether a subsequent normal release repairs
// the state.
//
// The safety contract measured here is the sealed
// seed-control-current-proof-amortization full-fallback constraint: on a
// failed guard the release must leave every closed member closed and return
// a typed refusal; no surviving member may reopen its admission or commit an
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

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_ID = 'sql-control-three-voter-late-witness';
const MEMBERS = Object.freeze([1, 2, 3].map((n) =>
  Object.freeze([`${PARTITION_ID}-r${n}`, NODE_ID])));
const TIMEOUT_MS = 150000;
const RELEASE_BUDGET_MS = 15000;
const TABLE = TABLES.SQL_TRANSACTIONS;
const ORDINARY_INSERT_SQL = `INSERT INTO ${TABLE} (transaction_id, session_id,
  status, transaction_epoch, timeout_deadline, transaction_mode,
  participant_set_state, participant_set_text, commit_mode,
  frozen_participant_count, created_at, updated_at)
  VALUES (?, ?, 'ACTIVE', ?, ?, 'AUTOCOMMIT', 'OPEN', '[]', 'NOT_SELECTED',
    0, ?, ?)`;
const ORDINARY_TX_ID = '0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d';
const RECOVERY_TX_ID = '0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c';
let witnessWriteSequence = 0;

function admissionStates(services) {
  return Object.fromEntries(services.map((service) => [service.replicaId,
    participantReleaseAdmissionOf(service).state]));
}

function durableRows(group, txId) {
  const rows = {};
  for (const member of MEMBERS) {
    const dbFile = group.dbFileOf(member);
    const db = new Database(dbFile, {readonly: true});
    try {
      rows[member[0]] = db.prepare(`SELECT count(*) AS count
        FROM ${TABLE} WHERE transaction_id = ?`).get(txId).count;
    } finally {
      db.close();
    }
  }
  return rows;
}

async function ordinaryWrite(service, txId) {
  witnessWriteSequence += 1;
  const now = Math.floor(service.timeSource.now());
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: ORDINARY_INSERT_SQL,
    params: [txId, 'late-witness-session', now, now, now, now],
    entryId: `late-witness-write-${witnessWriteSequence}`,
  });
}

async function observeOrdinaryWrites(group, services, txId) {
  const attempt = {};
  for (const service of services) {
    attempt[service.replicaId] = {
      admission: participantReleaseAdmissionOf(service).state,
      write: await ordinaryWrite(service, txId),
    };
  }
  return Object.freeze({attempt, durable: durableRows(group, txId), txId});
}

function retain(current, error, label) {
  return current === null ? error : new AggregateError([current, error], label);
}

test('a follower lost between the settled second INSPECT cohort and RESUME',
  {timeout: TIMEOUT_MS}, async () => {
    const transport = createLoopbackTransport();
    let group = null;
    let handler = null;
    let failure = null;
    const observations = {
      sourceUnderFalsification: '47ceb42e4a36757007f0d8006d2014fa1400d9c8',
    };
    try {
      group = await formAdmittedGroup({
        partitionId: PARTITION_ID,
        members: MEMBERS,
        tempPrefix: 'control-late-follower-loss-witness-',
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

      // 1. An already-clean, durably released control cohort through real
      // consensus.
      const first = await release();
      assert.equal(first.outcome, OUTCOME.CUT_OVER,
        'setup: the first release installed the durable origins: ' +
          JSON.stringify(first));
      const commitIndexAfterFirst = leader.raft.readStatus().commitIndex;
      observations.positiveControl = {
        outcome: first.outcome,
        admissions: admissionStates(group.services),
        origins: group.services.map((service) => ({replicaId: service.replicaId,
          origin: readPartitionWriteOrigin(service.db)})),
        raftCommitIndex: commitIndexAfterFirst,
      };
      assert.ok(observations.positiveControl.origins.every((x) => x.origin !== null),
        'setup: every member holds a durable write origin');

      // 2. Begin another release. PAUSE completes for the whole cohort; the
      // old source's second INSPECT cohort is then held at the last reply.
      // The victim's real lifecycle shutdown completes only after every
      // second-INSPECT reply has settled, and before any RESUME dispatch.
      const deliveryLog = [];
      let phase = 'pre-pause';
      let victimUnavailable = null;
      const pauseReplies = [];
      const secondInspectReplies = [];
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
              await Promise.all(pauseReplies.map((p) => p.catch(() => null)));
              phase = 'post-pause-inspect';
              return answer;
            });
          }
          return reply;
        }
        if (payload.action === ACTION.INSPECT && phase === 'post-pause-inspect') {
          const reply = (async () =>
            Reflect.apply(originalDeliver, this, [address, payload, ...rest]))();
          secondInspectReplies.push(reply);
          if (secondInspectReplies.length === 3) {
            return reply.then(async (answer) => {
              // The entire second INSPECT cohort has settled.
              await Promise.all(secondInspectReplies.map((p) => p.catch(() => null)));
              await victim.shutdown();
              victimUnavailable = Date.now();
              phase = 'post-pause-resume';
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
        'injection: the victim became unavailable after every second-INSPECT ' +
        'reply settled and before any resume-phase cohort operation');
      assert.equal(deliveryLog.filter((entry) => entry.action === ACTION.RESUME &&
        entry.phase === 'post-pause-inspect').length, 0,
      'injection: no RESUME was dispatched before the victim was unavailable');
      observations.injection = {
        victimReplicaId: victim.replicaId,
        secondOutcome: second,
        deliveryLog,
        resumedMembers: deliveryLog.filter((entry) =>
          entry.action === ACTION.RESUME).map((entry) => entry.replicaId),
        resumePhases: deliveryLog.filter((entry) => entry.action === ACTION.RESUME)
          .map((entry) => entry.phase),
        inspectsAfterPause: deliveryLog.filter((entry) =>
          entry.action === ACTION.INSPECT).map((entry) => entry.replicaId),
      };
      const servicesUp = group.services.filter((service) => service !== victim);
      observations.afterSecondRelease = {
        admissions: Object.fromEntries(group.services.map((service) =>
          [service.replicaId,
            service === victim ? 'shutdown' :
              participantReleaseAdmissionOf(service).state])),
        origins: group.services.map((service) => ({replicaId: service.replicaId,
          origin: service.db === null || service.db === undefined ?
            null : readPartitionWriteOrigin(service.db)})),
        raftCommitIndex: leader.raft.readStatus().commitIndex,
      };

      // 3. Does an ordinary proposal reach real Raft consensus, and does the
      // application effect commit? The durable application rows are read
      // separately from the Raft commitment witness.
      if (leader !== victim) {
        observations.ordinaryWriteDuringFailedRelease =
          await observeOrdinaryWrites(group, servicesUp, ORDINARY_TX_ID);
      }

      // 4. Repair: bring the victim back through a real production restart on
      // its own durable database, then a following release must restore
      // every member.
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
      const settled = await group.waitFor(async () => {
        const before = replacement.raft.readStatus();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const after = replacement.raft.readStatus();
        return before.connectionGeneration === after.connectionGeneration &&
          after.commitIndex === leader.raft.readStatus().commitIndex;
      });
      let third = null;
      try {
        for (let attempt = 1; attempt <= 8 && (third === null ||
            third.outcome !== OUTCOME.CUT_OVER); attempt += 1) {
          if (attempt > 1 &&
              typeof third.retryAfterMs === 'number' && third.retryAfterMs > 0) {
            await new Promise((resolve) => setTimeout(resolve,
              Math.min(third.retryAfterMs, 1000)));
          }
          let answer = null;
          try {
            answer = await release();
          } catch (error) {
            answer = {outcome: 'THREW', error: String(error?.message ?? error)};
          }
          third = attempt === 1 ? answer : Object.assign({}, answer, {
            priorRecoveryAttempts: (third.priorRecoveryAttempts ?? [])
              .concat([third.outcome]),
          });
        }
      } catch (error) {
        third = {outcome: 'THREW', error: String(error?.message ?? error)};
      }
      const servicesAfter = group.services.map((service) =>
        service === victim ? replacement : service);
      observations.recovery = {
        victimReturned: settled !== false,
        victimCommitIndex: replacement.raft.readStatus().commitIndex,
        outcome: third,
        admissions: admissionStates(servicesAfter),
        postRecoveryWrite: await observeOrdinaryWrites(group, servicesAfter,
          RECOVERY_TX_ID),
      };
      console.log('LATE_WITNESS_ENVELOPE ' + JSON.stringify(observations));

      // Decisive claims of the sealed full-fallback constraint, made only
      // after every observation (including repair) has been captured.
      if (second.outcome === OUTCOME.CUT_OVER) {
        assert.fail('the late-injected release CUT OVER while follower ' +
          `${victim.replicaId} was unavailable; witnesses: ` +
          JSON.stringify(observations.injection));
      }
      for (const [replicaId, state] of
        Object.entries(observations.afterSecondRelease.admissions)) {
        assert.notEqual(state, ADMISSION.OPEN,
          `${replicaId}: a failed release must leave surviving members closed ` +
          '(partial OPEN after the second INSPECT cohort settled)');
      }
      const rowsAfter = observations.ordinaryWriteDuringFailedRelease?.durable;
      for (const [replicaId, count] of Object.entries(rowsAfter ?? {})) {
        assert.equal(count, 0,
          `${replicaId}: an ordinary application effect committed during a ` +
          'failed release');
      }
      assert.ok(observations.recovery.victimReturned,
        'repair: the unavailable member returned');
      assert.equal(third.outcome, OUTCOME.CUT_OVER,
        'repair: the following release restores the whole cohort: ' +
          JSON.stringify(third));
      assert.equal(Object.values(observations.recovery.admissions)
        .every((state) => state === ADMISSION.OPEN), true,
      'repair: every member reopens through the recovering release');
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
