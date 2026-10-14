import {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
} from './bootstrap-constants.js';
import {
  SEED_STARTUP_CHECKPOINT,
} from './seed-startup-session-store.js';
import {
  StartupPipelineRunner,
} from './pipeline/startup-pipeline-runner.js';
import {createSeedStartupPlan} from './pipeline/seed-startup-plan.js';
import {
  attachSqlRuntimeToStartupOwner,
  activateSteadyStateRuntimeHandoff,
} from './shared/startup-sql-runtime-handoff.js';
import {
  WORK_CLASS,
} from '../runtime/work-class-scheduler.js';
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {requestParticipantRelease} from '../node/participant-release-client.js';
import {observeParticipantReleaseClockValue,
  participantReleaseSeedBudgetObservation, readParticipantReleaseClock} from
  '../node/participant-release-diagnostic-observation.js';
import {PARTICIPANT_CUTOVER_BOUND, PARTICIPANT_CUTOVER_OUTCOME,
  PARTICIPANT_RELEASE_TRIGGER} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {BOOTSTRAP_SUB_PHASE} from '../node/node-constants.js';
import {NUM, TABLES} from '../constants/index.js';

const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapEvent = BOOTSTRAP_EVENT;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const TYPE_FUNCTION = 'function';
const TYPE_OBJECT = 'object';
const DEFERRED_START_IMMEDIATE = 'immediate';
const DEFERRED_START_TIMEOUT = 'timeout';
const SEED_WORKFLOW_PLAN_VERSION = 'seed-startup-plan/v1';
const SEED_WORKFLOW_PHASE = Object.freeze({
  CONTROL_PLANE_READY: 'seed_workflow:control_plane_ready',
  RUNTIME_READY: 'seed_workflow:runtime_ready',
  FINALIZED: 'seed_workflow:finalized',
});
const SEED_STARTUP_CHECKPOINT_SNAPSHOT_FIELD = Object.freeze({
  [SEED_STARTUP_CHECKPOINT.SESSION_CREATED]: 'sessionCreated',
  [SEED_STARTUP_CHECKPOINT.INFRASTRUCTURE_READY]: 'infrastructureReady',
  [SEED_STARTUP_CHECKPOINT.MESSAGE_GROUPS_READY]: 'messageGroupsReady',
  [SEED_STARTUP_CHECKPOINT.PARTITIONS_READY]: 'partitionsReady',
  [SEED_STARTUP_CHECKPOINT.REGISTRATION_READY]: 'registrationReady',
  [SEED_STARTUP_CHECKPOINT.CACHE_HYDRATED]: 'cacheHydrated',
  [SEED_STARTUP_CHECKPOINT.CONTROL_PLANE_READY]: 'controlPlaneReady',
  [SEED_STARTUP_CHECKPOINT.RUNTIME_READY]: 'runtimeReady',
  [SEED_STARTUP_CHECKPOINT.FINALIZED]: 'finalized',
});
const PHASE_TO_SUB_PHASE = Object.freeze({
  [BootstrapPhase.INFRASTRUCTURE]:
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
  [BootstrapPhase.MESSAGE_GROUPS]:
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
  [BootstrapPhase.PARTITIONS]:
    BOOTSTRAP_SUB_PHASE.PARTITIONS,
  [BootstrapPhase.REGISTRATION]:
    BOOTSTRAP_SUB_PHASE.REGISTRATION,
  [BootstrapPhase.CACHE_HYDRATION]:
    BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
});
const POST_PIPELINE_LOG = Object.freeze({
  START: 'metrics.bootstrap.post_pipeline.start',
  REPLICA_HANDLER: 'metrics.bootstrap.post_pipeline.replica_handler',
  MESSAGE_GROUP_HANDLER:
    'metrics.bootstrap.post_pipeline.message_group_handler',
  CONTROL_PLANE: 'metrics.bootstrap.post_pipeline.control_plane',
  SEED_REGISTRATION: 'metrics.bootstrap.post_pipeline.seed_registration',
  RUNTIME_HANDLER: 'metrics.bootstrap.post_pipeline.runtime_handler',
  LATENCY_TOPOLOGY: 'metrics.bootstrap.post_pipeline.latency_topology',
});
const PHASE_EVENT = Object.freeze({
  START: 'phase:start',
  COMPLETE: 'phase:complete',
  FAILED: 'phase:failed',
});
const DEFERRED_LATENCY_TOPOLOGY_FAILURE =
  'Deferred latency topology lifecycle start failed';
const EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION = null;

// One seed-workflow scheduling bound, never a release/Raft execution driver.
// Independent partition cohorts have distinct Raft owners and SQLite stores;
// their nested control RELEASEs join the one canonical control RUNS owner.
const SEED_INDEPENDENT_COHORT_WIDTH = 2;

async function attemptSeedCohortRelease(owner, service, buildDigest, deadline, timeSource) {
  const authorization = owner.replicaHandler
    .participantReleaseAuthorizationOwner.authorizeFreshSeed({
      partitionId: service.partitionId,
      targetBuildDigest: buildDigest,
      membershipOwnerOutcome: owner.membershipOwnerOutcome,
    });
  if (authorization === null) {
    throw new Error('Seed participant release authority unavailable');
  }
  let answer = null;
  let attemptCount = 0;
  let firstBlockedDrain = EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION;
  let firstJoinedAttempt = EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION;
  do {
    attemptCount += 1;
    answer = await requestParticipantRelease(owner.replicaHandler, {
      partitionId: service.partitionId, targetBuildDigest: buildDigest,
      trigger: PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED,
      deadlineAtMs: deadline, authorization,
    });
    firstBlockedDrain = retainFirstReleaseObservation(
      firstBlockedDrain, answer.blockedDrain);
    firstJoinedAttempt = retainFirstReleaseObservation(
      firstJoinedAttempt, answer.joinedAttempt);
    if (answer.outcome === PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) break;
    const retryAfterMs = answer.outcome === PARTICIPANT_CUTOVER_OUTCOME.NOT_LEADER ?
      PARTICIPANT_CUTOVER_BOUND.PAUSE_RETRY_AFTER_MS : answer.retryAfterMs;
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0 ||
        timeSource.now() + retryAfterMs > deadline) break;
    await owner.sleep(Math.min(retryAfterMs,
      Math.max(0, deadline - timeSource.now())));
  } while (timeSource.now() <= deadline);
  return {answer, attemptCount, firstBlockedDrain, firstJoinedAttempt};
}

// The first selected failure is deterministic by admission order. No failed
// wave can launch another wave; already-started release attempts are joined
// before propagating a refusal. Their canonical handler owns actual cleanup.
async function releaseSeedCohortWave(owner, cohorts, offset, context) {
  const results = await Promise.allSettled(cohorts.map((service) =>
    attemptSeedCohortRelease(owner, service, context.buildDigest,
      context.deadline, context.timeSource)));
  for (let index = 0; index < results.length; index += 1) {
    const settled = results[index];
    if (settled.status === 'rejected') throw settled.reason;
    const {answer, attemptCount, firstBlockedDrain, firstJoinedAttempt} =
      settled.value;
    if (answer?.outcome === PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) continue;
    const completed = offset + index;
    const terminalObservation = readParticipantReleaseClock(context.timeSource);
    const seedRelease = seedReleaseFailureProjection({
      startObservation: context.startObservation,
      terminalObservation, budgetMs: context.budgetMs,
      ordinal: completed + 1, total: context.total, completed, attemptCount,
      firstBlockedDrain, firstJoinedAttempt,
    });
    throw new Error('Seed participant release failed: ' +
      JSON.stringify({partitionId: cohorts[index].partitionId, answer, seedRelease}));
  }
}


function retainFirstReleaseObservation(current, value) {
  return current === null && value !== undefined ? value : current;
}

function seedReleaseFailureProjection({startObservation, terminalObservation,
  budgetMs, ordinal, total, completed, attemptCount, firstBlockedDrain,
  firstJoinedAttempt}) {
  return {
    ...participantReleaseSeedBudgetObservation(
      startObservation, terminalObservation, budgetMs),
    ordinal,
    total,
    completed,
    attemptCount,
    firstBlockedDrain,
    firstJoinedAttempt,
  };
}

function createBootstrapServiceSeedWorkflowMethods() {
  return {
    buildSeedStartupCheckpointSnapshot() {
      const messageRouterReady = Boolean(this.messageRouter);
      const systemTableCache = this.peekSystemTableCache();
      const localServiceEndpointsPublished =
        systemTableCache !== null &&
        this.hasPublishedLocalServiceEndpoints() === true;
      const controlPlaneBackgroundWritersActive =
        this.hasActiveControlPlaneBackgroundWriters() === true;
      return Object.freeze({
        sessionCreated: true,
        phase: this.phase,
        messageRouterReady,
        infrastructureReady: messageRouterReady,
        messageGroupsReady:
          this.messageGroupServices.size > 0,
        partitionsReady:
          this.partitionServices.size > 0,
        registrationReady: Boolean(
          this.cdcIntegrationService !== null &&
          this.replicaStateMachine,
        ),
        cacheHydrated:
          systemTableCache !== null && this.systemCacheHydrated === true,
        replicaHandlerReady: Boolean(this.replicaHandler),
        messageGroupServiceHandlerReady:
          Boolean(this.messageGroupServiceHandler),
        heartbeatServiceReady: Boolean(this.heartbeatService),
        localAdminRuntimeReadyNotified:
          this.localAdminRuntimeReadyNotified === true,
        localServiceEndpointsPublished,
        controlPlaneReady: Boolean(
          this.replicaHandler &&
          this.messageGroupServiceHandler &&
          this.heartbeatService &&
          this.localAdminRuntimeReadyNotified === true &&
          localServiceEndpointsPublished,
        ),
        runtimeServiceHandlerReady:
          Boolean(this.runtimeServiceHandler),
        externalTransportAdmissionOpen:
          isExternalAdmissionOpen(this.messageRouter),
        runtimeReady: Boolean(
          this.runtimeServiceHandler &&
          isExternalAdmissionOpen(this.messageRouter),
        ),
        bootstrapComplete: this.phase === BootstrapPhase.COMPLETE,
        controlPlaneBackgroundWritersActive,
        finalized: Boolean(
          this.phase === BootstrapPhase.COMPLETE &&
          controlPlaneBackgroundWritersActive,
        ),
      });
    },
    isSeedCheckpointSatisfied(checkpoint, checkpointSnapshot = null) {
      const snapshot = checkpointSnapshot &&
        typeof checkpointSnapshot === TYPE_OBJECT ?
        checkpointSnapshot :
        this.buildSeedStartupCheckpointSnapshot();
      const checkpointField =
        SEED_STARTUP_CHECKPOINT_SNAPSHOT_FIELD[checkpoint] || null;
      return checkpointField !== null &&
        snapshot[checkpointField] === true;
    },
    hasSeedControlPlaneReady() {
      return this.isSeedCheckpointSatisfied(
        SEED_STARTUP_CHECKPOINT.CONTROL_PLANE_READY,
      );
    },
    hasSeedRuntimeReady() {
      return this.isSeedCheckpointSatisfied(
        SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
      );
    },
    startLatencyTopologyLifecycle() {
      if (this.deferredLatencyTopologyStartHandle) {
        return;
      }
      const topologyStartMs = Date.now();
      const startTopologyAsync = () => {
        this.deferredLatencyTopologyStartHandle = null;
        this.deferredLatencyTopologyStartKind = null;
        if (this.isShuttingDown === true) {
          return;
        }
        try {
          this.seedRuntimeBridgeOwner.startLatencyTopologyLifecycle();
          this.logger.info(POST_PIPELINE_LOG.LATENCY_TOPOLOGY, {
            nodeId: this.nodeId,
            durationMs: Date.now() - topologyStartMs,
            deferred: true,
          });
        } catch (error) {
          this.logger.warn(DEFERRED_LATENCY_TOPOLOGY_FAILURE, {
            nodeId: this.nodeId,
            error: error.message,
          });
        }
      };
      if (typeof setImmediate === TYPE_FUNCTION) {
        this.deferredLatencyTopologyStartKind = DEFERRED_START_IMMEDIATE;
        this.deferredLatencyTopologyStartHandle = setImmediate(startTopologyAsync);
        return;
      }
      this.deferredLatencyTopologyStartKind = DEFERRED_START_TIMEOUT;
      this.deferredLatencyTopologyStartHandle =
        setTimeout(startTopologyAsync, 0);
    },
    completeSuccessfulBootstrap() {
      const duration = Date.now() - this.startTime;
      const alreadyComplete = this.phase === BootstrapPhase.COMPLETE;

      if (!alreadyComplete) {
        const currentState = this.lifecycleStateMachine.getState();
        if (currentState !== NodeState.CONNECTING) {
          this.lifecycleStateMachine.transition(NodeState.CONNECTING);
        }
        this.phase = BootstrapPhase.COMPLETE;
        this.clearNodeReadyRebalanceState();
        const sqlQueryEngine =
          this.seedRuntimeBridgeOwner.acquireSqlQueryEngine();
        attachSqlRuntimeToStartupOwner({
          owner: this,
          sqlQueryEngine,
          systemTableCache: this.getSystemTableCache(),
          cacheMutationTarget: this.getSystemTableCache(),
          messageRouter: this.messageRouter,
          partitionServicesProvider: () => this.partitionServices,
        });
        activateSteadyStateRuntimeHandoff({
          owner: this.runtimeHandoffOwner,
          activateControlPlaneBackgroundWriters: true,
          startLatencyTopologyLifecycle: true,
        });

        this.logger.info(BootstrapLog.COMPLETED, {
          nodeId: this.nodeId,
          duration,
          servicesCreated: this.servicesCreated,
          partitionsCreated: this.partitionsCreated,
          messageGroupsCreated: this.messageGroupsCreated,
        });

        this.emit(BootstrapEvent.COMPLETE, {
          nodeId: this.nodeId,
          duration,
          servicesCreated: this.servicesCreated,
          partitionsCreated: this.partitionsCreated,
          messageGroupsCreated: this.messageGroupsCreated,
        });
      }

      return {
        success: true,
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        messageGroupServices: this.messageGroupServices,
        partitionServices: this.partitionServices,
        replicaHandler: this.replicaHandler,
        replicaStateMachine: this.replicaStateMachine,
        epochManager: this.epochManager,
        transport: this.transport,
        messageRouter: this.messageRouter,
      };
    },
    async releaseSeedParticipantCohorts() {
      const build = await runtimeBuildProvenance();
      if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
        throw new Error(`Seed participant release build unavailable: ${build.reason}`);
      }
      const services = [...this.partitionServices.values()].sort((left, right) => {
        const leftControl = left.tableName === TABLES.SQL_TRANSACTIONS ? 0 : 1;
        const rightControl = right.tableName === TABLES.SQL_TRANSACTIONS ? 0 : 1;
        return leftControl - rightControl || left.partitionId.localeCompare(right.partitionId);
      });
      // The registry has one entry per local REPLICA. Release authority,
      // however, is owned by one PARTITION cohort and its full current
      // membership. A second local replica must not restart the same entire
      // pause/enable/observe/control/resume protocol under this shared budget.
      // This Set tracks only which intents the seed issues, never OPEN or
      // other consensus/authorization facts. Their owner still checks every
      // current member and both control fences on each actual release.
      const selectedPartitionIds = new Set();
      const cohorts = services.filter((service) => {
        if (selectedPartitionIds.has(service.partitionId)) return false;
        selectedPartitionIds.add(service.partitionId);
        return true;
      });
      const timeSource = this.nodeService.getTimeSource();
      const budgetMs = this.config.leadershipWaitTimeoutMs;
      const startMs = timeSource.now();
      const startObservation = observeParticipantReleaseClockValue(startMs);
      const deadline = startMs + budgetMs;
      const context = {buildDigest: build.digest, deadline, timeSource,
        startObservation, budgetMs, total: cohorts.length};
      // The current control table must be fully cut over before any dependent
      // group starts. Later control pre/post checks remain the cutover owner's
      // original fresh, complete RELEASE; concurrent requests join RUNS.
      let next = 0;
      if (cohorts[0]?.tableName === TABLES.SQL_TRANSACTIONS) {
        await releaseSeedCohortWave(this, [cohorts[0]], 0, context);
        next = 1;
      }
      // Admit independent partition cohorts in their original sorted order.
      // The fixed-width wave joins every in-flight attempt before a new wave,
      // so no failure can be stranded or followed by unobserved new work.
      while (next < cohorts.length) {
        const wave = cohorts.slice(next, next + SEED_INDEPENDENT_COHORT_WIDTH);
        await releaseSeedCohortWave(this, wave, next, context);
        next += wave.length;
      }
    },
    buildSeedCheckpointSteps(startupPipelineRunner, seedPlan) {
      const phases = Array.isArray(seedPlan?.phases) ? seedPlan.phases : [];
      const resolveCheckpointSnapshot = () =>
        this.buildSeedStartupCheckpointSnapshot();
      return [
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.INFRASTRUCTURE_READY,
          phase: BootstrapPhase.INFRASTRUCTURE,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.INFRASTRUCTURE_READY,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            await startupPipelineRunner.run({
              phases: phases.slice(0, 1),
            });
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.MESSAGE_GROUPS_READY,
          phase: BootstrapPhase.MESSAGE_GROUPS,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.MESSAGE_GROUPS_READY,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            await startupPipelineRunner.run({
              phases: phases.slice(1, 2),
            });
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.PARTITIONS_READY,
          phase: BootstrapPhase.PARTITIONS,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.PARTITIONS_READY,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            await startupPipelineRunner.run({
              phases: phases.slice(2, NUM.THREE),
            });
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.REGISTRATION_READY,
          phase: BootstrapPhase.REGISTRATION,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.REGISTRATION_READY,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            if (!this.replicaStateMachine) {
              this.seedRuntimeBridgeOwner
                .ensureBootstrapCdcIntegrationService();
              this.initializeReplicaStateMachine();
            }
            this.seedRuntimeBridgeOwner.acquireSqlQueryEngine();
            this.acquireReplicaHandler();
            await this.releaseSeedParticipantCohorts();
            await startupPipelineRunner.run({
              phases: phases.slice(NUM.THREE, NUM.FOUR),
            });
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.CACHE_HYDRATED,
          phase: BootstrapPhase.CACHE_HYDRATION,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.CACHE_HYDRATED,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            await startupPipelineRunner.run({
              phases: phases.slice(NUM.FOUR),
            });
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.CONTROL_PLANE_READY,
          phase: SEED_WORKFLOW_PHASE.CONTROL_PLANE_READY,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.CONTROL_PLANE_READY,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            this.logger.info(POST_PIPELINE_LOG.START, {
              nodeId: this.nodeId,
            });

            const replicaHandlerStartMs = Date.now();
            this.initializeReplicaHandler();
            this.logger.info(POST_PIPELINE_LOG.REPLICA_HANDLER, {
              nodeId: this.nodeId,
              durationMs: Date.now() - replicaHandlerStartMs,
            });

            const messageGroupHandlerStartMs = Date.now();
            this.initializeMessageGroupServiceHandler();
            this.logger.info(
              POST_PIPELINE_LOG.MESSAGE_GROUP_HANDLER,
              {
                nodeId: this.nodeId,
                durationMs: Date.now() - messageGroupHandlerStartMs,
              },
            );

            const controlPlaneStartMs = Date.now();
            await this.initializeControlPlaneService();
            this.logger.info(POST_PIPELINE_LOG.CONTROL_PLANE, {
              nodeId: this.nodeId,
              durationMs: Date.now() - controlPlaneStartMs,
            });
            await this.notifyLocalAdminRuntimeReady();

            const registerSeedStartMs = Date.now();
            await this.registerSeedNodeWithControlPlane();
            this.logger.info(POST_PIPELINE_LOG.SEED_REGISTRATION, {
              nodeId: this.nodeId,
              durationMs: Date.now() - registerSeedStartMs,
            });
            await this.activateMessageGroupServiceRows();
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
          phase: SEED_WORKFLOW_PHASE.RUNTIME_READY,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            const runtimeHandlerStartMs = Date.now();
            this.initializeRuntimeServiceHandler();
            this.logger.info(POST_PIPELINE_LOG.RUNTIME_HANDLER, {
              nodeId: this.nodeId,
              durationMs: Date.now() - runtimeHandlerStartMs,
            });
            this.openExternalTransportAdmission();
          },
        },
        {
          checkpoint: SEED_STARTUP_CHECKPOINT.FINALIZED,
          phase: SEED_WORKFLOW_PHASE.FINALIZED,
          terminal: true,
          shouldRerun: () => !this.isSeedCheckpointSatisfied(
            SEED_STARTUP_CHECKPOINT.FINALIZED,
            resolveCheckpointSnapshot(),
          ),
          run: async () => {
            this.completeSuccessfulBootstrap();
          },
        },
      ];
    },
    async bootstrap() {
      this.startTime = Date.now();

      this.logger.info(BootstrapLog.STARTING, {
        nodeId: this.nodeId,
        phase: BootstrapPhase.NOT_STARTED,
      });

      try {
        const startupPipelineRunner = new StartupPipelineRunner({
          logger: this.logger,
          eventSink: this,
        });
        const seedPlan = createSeedStartupPlan(this);
        const seedSessionId = await this.seedStartupSessionStore.resolveSessionId({
          nodeId: this.nodeId,
          allowResumeLatest: true,
        });
        await startupPipelineRunner.runWorkflow({
          nodeId: this.nodeId,
          sessionId: seedSessionId,
          allowResumeLatest: true,
          planVersion: SEED_WORKFLOW_PLAN_VERSION,
          sessionStore: this.seedStartupSessionStore,
          steps: this.buildSeedCheckpointSteps(
            startupPipelineRunner,
            seedPlan,
          ),
          isRetryableFailure: () => false,
        });
        return this.completeSuccessfulBootstrap();
      } catch (error) {
        return this.handleBootstrapFailure(error);
      }
    },
    async executePhase(phaseName, phaseFunction) {
      const subPhase = PHASE_TO_SUB_PHASE[phaseName];
      if (subPhase) {
        const currentSubPhase =
          this.lifecycleStateMachine.getSubPhase();
        if (currentSubPhase !== subPhase) {
          this.lifecycleStateMachine.transitionSubPhase(subPhase);
        }
      }
      this.phase = phaseName;
      this.phaseStartTime = Date.now();

      const state = this.lifecycleStateMachine.getState();
      const activeSubPhase =
        this.lifecycleStateMachine.getSubPhase() || null;

      this.logger.info(BootstrapLog.PHASE_STARTING, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        servicesCreated: this.servicesCreated,
      });

      this.emit(BootstrapEvent.PHASE_START, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
      });
      this.emit(PHASE_EVENT.START, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
      });

      try {
        await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
          await phaseFunction();
        });

        const phaseDuration = Date.now() - this.phaseStartTime;

        this.logger.info(BootstrapLog.PHASE_COMPLETED, {
          nodeId: this.nodeId,
          state,
          phase: phaseName,
          subPhase: activeSubPhase,
          duration: phaseDuration,
          servicesCreated: this.servicesCreated,
        });

        this.emit(BootstrapEvent.PHASE_COMPLETE, {
          phase: phaseName,
          nodeId: this.nodeId,
          state,
          subPhase: activeSubPhase,
          duration: phaseDuration,
        });
        this.emit(PHASE_EVENT.COMPLETE, {
          phase: phaseName,
          nodeId: this.nodeId,
          state,
          subPhase: activeSubPhase,
          duration: phaseDuration,
        });
      } catch (error) {
        const phaseDuration = Date.now() - this.phaseStartTime;

        this.logger.error(BootstrapLog.PHASE_FAILED, {
          nodeId: this.nodeId,
          state,
          phase: phaseName,
          subPhase: activeSubPhase,
          duration: phaseDuration,
          error: error.message,
          stack: error.stack,
        });

        this.emit(BootstrapEvent.PHASE_FAILED, {
          phase: phaseName,
          nodeId: this.nodeId,
          state,
          subPhase: activeSubPhase,
          duration: phaseDuration,
          error: error.message,
        });
        this.emit(PHASE_EVENT.FAILED, {
          phase: phaseName,
          nodeId: this.nodeId,
          state,
          subPhase: activeSubPhase,
          duration: phaseDuration,
          error: error.message,
        });

        throw error;
      }
    },
  };
}

function isExternalAdmissionOpen(messageRouter) {
  return typeof messageRouter?.isExternalAdmissionEnabled === TYPE_FUNCTION &&
    messageRouter.isExternalAdmissionEnabled() === true;
}

export {createBootstrapServiceSeedWorkflowMethods};
