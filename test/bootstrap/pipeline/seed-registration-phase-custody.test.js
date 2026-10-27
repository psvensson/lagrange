import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BOOTSTRAP_EVENT, BOOTSTRAP_PHASE} from
  '../../../src/bootstrap/bootstrap-constants.js';
import {createBootstrapServiceSeedWorkflowMethods} from
  '../../../src/bootstrap/bootstrap-service-seed-workflow.js';
import {createSeedStartupPlan} from
  '../../../src/bootstrap/pipeline/seed-startup-plan.js';
import {WORK_CLASS} from '../../../src/runtime/work-class-scheduler.js';

test('seed registration phase owns acquisition and release before metadata publication',
  async () => {
    const calls = [];
    const release = Promise.withResolvers();
    const releaseEntered = Promise.withResolvers();
    const phaseEntered = Promise.withResolvers();
    const phaseAdmitted = Promise.withResolvers();
    let subPhase = null;
    const host = {
      replicaStateMachine: null,
      phase: BOOTSTRAP_PHASE.PARTITIONS,
      executePhase: createBootstrapServiceSeedWorkflowMethods().executePhase,
      lifecycleStateMachine: {
        getSubPhase: () => subPhase,
        transitionSubPhase: (next) => {
          subPhase = next;
        },
        getState: () => 'BOOTSTRAPPING',
      },
      logger: {info() {}, error() {}},
      emit(event, detail) {
        if (event === BOOTSTRAP_EVENT.PHASE_START) {
          calls.push(`phase:${detail.phase}`);
        }
      },
      workClassScheduler: {
        async enqueue(workClass, run) {
          assert.equal(workClass, WORK_CLASS.A);
          phaseEntered.resolve();
          await phaseAdmitted.promise;
          return run();
        },
      },
      seedRuntimeBridgeOwner: {
        ensureBootstrapCdcIntegrationService() {
          calls.push('cdc');
        },
        acquireSqlQueryEngine() {
          calls.push('sql');
        },
      },
      initializeReplicaStateMachine() {
        calls.push('replica-state');
        this.replicaStateMachine = {};
      },
      acquireReplicaHandler() {
        calls.push('handler');
      },
      async releaseSeedParticipantCohorts() {
        calls.push('release');
        assert.equal(this.phase, BOOTSTRAP_PHASE.REGISTRATION);
        releaseEntered.resolve();
        await release.promise;
      },
      seedPhaseOwners: {
        async registration() {
          calls.push('registration');
        },
      },
    };
    const step = createSeedStartupPlan(host).phases
      .find((phase) => phase.name === BOOTSTRAP_PHASE.REGISTRATION);
    const attempt = step.run();
    const settlement = attempt.then(() => null, (error) => error);
    let assertionError = null;
    try {
      await Promise.race([phaseEntered.promise, settlement]);
      assert.deepEqual(calls, [`phase:${BOOTSTRAP_PHASE.REGISTRATION}`],
        'acquisition cannot run before the existing phase scheduler admits it');
      phaseAdmitted.resolve();
      await Promise.race([releaseEntered.promise, settlement]);
      const beforeRelease = [...calls];
      assert.deepEqual(beforeRelease, [
        `phase:${BOOTSTRAP_PHASE.REGISTRATION}`, 'cdc', 'replica-state',
        'sql', 'handler', 'release',
      ], 'the actual phase encloses every registration acquisition and release');
      release.resolve();
      await attempt;
      assert.deepEqual(calls, [...beforeRelease, 'registration'],
        'metadata publication follows successful release');
    } catch (error) {
      assertionError = error;
    } finally {
      phaseAdmitted.resolve();
      release.resolve();
    }
    const attemptError = await settlement;
    const errors = [...new Set([assertionError, attemptError].filter(Boolean))];
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'phase witness failed');
  });
