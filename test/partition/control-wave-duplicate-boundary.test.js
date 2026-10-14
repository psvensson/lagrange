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
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
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
      let finishedWaveToken = null;
      try {
        dependentAnswers = await handler.participantReleaseRecovery
          .withFreshSeedControlWave({
            targetBuildDigest: build.digest,
            deadlineAtMs, controlAuthorization,
            partitionIds: DEPENDENTS.map((item) => item.id),
          }, async (controlWaveToken) => {
            finishedWaveToken = controlWaveToken;
            const answers = [];
            const first = DEPENDENTS[0];
            const freshAuthorization = handler.participantReleaseAuthorizationOwner
              .authorizeFreshSeed({partitionId: first.id,
                targetBuildDigest: build.digest, membershipOwnerOutcome: seedProof});
            const baseRequest = {partitionId: first.id,
              targetBuildDigest: build.digest, deadlineAtMs,
              trigger: TRIGGER.FRESH_SEED, authorization: freshAuthorization};
            const serializedToken = JSON.parse(JSON.stringify(controlWaveToken));
            const forged = await requestParticipantRelease(handler, {
              ...baseRequest, [WAVE_FIELD]: serializedToken});
            assert.equal(forged.outcome, OUTCOME.UNAVAILABLE,
              'JSON-cloned correlation cannot grant fresh control authority');
            assert.equal(forged.missingFact, MISSING_FACT.CURRENT_CONTROL_OWNER);
            const operatorAuthorization = handler.participantReleaseAuthorizationOwner
              .authorizeOperator({partitionId: first.id, targetBuildDigest: build.digest});
            const foreignKind = await requestParticipantRelease(handler, {
              ...baseRequest, authorization: operatorAuthorization,
              [WAVE_FIELD]: controlWaveToken});
            assert.equal(foreignKind.outcome, OUTCOME.UNAVAILABLE,
              'an operator credential cannot join an active fresh-seed wave');
            assert.equal(foreignKind.missingFact, MISSING_FACT.CURRENT_CONTROL_OWNER);
            const eligibleFirstService = groups[1].services[0];
            assert.equal(participantReleaseAdmissionOf(eligibleFirstService).state,
              ADMISSION.CLOSED,
              'neither forgery can reopen the still-unreleased dependent');
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
      const dependentAuthorization = handler.participantReleaseAuthorizationOwner
        .authorizeFreshSeed({partitionId: DEPENDENTS[0].id,
          targetBuildDigest: build.digest, membershipOwnerOutcome: seedProof});
      const retired = await requestParticipantRelease(handler, {
        partitionId: DEPENDENTS[0].id, targetBuildDigest: build.digest,
        trigger: TRIGGER.FRESH_SEED, deadlineAtMs,
        authorization: dependentAuthorization, [WAVE_FIELD]: finishedWaveToken});
      assert.equal(retired.outcome, OUTCOME.UNAVAILABLE,
        'a successfully retired wave token can never act as control permission');
      assert.equal(retired.missingFact, MISSING_FACT.CURRENT_CONTROL_OWNER);
      assert.equal(participantReleaseAdmissionOf(controlLeader).state, ADMISSION.OPEN,
        'retired correlation cannot close or reopen the current control member');

      // An actual current-control INSPECT may have completed on the remote
      // recipient before its reply is delivered to the waiting release.
      // A late reply from the *held* interval cannot authorize a dependent
      // PAUSE after the wave has already reached END and retired.
      const inspected = Promise.withResolvers();
      const deliverOldFacts = Promise.withResolvers();
      const originalLateDeliver = transport.deliver;
      let delayedFirstInspect = false;
      let lateDependentPauses = 0;
      let controlInspectsSeen = 0;
      let lateRelease = null;
      try {
        const lateWave = handler.participantReleaseRecovery.withFreshSeedControlWave({
          targetBuildDigest: build.digest, deadlineAtMs, controlAuthorization,
          partitionIds: [DEPENDENTS[0].id],
        }, async (inFlightToken) => {
          transport.deliver = async function(...args) {
            const req = args[1];
            if (req?.type === PARTICIPANT_RELEASE_TYPE &&
                req.partitionId === DEPENDENTS[0].id && req.action === ACTION.PAUSE) {
              lateDependentPauses += 1;
            }
            if (req?.type === PARTICIPANT_RELEASE_TYPE &&
                req.partitionId === CONTROL && req.action === ACTION.INSPECT) {
              controlInspectsSeen += 1;
            }
            if (!delayedFirstInspect && req?.type === PARTICIPANT_RELEASE_TYPE &&
                req.partitionId === CONTROL && req.action === ACTION.INSPECT) {
              delayedFirstInspect = true;
              const oldFacts = await Reflect.apply(originalLateDeliver, this, args);
              inspected.resolve();
              await deliverOldFacts.promise;
              return oldFacts;
            }
            return Reflect.apply(originalLateDeliver, this, args);
          };
          lateRelease = requestParticipantRelease(handler, {
            partitionId: DEPENDENTS[0].id, targetBuildDigest: build.digest,
            trigger: TRIGGER.FRESH_SEED, deadlineAtMs,
            authorization: dependentAuthorization, [WAVE_FIELD]: inFlightToken});
          let inspectTimeout = null;
          try {
            await Promise.race([
              inspected.promise,
              new Promise((_, reject) => {
                inspectTimeout = setTimeout(() =>
                  reject(new Error('late reply test did not engage control inspect; ' +
                    `observed=${controlInspectsSeen}`)), 2000);
              }),
            ]);
          } finally {
            if (inspectTimeout !== null) clearTimeout(inspectTimeout);
          }
          // Deliberately return early. No permission may outlive its owner.
        });
        await inspected.promise;
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(participantReleaseAdmissionOf(controlLeader).state,
          ADMISSION.CLOSED,
          'END must wait for a child whose current-control INSPECT reply is held');
        deliverOldFacts.resolve();
        const admitted = await lateRelease;
        assert.equal(admitted.outcome, OUTCOME.CUT_OVER,
          'already admitted child completes under the still-held current control wave');
        await lateWave;
        assert.equal(lateDependentPauses, 1,
          'the child can PAUSE only while its control owner remains held');
        assert.equal(participantReleaseAdmissionOf(controlLeader).state,
          ADMISSION.OPEN, 'END reopens control only after the held child settles');
      } finally {
        deliverOldFacts.resolve();
        transport.deliver = originalLateDeliver;
        if (lateRelease !== null) await Promise.allSettled([lateRelease]);
      }

      // The callback's completion is not proof that already-started child
      // cutovers have finished. Trap the next real dependent PAUSE response,
      // return from the callback, and verify END cannot resume control until
      // that admitted child settles under its original request deadline.
      const pausedChild = Promise.withResolvers();
      const allowChildPause = Promise.withResolvers();
      const originalHeldDeliver = transport.deliver;
      const pendingPartition = DEPENDENTS[1].id;
      const pendingAuthorization = handler.participantReleaseAuthorizationOwner
        .authorizeFreshSeed({partitionId: pendingPartition,
          targetBuildDigest: build.digest, membershipOwnerOutcome: seedProof});
      let trappedPause = false;
      let earlyResumes = 0;
      let pausePermitOpen = false;
      let admittedChild = null;
      let earlyReturnWave = null;
      let liveWaveToken = null;
      try {
        earlyReturnWave = handler.participantReleaseRecovery.withFreshSeedControlWave({
          targetBuildDigest: build.digest, deadlineAtMs, controlAuthorization,
          partitionIds: [pendingPartition],
        }, async (token) => {
          liveWaveToken = token;
          transport.deliver = async function(...args) {
            const req = args[1];
            if (req?.type === PARTICIPANT_RELEASE_TYPE &&
                req.partitionId === CONTROL && req.action === ACTION.RESUME &&
                !pausePermitOpen) {
              earlyResumes += 1;
            }
            if (!trappedPause && req?.type === PARTICIPANT_RELEASE_TYPE &&
                req.partitionId === pendingPartition &&
                req.action === ACTION.PAUSE) {
              trappedPause = true;
              pausedChild.resolve();
              await allowChildPause.promise;
            }
            return Reflect.apply(originalHeldDeliver, this, args);
          };
          admittedChild = requestParticipantRelease(handler, {
            partitionId: pendingPartition, targetBuildDigest: build.digest,
            trigger: TRIGGER.FRESH_SEED, deadlineAtMs,
            authorization: pendingAuthorization, [WAVE_FIELD]: token});
          await pausedChild.promise;
          // Deliberately return before the actual dependent response settles.
        });
        await pausedChild.promise;
        assert.notEqual(liveWaveToken, null,
          'the already admitted child is bound to an actual owner-issued wave');
        const operatorAuthorization = handler.participantReleaseAuthorizationOwner
          .authorizeOperator({partitionId: pendingPartition,
            targetBuildDigest: build.digest});
        const wrongKind = requestParticipantRelease(handler, {
          partitionId: pendingPartition, targetBuildDigest: build.digest,
          trigger: TRIGGER.OPERATOR, deadlineAtMs,
          authorization: operatorAuthorization, [WAVE_FIELD]: liveWaveToken});
        const forged = requestParticipantRelease(handler, {
          partitionId: pendingPartition, targetBuildDigest: build.digest,
          trigger: TRIGGER.FRESH_SEED, deadlineAtMs,
          authorization: pendingAuthorization,
          [WAVE_FIELD]: Object.freeze(Object.create(null))});
        // Both invalid deliveries reach the original registered RELEASE
        // handler while the first valid RUNS promise is still held at PAUSE.
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(earlyResumes, 0,
          'wave END must not RESUME current control while an admitted child is held');
        pausePermitOpen = true;
        allowChildPause.resolve();
        const [answer, waveAnswer, wrongKindAnswer, forgedAnswer] = await Promise.all([
          admittedChild, earlyReturnWave, wrongKind, forged]);
        assert.equal(wrongKindAnswer.outcome, OUTCOME.UNAVAILABLE,
          'an operator request must not join a held legitimate wave child RUNS');
        assert.equal(wrongKindAnswer.missingFact, MISSING_FACT.CURRENT_CONTROL_OWNER);
        assert.equal(forgedAnswer.outcome, OUTCOME.UNAVAILABLE,
          'a forged wave correlation must not join the same active child RUNS');
        assert.equal(forgedAnswer.missingFact, MISSING_FACT.CURRENT_CONTROL_OWNER);
        assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
        assert.equal(waveAnswer, undefined,
          'the wave owns the child lifetime but does not invent a completion result');
        assert.equal(participantReleaseAdmissionOf(controlLeader).state, ADMISSION.OPEN);
      } finally {
        pausePermitOpen = true;
        allowChildPause.resolve();
        transport.deliver = originalHeldDeliver;
        await Promise.allSettled([admittedChild, earlyReturnWave].filter(Boolean));
      }

      let capturedLateRefusal = null;
      let heldClosedAfterSchemaMutation = false;
      const endFailure = await handler.participantReleaseRecovery.withFreshSeedControlWave({
        targetBuildDigest: build.digest, deadlineAtMs,
        controlAuthorization, partitionIds: [DEPENDENTS[0].id],
      }, async (newWaveToken) => {
        // A real coordinator-enforcer change after BEGIN invalidates every
        // later CHECK and END. No earlier CLEAR observation may be reused.
        controlLeader.db.exec('DROP TRIGGER sql_transactions_initial_lineage_v1');
        capturedLateRefusal = await requestParticipantRelease(handler, {
          partitionId: DEPENDENTS[0].id, targetBuildDigest: build.digest,
          trigger: TRIGGER.FRESH_SEED, deadlineAtMs,
          authorization: dependentAuthorization, [WAVE_FIELD]: newWaveToken});
        heldClosedAfterSchemaMutation =
          participantReleaseAdmissionOf(controlLeader).state === ADMISSION.CLOSED;
      }).then(() => null, (error) => error);
      assert.equal(heldClosedAfterSchemaMutation, true,
        'a malformed control schema keeps its authoritative control recipient closed');
      assert.equal(capturedLateRefusal?.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(capturedLateRefusal.missingFact, MISSING_FACT.CURRENT_CONTROL_OWNER);
      assert.ok(endFailure instanceof Error,
        'the final control-wave membership/schema fence must refuse END');
      assert.match(endFailure.message, /Current control wave END census refused/u);
      const refusedRecovery = await release(CONTROL);
      assert.equal(refusedRecovery.outcome, OUTCOME.CENSUS_REFUSED,
        'divergent real member schema cannot be silently repaired as a new cutover');
      for (const service of control.services) {
        assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED,
          'every control voter remains CLOSED while the real cohort disagrees');
      }
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
