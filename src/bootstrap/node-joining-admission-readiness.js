import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {
  NodeJoiningReadySignalReadiness,
} from './node-joining-ready-signal-readiness.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
} from './bootstrap-api-constants.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
const {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_LOG_MSG,
  JOINING_SEED_CONTACT_FAILURE_KIND,
  JOINING_PHASE_TO_SUB_PHASE,
  JOIN_CHECKPOINT,
  JOIN_PLAN_SEGMENT,
  JOIN_SESSION_PHASE,
  JoiningEvent,
  JoiningPhase,
  NUM,
  NodeLifecycleStateMachine,
  NodeService,
  NodeState,
  RPCClient,
  StartupPipelineRunner,
  getControlPlaneErrorCode,
  TYPEOF,
  WORK_CLASS,
  activateSteadyStateRuntimeHandoff,
  assertCritical,
  assertJoinPlanSegments,
  createJoinStartupPlan,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  resolveMembershipJoinIntentType,
} = NODE_JOINING_SERVICE_SHARED;

const JOIN_WORKFLOW_PLAN_VERSION = 'join-startup-plan/v1';
const RETRYABLE_JOIN_RESUME_ACTION = Object.freeze({
  RESUME: 'resume',
  STOP: 'stop',
});
const RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE = Object.freeze({
  LIMITED: 'limited',
  ELAPSED_ONLY: 'elapsed_only',
});
const RETRYABLE_JOIN_RESUME_FAILURE_PROFILE = Object.freeze({
  DEFAULT: 'default_retryable_failure',
  CONTACTING_SEED_BOOTSTRAP_NOT_READY:
    'contacting_seed_bootstrap_not_ready',
});
const RETRYABLE_JOIN_RESUME_STOP_REASON = Object.freeze({
  POLICY_DISABLED: 'policy_disabled',
  ABORT: 'abort',
  NON_RETRYABLE: 'non_retryable',
  ATTEMPT_BUDGET_EXHAUSTED: 'attempt_budget_exhausted',
  ELAPSED_BUDGET_EXHAUSTED: 'elapsed_budget_exhausted',
});
const BOOTSTRAP_NOT_READY_LIMITED_RESUME_FAILURE_KINDS = Object.freeze([
  JOINING_SEED_CONTACT_FAILURE_KIND.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
  JOINING_SEED_CONTACT_FAILURE_KIND.REQUEST_EXECUTION_BUDGET_EXHAUSTED,
]);
const BOOTSTRAP_NOT_READY_LIMITED_RESUME_REASON_CODES = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
]);

function hasBootstrapResponseReason(error, reasonCodes) {
  const reasons = Array.isArray(error?.bootstrapResponse?.reasons) ?
    error.bootstrapResponse.reasons :
    [];
  return reasonCodes.some((reasonCode) => reasons.includes(reasonCode));
}

function isLimitedResumeBootstrapNotReadyFailure(error) {
  return BOOTSTRAP_NOT_READY_LIMITED_RESUME_FAILURE_KINDS.includes(
    error?.seedContactFailureKind,
  ) ||
    hasBootstrapResponseReason(
      error,
      BOOTSTRAP_NOT_READY_LIMITED_RESUME_REASON_CODES,
    );
}

function normalizeBootstrapResponseReasons(error) {
  if (!Array.isArray(error?.bootstrapResponse?.reasons)) {
    return [];
  }
  return error.bootstrapResponse.reasons.filter((reason) =>
    typeof reason === TYPEOF.STRING && reason.length > NUM.ZERO,
  );
}

function buildSeedContactFailureDiagnostics(error) {
  const bootstrapResponse = error?.bootstrapResponse || null;
  const diagnostics = {
    seedContactFailureKind:
      typeof error?.seedContactFailureKind === TYPEOF.STRING &&
      error.seedContactFailureKind.length > NUM.ZERO ?
        error.seedContactFailureKind :
        null,
    bootstrapResponseCode:
      typeof bootstrapResponse?.code === TYPEOF.STRING &&
      bootstrapResponse.code.length > NUM.ZERO ?
        bootstrapResponse.code :
        null,
    bootstrapResponsePhase:
      typeof bootstrapResponse?.phase === TYPEOF.STRING &&
      bootstrapResponse.phase.length > NUM.ZERO ?
        bootstrapResponse.phase :
        null,
    bootstrapResponseState:
      typeof bootstrapResponse?.state === TYPEOF.STRING &&
      bootstrapResponse.state.length > NUM.ZERO ?
        bootstrapResponse.state :
        null,
    bootstrapResponseReasons: normalizeBootstrapResponseReasons(error),
    bootstrapResponseRetryAfterMs:
      Number.isFinite(bootstrapResponse?.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(bootstrapResponse.retryAfterMs)) :
        null,
  };
  return diagnostics;
}

function resolveRetryableJoinMinimumMaxElapsedMs(options = {}) {
  const retryWindowMs = Number.isFinite(options.retryWindowMs) ?
    Math.max(NUM.ZERO, Math.floor(options.retryWindowMs)) :
    NUM.ZERO;
  const httpTimeoutMs = Number.isFinite(options.httpTimeoutMs) ?
    Math.max(NUM.ZERO, Math.floor(options.httpTimeoutMs)) :
    NUM.ZERO;
  const defaultMaxElapsedMs =
    JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs;
  const contactSeedWindowMs = retryWindowMs + httpTimeoutMs;
  const latePhaseWindowMs =
    retryWindowMs <= defaultMaxElapsedMs ?
      defaultMaxElapsedMs + retryWindowMs :
      contactSeedWindowMs;
  return Math.max(
    NUM.ZERO,
    contactSeedWindowMs,
    latePhaseWindowMs,
  );
}

class NodeJoiningAdmissionReadiness extends NodeJoiningReadySignalReadiness {
  _buildJoinRuntimeWiringDelegates() {
    const self = this;
    return {
      getSystemTableCache: () =>
        NodeService.getInstance().getSystemTableCache(),
      getMessageRouter: () => self.messageRouter,
      getRebalanceCoordinator: () => self.rebalanceCoordinator,
      getCdcIntegrationService: () => self.cdcIntegrationService,
    };
  }
  /**
   * When a preserved retryable resume skips the INFRASTRUCTURE checkpoint
   * (the infrastructure survived the failed attempt), the lifecycle
   * transitions that segment owns (CONNECTING→DISCOVERING→JOINING) are
   * skipped with it — leaving completeSuccessfulJoin's JOINING→READY
   * transition invalid. Catch the machine up before the MEMBERSHIP segment
   * runs. No-op on a fresh pass where the infrastructure segment ran.
   * Closure record CL-006.
   * @return {void}
   * @private
   */
  advanceLifecycleAfterResumedInfrastructure() {
    if (this.lifecycleStateMachine.getState() === NodeState.CONNECTING) {
      this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
    }
    if (this.lifecycleStateMachine.getState() === NodeState.DISCOVERING) {
      this.lifecycleStateMachine.transition(NodeState.JOINING);
    }
  }
  async runJoinInfrastructurePhases(startupPipelineRunner, joinPlan) {
    const infraPhases = joinPlan.segments[JOIN_PLAN_SEGMENT.INFRASTRUCTURE];
    await startupPipelineRunner.run({
      phases: infraPhases.slice(NUM.ZERO, NUM.ONE),
    });
    this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
    await startupPipelineRunner.run({phases: infraPhases.slice(NUM.ONE)});
    await this.initializeJoinInfrastructure();
    await this.notifyLocalAdminRuntimeReady();
    this.lifecycleStateMachine.transition(NodeState.JOINING);
    this._applyDeferredJoinSubPhases();
  }
  _applyDeferredJoinSubPhases() {
    for (const phaseName of this._completedJoinPhases) {
      const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
      if (subPhase) {
        this.lifecycleStateMachine.transitionSubPhase(subPhase);
      }
    }
    this._completedJoinPhases = [];
  }
  /**
   * Initialize join-owned infrastructure after message-group establishment.
   * @return {Promise<void>}
   * @private
   */
  async initializeJoinInfrastructure() {
    // Initialize ReplicaHandler BEFORE registering node in cluster
    // because node registration can trigger CREATE_REPLICA traffic.
    if (!this.rpcClient) {
      const leaderMessageGroup = assertCritical(
        this.getLeaderMessageGroupService(),
        JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
      );
      this.rpcClient = new RPCClient({
        messageGroupService: leaderMessageGroup,
      });
    }
    this.createCdcIntegrationService();
    this.ensureLatencyTopologyOwners();
    this.initializeReplicaHandler();
    this.initializeMessageGroupServiceHandler();
    await this.initializeControlPlaneService();
    this.initializeRuntimeServiceHandler();
    this.openExternalTransportAdmission();
  }
  /**
   * Open remote transport admission after join-owned runtime handlers exist.
   * Self-routing remains available earlier during bootstrap discovery.
   * @return {void}
   * @private
   */
  openExternalTransportAdmission() {
    if (
      this.messageRouter &&
      typeof this.messageRouter.setExternalAdmissionEnabled === TYPEOF.FUNCTION
    ) {
      this.messageRouter.setExternalAdmissionEnabled(true);
    }
  }
  /**
   * Notify one startup-owned hook that cache-backed local admin surfaces can
   * come online before full join publication completes.
   * @return {Promise<void>}
   * @private
   */
  async notifyLocalAdminRuntimeReady() {
    await this.runtimeSurfaceOwner.notifyLocalAdminRuntimeReady();
  }
  /**
   * Determine whether join-owned runtime infrastructure is already available
   * locally and can be reused for the current session.
   * @return {boolean}
   * @private
   */
  hasJoinInfrastructureReady() {
    return Boolean(
      this.bootstrapResponse &&
      this.messageRouter &&
      this.hasOperationalMessageGroup() &&
      this.rpcClient &&
      this.cdcIntegrationService &&
      this.heartbeatService,
    );
  }
  /**
   * Expose the join-local startup completion contract to BootstrapAPI.
   *
   * Join completion itself depends on signaling ready, so the local bootstrap
   * startup probe must switch to infrastructure readiness instead of waiting
   * for the final join phase.
   * @return {boolean}
   */
  isBootstrapStartupComplete() {
    return this.hasJoinInfrastructureReady();
  }
  /**
   * Complete successful join finalization and emit the completion event.
   * @return {void}
   * @private
   */
  completeSuccessfulJoin() {
    this.lifecycleStateMachine.transition(NodeState.READY);
    for (const messageGroupService of this.messageGroupServices.values()) {
      if (
        typeof messageGroupService?.completeJoinConvergence === TYPEOF.FUNCTION
      ) {
        messageGroupService.completeJoinConvergence();
      }
    }
    this.disableSteadyStateControlPlaneReporter();
    activateSteadyStateRuntimeHandoff({
      owner: this.runtimeHandoffOwner,
      activateControlPlaneBackgroundWriters: true,
      flushDeferredCreateSelfHostedMetadata: true,
      activateDistributedTransactionRecovery: true,
      startLatencyTopologyLifecycle: true,
    });
    this.phase = JoiningPhase.COMPLETE;
    const duration = this.now() - this.startTime;
    this.logger.info(JOINING_LOG_MSG.COMPLETED, {
      nodeId: this.nodeId,
      duration,
      messageGroupCount: this.messageGroupServices.size,
      lifecycleState: this.lifecycleStateMachine.getState(),
    });
    this.emit(JoiningEvent.COMPLETE, {
      nodeId: this.nodeId,
      duration,
      messageGroupServices: this.messageGroupServices,
      transport: this.transport,
      messageRouter: this.messageRouter,
      lifecycleState: this.lifecycleStateMachine.getState(),
    });
  }
  /**
   * Build checkpointed join steps for durable join progression.
   * @param {StartupPipelineRunner} startupPipelineRunner
   * @param {Object} joinPlan
   * @return {Array<Object>}
   * @private
   */
  buildJoinCheckpointSteps(startupPipelineRunner, joinPlan) {
    return [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: JOIN_SESSION_PHASE.SEED_CONTACTED,
        segment: JOIN_PLAN_SEGMENT.SEED_CONTACT,
        shouldRerun: () => {
          return (
            !this.bootstrapResponse ||
            !this.seedNodeId ||
            !this.seedNodeWsAddress
          );
        },
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.SEED_CONTACT],
          });
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: JOIN_SESSION_PHASE.INFRASTRUCTURE_READY,
        segment: JOIN_PLAN_SEGMENT.INFRASTRUCTURE,
        shouldRerun: () => !this.hasJoinInfrastructureReady(),
        run: async () => {
          await this.runJoinInfrastructurePhases(
            startupPipelineRunner,
            joinPlan,
          );
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: JOIN_SESSION_PHASE.MEMBERSHIP_WRITTEN,
        segment: JOIN_PLAN_SEGMENT.MEMBERSHIP,
        run: async () => {
          this.advanceLifecycleAfterResumedInfrastructure();
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.MEMBERSHIP],
          });
          await this.activateMessageGroupServiceRows();
          // The pre-arm opportunistic backfill is intentionally NOT started
          // here: it pulled the 12 non-blocking propagated tables BEFORE CDC
          // subscriptions are confirmed, so it sat inside the very
          // (snapshot, fan-out-targetability] window CL-014 must close and
          // could not be relied on for it. The post-arm fire-and-forget
          // catch-up (signalReadyForReplicas) re-reads the full propagated set
          // after the stream arms, subsuming it — removing ~12 redundant
          // distributed reads/joiner from the seed during formation with no
          // correctness loss (these tables are non-blocking by construction).
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
        phase: JOIN_SESSION_PHASE.READY_LEASE_ASSIGNED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.READINESS],
          });
          await this.signalReadyForReplicas();
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.FINALIZED,
        phase: JOIN_SESSION_PHASE.FINALIZED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        terminal: true,
        shouldRerun: () => {
          return (
            this.phase !== JoiningPhase.COMPLETE ||
            this.lifecycleStateMachine.getState() !== NodeState.READY ||
            this.hasActiveControlPlaneBackgroundWriters() !== true
          );
        },
        run: async () => {
          this.completeSuccessfulJoin();
        },
      },
    ];
  }
  /**
   * Execute the full joining process.
   * Requirements: 4.1, 4.6, 4.7, 8.1, 8.2, 8.3 - Bootstrap sequence with lifecycle states.
   * @return {Promise<Object>} Joining result.
   */
  async join() {
    this.startTime = this.now();
    const allowResumeLatest =
      this.joinSessionIdProvided !== true &&
      this.config.autoResumeRetryableFailures === true;
    const resumedSessionId = await this.joinSessionStore.resolveSessionId({
      nodeId: this.nodeId,
      allowResumeLatest,
    });
    if (typeof resumedSessionId === TYPEOF.STRING &&
        resumedSessionId.length > NUM.ZERO) {
      this.joinSessionId = resumedSessionId;
    }
    const membershipLifecycleIntent =
      await this.membershipLifecycleController.submitJoinIntent({
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        nodeAddress: this.nodeAddress,
        seedNodeAddress: this.seedNodeAddress,
        startupMode: this.startupMode,
        membershipOwnerOutcome: this.membershipOwnerOutcome,
      });
    const membershipLifecycleIntentType =
      membershipLifecycleIntent?.intentType ||
      resolveMembershipJoinIntentType(this.startupMode);
    this.logger.info(JOINING_LOG_MSG.STARTING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      seedNodeAddress: this.seedNodeAddress,
      lifecycleState: this.lifecycleStateMachine.getState(),
      joinSessionId: this.joinSessionId,
      membershipLifecycleIntentType,
    });
    const resumePolicy = this.resolveRetryableJoinResumePolicy();
    let attempt = NUM.ZERO;
    while (true) {
      attempt += NUM.ONE;
      this.resetLifecycleStateForRetryableResumeAttempt(attempt);
      try {
        if (this.lifecycleStateMachine.getState() !== NodeState.CONNECTING) {
          this.lifecycleStateMachine.transition(NodeState.CONNECTING);
        }
        const startupPipelineRunner = new StartupPipelineRunner({
          logger: this.logger,
          eventSink: this,
        });
        const joinPlan = createJoinStartupPlan(this);
        assertJoinPlanSegments(joinPlan);
        await this.joinCoordinator.run({
          nodeId: this.nodeId,
          sessionId: this.joinSessionId,
          allowResumeLatest,
          planVersion: JOIN_WORKFLOW_PLAN_VERSION,
          steps: this.buildJoinCheckpointSteps(startupPipelineRunner, joinPlan),
        });
        return {
          success: true,
          nodeId: this.nodeId,
          duration: this.now() - this.startTime,
          messageGroupServices: this.messageGroupServices,
          partitionServices: this.partitionServices,
          replicaHandler: this.replicaHandler,
          replicaStateMachine: this.replicaStateMachine,
          transport: this.transport,
          messageRouter: this.messageRouter,
          bootstrapResponse: this.bootstrapResponse,
          lifecycleStateMachine: this.lifecycleStateMachine,
        };
      } catch (error) {
        // CL-006: decide resume-vs-terminal BEFORE failure handling so a
        // retryable failure preserves the durable join progress (registered
        // rows, router, message groups) that the checkpointed re-entry
        // depends on. Destructive cleanup runs only on the terminal path.
        const resumeDecision = this.resolveRetryableJoinResumeDecision(
          error,
          null,
          attempt,
          resumePolicy,
        );
        const preserveForResume =
          resumeDecision.action === RETRYABLE_JOIN_RESUME_ACTION.RESUME;
        const failureResult = await this.handleJoiningFailure(error, {
          preserveForResume,
        });
        if (!preserveForResume) {
          return failureResult;
        }
        const delayMs = this.computeRetryableJoinResumeDelayMs(
          error,
          attempt,
          resumePolicy,
        );
        this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING, {
          nodeId: this.nodeId,
          joinSessionId: this.joinSessionId,
          attempt,
          maxAttempts: resumeDecision.maxAttempts,
          attemptBudgetMode: resumeDecision.attemptBudgetMode,
          failureProfile: resumeDecision.failureProfile,
          retryAfterMs: delayMs,
          phase: failureResult.phase,
          error: failureResult.error,
          ...buildSeedContactFailureDiagnostics(error),
        });
        await this.sleep(delayMs);
      }
    }
  }
  /**
   * Retryable join-resume attempts must re-enter lifecycle transitions from a
   * valid bootstrap root state. Failed-attempt cleanup intentionally drives
   * the previous lifecycle machine to STOPPED, which is terminal by contract.
   * Reset only when resuming in-process so a retry does not fail closed on an
   * invalid STOPPED -> CONNECTING transition.
   *
   * @param {number} attempt
   * @return {void}
   */
  resetLifecycleStateForRetryableResumeAttempt(attempt) {
    if (attempt <= NUM.ONE) {
      return;
    }
    if (
      !this.lifecycleStateMachine ||
      typeof this.lifecycleStateMachine.getState !== TYPEOF.FUNCTION
    ) {
      return;
    }
    const currentState = this.lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      return;
    }
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
      now: this.now,
    });
    this._completedJoinPhases = [];
    this.phase = JoiningPhase.NOT_STARTED;
    this.logger.info(JOINING_LOG_MSG.RETRYABLE_FAILURE_LIFECYCLE_RESET, {
      nodeId: this.nodeId,
      joinSessionId: this.joinSessionId,
      attempt,
      previousState: currentState,
      nextState: NodeState.STARTING,
    });
  }
  resolveRetryableJoinResumePolicy() {
    const joinRetryPolicy = this.resolveJoinRetryPolicy();
    const joinHttpTimeoutMs = Number.isFinite(this.config.httpTimeoutMs) ?
      Math.max(NUM.ZERO, Math.floor(this.config.httpTimeoutMs)) :
      JOINING_DEFAULT.httpTimeoutMs;
    const minimumMaxElapsedMs = resolveRetryableJoinMinimumMaxElapsedMs({
      retryWindowMs: joinRetryPolicy.retryTimeoutMs,
      httpTimeoutMs: joinHttpTimeoutMs,
    });
    return {
      enabled: this.config.autoResumeRetryableFailures === true,
      maxAttempts: Number.isFinite(
        this.config.retryableFailureResumeMaxAttempts,
      ) ?
        Math.max(
          NUM.ONE,
          Math.floor(this.config.retryableFailureResumeMaxAttempts),
        ) :
        JOINING_DEFAULT.retryableFailureResumeMaxAttempts,
      baseDelayMs: Number.isFinite(
        this.config.retryableFailureResumeBaseDelayMs,
      ) ?
        Math.max(
          NUM.ONE,
          Math.floor(this.config.retryableFailureResumeBaseDelayMs),
        ) :
        JOINING_DEFAULT.retryableFailureResumeBaseDelayMs,
      maxDelayMs: Number.isFinite(this.config.retryableFailureResumeMaxDelayMs) ?
        Math.max(
          NUM.ONE,
          Math.floor(this.config.retryableFailureResumeMaxDelayMs),
        ) :
        JOINING_DEFAULT.retryableFailureResumeMaxDelayMs,
      maxElapsedMs: Number.isFinite(
        this.config.retryableFailureResumeMaxElapsedMs,
      ) ?
        Math.max(
          minimumMaxElapsedMs,
          Math.floor(this.config.retryableFailureResumeMaxElapsedMs),
        ) :
        Math.max(
          JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs,
          minimumMaxElapsedMs,
        ),
    };
  }
  isRetryableJoinResumeBootstrapNotReadyFailure(error, failureResult) {
    if (isLimitedResumeBootstrapNotReadyFailure(error)) {
      return false;
    }
    if (
      error?.seedContactFailureKind ===
      JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY
    ) {
      return true;
    }
    const errorCode = getControlPlaneErrorCode(error);
    if (errorCode !== BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      return false;
    }
    const failureMessage =
      typeof failureResult?.error === TYPEOF.STRING ?
        failureResult.error :
        error?.message;
    const bootstrapNotReadyPrefix = JOINING_ERROR_MSG.bootstrapNotReady();
    return typeof failureMessage === TYPEOF.STRING &&
      failureMessage.startsWith(bootstrapNotReadyPrefix);
  }
  resolveRetryableJoinResumeFailureProfile(error, failureResult) {
    const phase = failureResult?.phase || this.getPhase();
    if (
      phase === JoiningPhase.CONTACTING_SEED &&
      this.isRetryableJoinResumeBootstrapNotReadyFailure(error, failureResult)
    ) {
      return RETRYABLE_JOIN_RESUME_FAILURE_PROFILE
        .CONTACTING_SEED_BOOTSTRAP_NOT_READY;
    }
    return RETRYABLE_JOIN_RESUME_FAILURE_PROFILE.DEFAULT;
  }
  resolveRetryableJoinResumeDecision(error, failureResult, attempt, policy) {
    const failureProfile = this.resolveRetryableJoinResumeFailureProfile(
      error,
      failureResult,
    );
    const attemptBudgetMode =
      failureProfile ===
      RETRYABLE_JOIN_RESUME_FAILURE_PROFILE
        .CONTACTING_SEED_BOOTSTRAP_NOT_READY ?
        RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY :
        RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED;
    const limitedAttemptBudget =
      attemptBudgetMode === RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED ?
        policy?.maxAttempts || null :
        null;
    const elapsedMs = this.now() - this.startTime;
    if (policy?.enabled !== true) {
      return {
        action: RETRYABLE_JOIN_RESUME_ACTION.STOP,
        attemptBudgetMode,
        failureProfile,
        maxAttempts: limitedAttemptBudget,
        stopReason: RETRYABLE_JOIN_RESUME_STOP_REASON.POLICY_DISABLED,
      };
    } else if (error?.name === JOINING_ERROR_NAME.ABORT) {
      return {
        action: RETRYABLE_JOIN_RESUME_ACTION.STOP,
        attemptBudgetMode,
        failureProfile,
        maxAttempts: limitedAttemptBudget,
        stopReason: RETRYABLE_JOIN_RESUME_STOP_REASON.ABORT,
      };
    } else if (isRetryableControlPlaneError(error) !== true) {
      return {
        action: RETRYABLE_JOIN_RESUME_ACTION.STOP,
        attemptBudgetMode,
        failureProfile,
        maxAttempts: limitedAttemptBudget,
        stopReason: RETRYABLE_JOIN_RESUME_STOP_REASON.NON_RETRYABLE,
      };
    } else if (elapsedMs >= policy.maxElapsedMs) {
      this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUME_EXHAUSTED, {
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        attempt,
        maxAttempts: limitedAttemptBudget,
        elapsedMs,
        maxElapsedMs: policy.maxElapsedMs,
        attemptBudgetMode,
        failureProfile,
        exhaustionReason:
          RETRYABLE_JOIN_RESUME_STOP_REASON.ELAPSED_BUDGET_EXHAUSTED,
        phase: failureResult?.phase || this.getPhase(),
        error: failureResult?.error || error?.message || null,
      });
      return {
        action: RETRYABLE_JOIN_RESUME_ACTION.STOP,
        attemptBudgetMode,
        failureProfile,
        maxAttempts: limitedAttemptBudget,
        stopReason:
          RETRYABLE_JOIN_RESUME_STOP_REASON.ELAPSED_BUDGET_EXHAUSTED,
      };
    } else if (
      attemptBudgetMode === RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED &&
      attempt >= policy.maxAttempts
    ) {
      this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUME_EXHAUSTED, {
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        attempt,
        maxAttempts: policy.maxAttempts,
        elapsedMs,
        maxElapsedMs: policy.maxElapsedMs,
        attemptBudgetMode,
        failureProfile,
        exhaustionReason:
          RETRYABLE_JOIN_RESUME_STOP_REASON.ATTEMPT_BUDGET_EXHAUSTED,
        phase: failureResult?.phase || this.getPhase(),
        error: failureResult?.error || error?.message || null,
      });
      return {
        action: RETRYABLE_JOIN_RESUME_ACTION.STOP,
        attemptBudgetMode,
        failureProfile,
        maxAttempts: limitedAttemptBudget,
        stopReason:
          RETRYABLE_JOIN_RESUME_STOP_REASON.ATTEMPT_BUDGET_EXHAUSTED,
      };
    } else {
      return {
        action: RETRYABLE_JOIN_RESUME_ACTION.RESUME,
        attemptBudgetMode,
        failureProfile,
        maxAttempts: limitedAttemptBudget,
        stopReason: null,
      };
    }
  }
  shouldAutoResumeRetryableJoinFailure(error, failureResult, attempt, policy) {
    const decision = this.resolveRetryableJoinResumeDecision(
      error,
      failureResult,
      attempt,
      policy,
    );
    return decision.action === RETRYABLE_JOIN_RESUME_ACTION.RESUME;
  }
  computeRetryableJoinResumeDelayMs(error, attempt, policy) {
    const hintedDelayMs = getControlPlaneRetryAfterMs(error);
    if (hintedDelayMs > NUM.ZERO) {
      return Math.min(policy.maxDelayMs, hintedDelayMs);
    }
    const exponentialDelayMs =
      policy.baseDelayMs * NUM.TWO ** Math.max(NUM.ZERO, attempt - NUM.ONE);
    return Math.min(policy.maxDelayMs, exponentialDelayMs);
  }
  /**
   * Execute a joining phase with logging and timing.
   * @param {string} phaseName - Phase name.
   * @param {Function} phaseFunction - Phase implementation function.
   * @return {Promise<void>}
   * @private
   */
  async executePhase(phaseName, phaseFunction) {
    const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
    if (subPhase) {
      if (this.lifecycleStateMachine.getState() === NodeState.JOINING) {
        const currentSubPhase = this.lifecycleStateMachine.getSubPhase();
        if (currentSubPhase !== subPhase) {
          this.lifecycleStateMachine.transitionSubPhase(subPhase);
        }
      } else {
        this._completedJoinPhases.push(phaseName);
      }
    }
    this.phase = phaseName;
    this.phaseStartTime = this.now();
    const state = this.lifecycleStateMachine.getState();
    const activeSubPhase = this.lifecycleStateMachine.getSubPhase() || null;
    this.logger.info(JOINING_LOG_MSG.PHASE_STARTING, {
      nodeId: this.nodeId,
      state,
      phase: phaseName,
      subPhase: activeSubPhase,
    });
    this.emit(JoiningEvent.PHASE_START, {
      phase: phaseName,
      nodeId: this.nodeId,
      state,
      subPhase: activeSubPhase,
    });
    try {
      await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
        await phaseFunction();
      });
      const phaseDuration = this.now() - this.phaseStartTime;
      this.logger.info(JOINING_LOG_MSG.PHASE_COMPLETED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
      this.emit(JoiningEvent.PHASE_COMPLETE, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = this.now() - this.phaseStartTime;
      this.logger.error(JOINING_LOG_MSG.PHASE_FAILED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
        joinReadiness: error?.joinReadiness || null,
        ...buildSeedContactFailureDiagnostics(error),
      });
      this.emit(JoiningEvent.PHASE_FAILED, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
      });
      throw error;
    }
  }
}

export {NodeJoiningAdmissionReadiness};
