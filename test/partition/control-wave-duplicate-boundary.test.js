// The unchanged cutover owner makes complete current-control PAUSE/RESUME
// round trips for each dependent before AND after its own full release.
// This exact-source negative uses real registered handlers and committed Raft
// groups. No fabricated census, open flag, release response or membership.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {requestParticipantRelease} from '../../src/node/participant-release-client.js';
import {MEMBERSHIP_OWNER_OUTCOME_TYPE, MEMBERSHIP_OWNER_REASON,
  STARTUP_JOIN_MODE, TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT} from
  '../../src/bootstrap/rejoin-hints-constants.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_CONTROL_WAVE_FIELD as WAVE_FIELD,
  PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
  PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';

const CONTROL = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE = 'seed-control-wave-original-host';
const TEST_TIMEOUT_MS = 90000;
const RELEASE_BUDGET_MS = 25000;
const THREE_CONTROL = Object.freeze([1, 2, 3].map((n) =>
  Object.freeze([`${CONTROL}-wave-r${n}`, NODE])));
const DEPENDENTS = Object.freeze([
  Object.freeze({id: 'seed-wave-dependent-a-p1', table: 'seed_wave_a'}),
  Object.freeze({id: 'seed-wave-dependent-b-p1', table: 'seed_wave_b'}),
]);
const DATA_SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT'},
]});

function collectFailure(first, error, message) {
  return first === null ? error : new AggregateError([first, error], message);
}

test('one canonical wave holds three real control voters across two released native cohorts',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const transport = createLoopbackTransport();
    const groups = [];
    let handler = null;
    let failure = null;
    try {
      const control = await formAdmittedGroup({
        partitionId: CONTROL,
        members: THREE_CONTROL,
        tempPrefix: 'seed-wave-three-control-',
        serviceOptions: {tableId: TABLES.SQL_TRANSACTIONS,
          tableName: TABLES.SQL_TRANSACTIONS, schema: SQL_TRANSACTIONS_SCHEMA},
        budgetMs: RELEASE_BUDGET_MS,
        transport,
      });
      groups.push(control);
      for (const item of DEPENDENTS) {
        const members = [[`${item.id}-r1`, NODE]];
        const group = await formAdmittedGroup({
          partitionId: item.id,
          members,
          tempPrefix: `seed-wave-dependent-${item.table}-`,
          serviceOptions: {tableId: item.table,
            tableName: item.table, schema: DATA_SCHEMA},
          budgetMs: RELEASE_BUDGET_MS,
          transport,
        });
        groups.push(group);
      }
      const services = groups.flatMap((group) => group.services);
      const controlLeader = control.services.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      assert.ok(controlLeader, 'the three control voters have a real leader');
      handler = new ReplicaHandler({
        nodeId: NODE, ownerIncarnation: 1,
        systemTableCache: controlLeader.systemTableCache,
        cdcIntegrationService: {},
        createPartitionService: (options) => new PartitionService(options),
        messageRouter: transport,
        dataDir: path.dirname(control.dbFileOf(THREE_CONTROL[0])),
      });
      handler.registerWithRouter(transport);
      services.forEach((service) =>
        handler.localServices.set(service.replicaId, service));
      const build = await runtimeBuildProvenance();
      assert.equal(build.state, 'measured', build.reason);
      const release = (partitionId) =>
        handler.participantReleaseRecovery.releaseOperator({
          partitionId, targetBuildDigest: build.digest,
          deadlineAtMs: handler.timeSource.now() + RELEASE_BUDGET_MS,
        });
      const originalControl = await release(CONTROL);
      assert.equal(originalControl.outcome, OUTCOME.CUT_OVER,
        'native control must establish its real durable origin before the wave: ' +
          JSON.stringify(originalControl));
      assert.equal(originalControl.census?.length, THREE_CONTROL.length);
      const originalControlOrigins = control.services.map((service) =>
        readPartitionWriteOrigin(service.db));
      assert.ok(originalControlOrigins.every((value) => value !== null),
        'all three control voter origins are durable');
      // The tracer observes original protocol ingress, not lifecycle/readers.
      const seen = [];
      const originalDeliver = transport.deliver;
      transport.deliver = function(...args) {
        const request = args[1];
        if (request?.type === PARTICIPANT_RELEASE_TYPE) {
          seen.push(Object.freeze({partition: request.partitionId,
            action: request.action, replicaId: request.replicaId ?? null}));
        }
        return Reflect.apply(originalDeliver, this, args);
      };
      const seedProof = Object.freeze({
        semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
        boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
        outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BOOTSTRAP_SEED,
        startupMode: STARTUP_JOIN_MODE.SEED,
        reasonCode: MEMBERSHIP_OWNER_REASON.FRESH_SEED,
        durableStateDetected: false,
        identityMismatch: false,
      });
      const deadlineAtMs = handler.timeSource.now() + RELEASE_BUDGET_MS;
      const controlAuthorization = handler.participantReleaseAuthorizationOwner
        .authorizeFreshSeed({partitionId: CONTROL, targetBuildDigest: build.digest,
          membershipOwnerOutcome: seedProof});
      assert.notEqual(controlAuthorization, null,
        'the real fresh-seed token owner accepted the seed contract');
      let dependentAnswers;
      try {
        dependentAnswers = await handler.participantReleaseRecovery
          .withFreshSeedControlWave({
            targetBuildDigest: build.digest,
            deadlineAtMs, controlAuthorization,
            partitionIds: DEPENDENTS.map((item) => item.id),
          }, async (controlWaveToken) => {
            const answers = [];
            for (const item of DEPENDENTS) {
              const authorization = handler.participantReleaseAuthorizationOwner
                .authorizeFreshSeed({partitionId: item.id,
                  targetBuildDigest: build.digest, membershipOwnerOutcome: seedProof});
              assert.notEqual(authorization, null,
                'a dependent release needs its own current fresh seed authorization');
              answers.push(await requestParticipantRelease(handler, {
                partitionId: item.id, targetBuildDigest: build.digest,
                trigger: TRIGGER.FRESH_SEED, deadlineAtMs, authorization,
                [WAVE_FIELD]: controlWaveToken,
              }));
            }
            return answers;
          });
      } finally {
        transport.deliver = originalDeliver;
      }
      for (const answer of dependentAnswers) {
        assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
      }
      for (const group of groups) {
        for (const service of group.services) {
          assert.notEqual(readPartitionWriteOrigin(service.db), null,
            'all initial actual release origins have been written');
          assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN,
            'only an original current recipient can reopen its own admission');
        }
      }
      const counts = (partition, action) => seen.filter((record) =>
        record.partition === partition && record.action === action).length;
      for (const item of DEPENDENTS) {
        assert.equal(counts(item.id, ACTION.PAUSE), 1,
          'each independent partition still uses its own authentic PAUSE');
        assert.equal(counts(item.id, ACTION.RESUME), 1,
          'each independent partition still uses its own authentic RESUME');
      }
      assert.equal(counts(CONTROL, ACTION.PAUSE), THREE_CONTROL.length,
        'one joined control wave must hold all actual current control voters ' +
          'instead of repeatedly PAUSING them per dependent check');
      assert.equal(counts(CONTROL, ACTION.RESUME), THREE_CONTROL.length,
        'one joined control wave must RESUME each current control voter ' +
          'only after both independently released partitions have settled');
    } catch (error) {
      failure = error;
    } finally {
      if (handler !== null) {
        try {
          await handler.participantReleaseRecovery.shutdown();
          handler.unregisterFromRouter(transport);
        } catch (error) {
          failure = collectFailure(failure, error,
            'control-wave original handler cleanup failure');
        }
      }
      for (const group of [...groups].reverse()) {
        try {
          await group.dispose({retainDirectory: failure !== null});
        } catch (error) {
          failure = collectFailure(failure, error,
            'control-wave original physical group cleanup failure');
        }
      }
    }
    if (failure !== null) throw failure;
  });
