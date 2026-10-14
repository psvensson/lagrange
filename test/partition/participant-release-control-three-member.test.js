// Real admitted three-member SQL_TRANSACTIONS control group. Every release
// action reaches the original ReplicaHandler and PartitionService owners over
// actual loopback transport; this fixture never supplies a fabricated Raft
// status, membership, release answer, OPEN or generation.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {PartitionService} from '../../src/partition/partition-service.js';
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

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_ID = 'sql-control-three-voter';
const MEMBERS = Object.freeze([1, 2, 3].map((n) =>
  Object.freeze([`${PARTITION_ID}-r${n}`, NODE_ID])));
const TIMEOUT_MS = 40000;
const RELEASE_BUDGET_MS = 15000;

function retain(current, error, label) {
  return current === null ? error : new AggregateError([current, error], label);
}

test('three actual current SQL control voters share one PAUSE census and each rechecks RESUME',
  {timeout: TIMEOUT_MS}, async () => {
    const transport = createLoopbackTransport();
    let group = null;
    let handler = null;
    let failure = null;
    try {
      group = await formAdmittedGroup({
        partitionId: PARTITION_ID,
        members: MEMBERS,
        tempPrefix: 'control-paused-census-three-',
        budgetMs: RELEASE_BUDGET_MS,
        serviceOptions: {tableId: TABLES.SQL_TRANSACTIONS,
          tableName: TABLES.SQL_TRANSACTIONS, schema: SQL_TRANSACTIONS_SCHEMA},
        transport,
      });
      assert.equal(group.services.length, 3,
        'three actual native PartitionService replicas were admitted');
      const leader = group.services.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      assert.ok(leader, 'native group has an actual elected leader');
      handler = new ReplicaHandler({
        nodeId: NODE_ID, ownerIncarnation: 1,
        systemTableCache: leader.systemTableCache,
        cdcIntegrationService: {},
        createPartitionService: (options) => new PartitionService(options),
        messageRouter: transport,
        dataDir: path.dirname(group.dbFileOf(MEMBERS[0])),
      });
      handler.registerWithRouter(transport);
      for (const service of group.services) {
        handler.localServices.set(service.replicaId, service);
      }
      const build = await runtimeBuildProvenance();
      assert.equal(build.state, 'measured', build.reason);
      const release = () => handler.participantReleaseRecovery.releaseOperator({
        partitionId: PARTITION_ID, targetBuildDigest: build.digest,
        deadlineAtMs: handler.timeSource.now() + RELEASE_BUDGET_MS,
      });
      const first = await release();
      assert.equal(first.outcome, OUTCOME.CUT_OVER,
        'the original native three-member release must install durable origins: ' +
          JSON.stringify(first));
      const origins = group.services.map((service) =>
        readPartitionWriteOrigin(service.db));
      assert.ok(origins.every((x) => x !== null),
        'every actual physical member now has a durable write origin');
      assert.ok(origins.every((x) => JSON.stringify(x) === JSON.stringify(origins[0])),
        'the three actual member durable origins agree');
      const seen = [];
      const originalDeliver = transport.deliver;
      transport.deliver = function(...args) {
        const request = args[1];
        if (request?.type === PARTICIPANT_RELEASE_TYPE &&
            request.partitionId === PARTITION_ID) {
          seen.push({action: request.action, replicaId: request.replicaId ?? null});
        }
        return Reflect.apply(originalDeliver, this, args);
      };
      let repeated;
      try {
        repeated = await release();
      } finally {
        transport.deliver = originalDeliver;
      }
      assert.equal(repeated.outcome, OUTCOME.CUT_OVER, JSON.stringify(repeated));
      assert.equal(repeated.census?.length, 3,
        'current release owner must return its complete actual three-member census');
      for (const service of group.services) {
        const member = seen.filter((record) => record.replicaId === service.replicaId);
        const count = (action) =>
          member.filter((record) => record.action === action).length;
        assert.equal(count(ACTION.INSPECT), 1,
          `${service.replicaId}: original current-member inspection occurs once`);
        assert.equal(count(ACTION.PAUSE), 1,
          `${service.replicaId}: original admission owner closes work`);
        assert.equal(count(ACTION.RESUME), 1,
          `${service.replicaId}: original recipient performs fresh final RESUME checks`);
        assert.equal(count(ACTION.ENABLE), 0);
        assert.equal(count(ACTION.OBSERVE_APPLIED_POSITION), 0);
        assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN,
          'only the current original recipient can reopen its admission');
        assert.deepEqual(readPartitionWriteOrigin(service.db),
          origins[group.services.indexOf(service)]);
      }

      // A real schema mutation AFTER the last member's PAUSE response is
      // different from a mutation immediately before that member's RESUME:
      // it can invalidate one remote member while the caller still holds
      // the previously valid complete member census. The OLD second
      // cross-member INSPECT must be tested as a causal comparator.
      const lastMember = group.services.at(-1);
      let pausedReplies = 0;
      let schemaChanged = false;
      transport.deliver = function(...args) {
        const request = args[1];
        const delivered = Reflect.apply(originalDeliver, this, args);
        if (request?.type === PARTICIPANT_RELEASE_TYPE &&
            request.partitionId === PARTITION_ID &&
            request.action === ACTION.PAUSE) {
          pausedReplies += 1;
          if (pausedReplies === group.services.length) {
            return Promise.resolve(delivered).then((response) => {
              lastMember.db.exec('DROP TRIGGER sql_transactions_initial_lineage_v1');
              schemaChanged = true;
              return response;
            });
          }
        }
        return delivered;
      };
      let raced;
      try {
        raced = await release();
      } finally {
        transport.deliver = originalDeliver;
      }
      assert.equal(schemaChanged, true,
        'a real control member schema changed after its returned PAUSE facts');
      assert.equal(pausedReplies, group.services.length,
        'the original complete three-member PAUSE cohort was reached');
      assert.notEqual(raced.outcome, OUTCOME.CUT_OVER,
        'invalid current schema cannot grant a successful control release');
      const admissions = group.services.map((service) =>
        participantReleaseAdmissionOf(service).state);
      assert.deepEqual(admissions, [
        ADMISSION.CLOSED, ADMISSION.CLOSED, ADMISSION.CLOSED,
      ], 'a failed current member cohort must leave every other control voter CLOSED');
      assert.deepEqual(group.services.map((service) =>
        readPartitionWriteOrigin(service.db)), origins,
      'a failed late schema proof must not rewrite any durable member origin');
    } catch (error) {
      failure = error;
    } finally {
      try {
        if (handler !== null) {
          await handler.participantReleaseRecovery.shutdown();
          handler.unregisterFromRouter(transport);
        }
      } catch (error) {
        failure = retain(failure, error, 'real three-member release-owner cleanup');
      }
      try {
        await group?.dispose({retainDirectory: failure !== null});
      } catch (error) {
        failure = retain(failure, error, 'real native three-member shutdown');
      }
    }
    if (failure !== null) throw failure;
  });
