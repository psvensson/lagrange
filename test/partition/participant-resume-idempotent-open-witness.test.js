// Test-only idempotent-RESUME-while-OPEN witness (PR #122 review).
//
// Replays a delayed duplicate RESUME carrying the SAME releaseId under which
// its recipient (a real native three-voter cohort follower) is already OPEN.
// Before the replay, the recipient's pending-work fact is changed directly at
// its durable store owner (one valid ACTIVE sql_transactions row, the write
// path's own participants census input), which the OPEN fast path's
// Raft-status proof fields (term, leaderId, configurationKey,
// membershipGenerationIndex, runtimeGeneration, lifecycleIncarnation) do not
// read. The fresh-facts census (readParticipantReleaseFacts plus
// releaseCensusDefect) would refuse the same request after that change.
//
// Under examination: the initial facts read of the release receive path, the
// identity refusal predicate, and the idempotent OPEN fast path of
// resumeParticipantCutoverAdmission (partition-participant-transaction-pause.js).

import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {PartitionService} from '../../src/partition/partition-service.js';
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
import {participantReleaseAdmissionOf, readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {releaseCensusDefect} from
  '../../src/partition/partition-participant-release-contract.js';

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_ID = 'sql-resume-idempotent-open-witness';
const MEMBERS = Object.freeze([1, 2, 3].map((n) =>
  Object.freeze([`${PARTITION_ID}-r${n}`, NODE_ID])));
const TIMEOUT_MS = 150000;
const RELEASE_BUDGET_MS = 15000;
const TABLE = TABLES.SQL_TRANSACTIONS;
const INSERT_SQL = `INSERT INTO ${TABLE} (transaction_id, session_id, status,
  transaction_epoch, timeout_deadline, transaction_mode, participant_set_state,
  participant_set_text, commit_mode, frozen_participant_count, created_at,
  updated_at)
  VALUES (?, ?, 'ACTIVE', ?, ?, 'AUTOCOMMIT', 'OPEN', '[]', 'NOT_SELECTED',
    0, ?, ?)`;
const PENDING_TX_ID = '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b';
const now = () => Math.floor(Date.now());

function admissionState(service) {
  return participantReleaseAdmissionOf(service).state;
}

function durableRow(dbFile, txId) {
  const db = new Database(dbFile, {readonly: true});
  try {
    return db.prepare(`SELECT count(*) AS count FROM ${TABLE}
      WHERE transaction_id = ?`).get(txId).count;
  } finally {
    db.close();
  }
}

function retain(current, error, label) {
  return current === null ? error : new AggregateError([current, error], label);
}

test('a duplicate RESUME while already OPEN reports RESUMED over changed fresh facts',
  {timeout: TIMEOUT_MS}, async () => {
    const transport = createLoopbackTransport();
    let group = null;
    let handler = null;
    let failure = null;
    const observations = {candidateSource: '9233c9e0e candidate; test head 1994870bb'};
    try {
      group = await formAdmittedGroup({
        partitionId: PARTITION_ID,
        members: MEMBERS,
        tempPrefix: 'resume-idempotent-open-witness-',
        budgetMs: RELEASE_BUDGET_MS,
        serviceOptions: {tableId: TABLE, tableName: TABLE, schema: SQL_TRANSACTIONS_SCHEMA},
        transport,
      });
      const leader = group.services.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      assert.ok(leader, 'setup: the native group has an actual elected leader');
      const recipient = group.services.find((service) => service !== leader);
      assert.ok(recipient, 'setup: a follower exists as the RESUME recipient');
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

      // Capture the exact RESUME request the release dispatches to the
      // recipient (the production delivery seam).
      const captured = {payload: null, address: null, rest: null};
      const originalDeliver = transport.deliver;
      transport.deliver = function(address, payload, ...rest) {
        if (payload?.type === PARTICIPANT_RELEASE_TYPE &&
            payload.partitionId === PARTITION_ID &&
            payload.action === ACTION.RESUME &&
            payload.replicaId === recipient.replicaId &&
            captured.payload === null) {
          captured.address = address;
          captured.rest = rest;
          captured.payload = JSON.parse(JSON.stringify(payload));
        }
        return Reflect.apply(originalDeliver, this, [address, payload, ...rest]);
      };
      let first;
      try {
        first = await handler.participantReleaseRecovery.releaseOperator({
          partitionId: PARTITION_ID, targetBuildDigest: build.digest,
          deadlineAtMs: handler.timeSource.now() + RELEASE_BUDGET_MS,
        });
      } finally {
        transport.deliver = originalDeliver;
      }
      assert.equal(first.outcome, OUTCOME.CUT_OVER,
        'setup: the first release opened the clean cohort: ' +
          JSON.stringify(first.outcome));
      const admissionBefore = participantReleaseAdmissionOf(recipient);
      assert.equal(admissionBefore.state, ADMISSION.OPEN,
        'setup: the recipient is OPEN');
      assert.equal(admissionBefore.releaseId, captured.payload.release.releaseId,
        'setup: the OPEN admission holds the replayed releaseId');
      observations.setup = {
        outcome: first.outcome,
        releaseId: admissionBefore.releaseId,
        recipientAdmission: {state: admissionBefore.state,
          releaseId: admissionBefore.releaseId},
        replayedPayload: {action: captured.payload.action,
          replicaId: captured.payload.replicaId,
          releaseId: captured.payload.release.releaseId,
          attemptTerm: captured.payload.attempt.term,
          censusEntries: Array.isArray(captured.payload.census) ?
            captured.payload.census.length : null},
      };

      // Change a pending-work fact at the recipient's durable store owner.
      // Raft-status fields are untouched by a direct local store write.
      const postReplayFactsBefore = await readParticipantReleaseFacts(handler,
        recipient);
      observations.recipientFactsBeforeMutation = {
        outcome: postReplayFactsBefore.outcome,
        queryCensus: postReplayFactsBefore.queryCensus,
      };
      const insertedAtMs = now();
      recipient.db.prepare(INSERT_SQL).run(PENDING_TX_ID,
        'resume-idempotent-witness', insertedAtMs, insertedAtMs,
        insertedAtMs, insertedAtMs);
      assert.equal(durableRow(group.dbFileOf(MEMBERS.find(([replicaId]) =>
        replicaId === recipient.replicaId)), PENDING_TX_ID), 1,
      'setup: the pending-work row is durable at the recipient');
      const postReplayFacts = await readParticipantReleaseFacts(handler, recipient);
      const freshDefect = releaseCensusDefect(captured.payload.release,
        captured.payload.census, postReplayFacts,
        {attempt: captured.payload.attempt});
      observations.recipientFactsAfterMutation = {
        outcome: postReplayFacts.outcome,
        queryCensus: postReplayFacts.queryCensus,
        freshCensusDefect: freshDefect,
        raftStatus: recipient.raft.readStatus(),
      };
      assert.notEqual(freshDefect, null,
        'evidence: the complete fresh-facts census refuses the same request ' +
        'after the pending-work change: ' + JSON.stringify(freshDefect));

      // Replay the duplicate RESUME through the production delivery seam.
      const answer = await transport.deliver(captured.address, captured.payload,
        ...(captured.rest ?? []));
      observations.replay = {
        answer,
        recipientAdmissionAfter: participantReleaseAdmissionOf(recipient),
        leaderAdmission: admissionState(leader),
        allAdmissions: Object.fromEntries(group.services.map((service) =>
          [service.replicaId, admissionState(service)])),
        raftStatusAfter: recipient.raft.readStatus(),
      };
      console.log('RESUME_IDEMPOTENT_ENVELOPE ' + JSON.stringify(observations));

      // The finding: the idempotent OPEN fast path answers RESUMED even
      // though the complete fresh-facts census refuses.
      assert.equal(answer?.releaseResult?.outcome, OUTCOME.RESUMED,
        'finding: the already-OPEN recipient reports RESUMED over refused ' +
        'fresh facts: ' + JSON.stringify(answer));
      // Permission: the replay opened nothing new. The admission was already
      // OPEN under the same releaseId and the Raft-status proof still binds.
      assert.equal(observations.replay.recipientAdmissionAfter.state,
        ADMISSION.OPEN, 'the replay granted no new admission state');
      assert.equal(observations.replay.recipientAdmissionAfter.releaseId,
        admissionBefore.releaseId, 'the replay granted no new releaseId');
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
