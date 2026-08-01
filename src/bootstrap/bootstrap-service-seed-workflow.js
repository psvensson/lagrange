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
  activateSteadyStateRuntimeHandoff,
} from './shared/startup-sql-runtime-handoff.js';
import {
  WORK_CLASS,
} from '../runtime/work-class-scheduler.js';
import {
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {BOOTSTRAP_SUB_PHASE} from '../node/node-constants.js';
import {NUM} from '../constants/index.js';

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
        registrationReady: this.cdcIntegrationService !== null,
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
