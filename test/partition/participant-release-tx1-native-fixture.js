// Evidence-only composition of the existing native RF3 and release fixtures.
// It observes release requests and reuses their exact current target tuples.
// No synthetic census, OPEN flag, committed row, or Raft success is supplied.
import assert from 'node:assert/strict';
import path from 'node:path';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from './partition-release-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {observeParticipantReleaseDelivery} from './participant-release-delivery-recorder.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {findParticipantSession} from
  '../../src/partition/partition-participant-transaction-session.js';
import {readParticipantTransactionRow} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_TYPE,
  PARTICIPANT_RELEASE_RESULT_FIELD as RESULT, PARTICIPANT_RELEASE_ADMISSION as ADMISSION} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {identityOf, beginMessage, queryMessage, send} from
  '../test-helpers/participant-transaction-fixture.js';

const PARTITION_ID = 'release-tx1-native';
const NODE_ID = 'release-tx1-node';
const MEMBERS = [1, 2, 3].map((n) => [`${PARTITION_ID}-r${n}`, NODE_ID]);
const BUDGET_MS = 10000;
const INSERT_SQL = 'INSERT INTO release_tx1_rows (id, value) VALUES (?, ?)';
const TIMING = {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300};

function view(service, identity) {
  const store = Object.create(RaftRsDurableStore.prototype);
  store.db = service.db;
  const record = store.readDurableRecord(service.partitionId);
  const rows = service.db.prepare('SELECT * FROM _participant_transactions ' +
    'ORDER BY participant_id').all();
  return {replicaId: service.replicaId, applied: record.appliedIndex,
    committed: record.hardState.commit, last: record.entries.at(-1)?.index,
    snapshotBytes: record.snapshot?.data?.length ?? 0,
    admission: participantReleaseAdmissionOf(service),
    staged: identity ? findParticipantSession(service, identity) !== null : false,
    participant: identity ? readParticipantTransactionRow(service.db, identity) : null,
    participantCount: rows.length, participantJsonBytes: Buffer.byteLength(JSON.stringify(rows)),
    preparedCount: rows.filter((row) => row.state === 'PREPARED').length,
    outcomeCount: service.db.prepare('SELECT count(*) AS n FROM _partition_statement_outcomes')
      .get().n,
    data: service.db.prepare('SELECT * FROM release_tx1_rows ORDER BY id').all()};
}

function trace(t, label, data) {
  t.diagnostic(`${label}: ${JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value)}`);
}

async function nativeFixture(t, attachQueryRelease = null) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    logging: {level: 'fatal'}, raft: TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const transport = createLoopbackTransport();
  const deliver = transport.deliver;
  const resumeRequests = new Map();
  const observationErrors = [];
  transport.deliver = observeParticipantReleaseDelivery(deliver, ([address, payload]) => {
    if (payload.type === PARTICIPANT_RELEASE_TYPE && payload.action === ACTION.RESUME) {
      resumeRequests.set(payload.replicaId, {address, payload: structuredClone(payload)});
    }
  }, observationErrors);
  const group = await formAdmittedGroup({partitionId: PARTITION_ID, members: MEMBERS,
    tempPrefix: 'release-tx1-native-', budgetMs: BUDGET_MS, transport,
    serviceOptions: {tableName: 'release_tx1_rows', tableId: 'release_tx1_rows',
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'}]}}});
  let owners = null;
  let queryRelease = null;
  t.after(async () => {
    try {
      await owners?.dispose();
    } finally {
      try {
        await queryRelease?.dispose();
      } finally {
        transport.deliver = async () => undefined;
        await group.dispose();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
        assert.deepEqual(observationErrors, [], 'release observer must not lose evidence');
      }
    }
  });
  owners = await attachPartitionReleaseOwners(group.services,
    {directory: path.dirname(group.dbFileOf(MEMBERS[0])), budgetMs: BUDGET_MS});
  if (attachQueryRelease !== null) queryRelease = await attachQueryRelease({group, owners});
  const released = await owners.release(PARTITION_ID);
  trace(t, 'initial-release', released);
  const leader = group.services.find((service) => service.raft.readStatus().role ===
    RAFT_ROLE.LEADER);
  assert.ok(leader);
  const views = (identity) => group.services.map((service) => view(service, identity));
  const waitRows = async (identity, state) => assert.equal(await group.waitFor(() =>
    group.services.every((service) =>
      readParticipantTransactionRow(service.db, identity)?.state === state)), true);
  const pause = async () => {
    const answers = [];
    for (const service of group.services) {
      const captured = resumeRequests.get(service.replicaId);
      assert.ok(captured, 'production release supplied this current target');
      const answer = deliveryAnswerOf(await deliver.call(transport, captured.address,
        {...captured.payload, action: ACTION.PAUSE}));
      answers.push(answer);
      assert.equal(answer[RESULT]?.paused, true, JSON.stringify(answer));
    }
    trace(t, 'pause-answers', answers);
    assert.ok(views().every((entry) => entry.admission.state === ADMISSION.CLOSED));
  };
  const stage = async (suffix) => {
    const identity = identityOf(suffix.padStart(32, '0'), {partitionId: PARTITION_ID});
    assert.equal((await send(leader, beginMessage(identity))).success, true);
    const answer = await send(leader, queryMessage(identity, INSERT_SQL, [suffix, suffix]));
    assert.equal(answer.success, true, JSON.stringify(answer));
    return identity;
  };
  return {group, owners, leader, views, waitRows, pause, stage, queryRelease};
}

export {nativeFixture, trace, INSERT_SQL};
