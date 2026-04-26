import {
  buildOwnerContractOutcome,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from './owner-contract-outcome.js';
import {
  CONTROL_PLANE_SNAPSHOT_REVISION_STATE,
  resolveControlPlaneSnapshotRevisionMetadata,
} from './control-plane-snapshot-revision.js';

const CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE = Object.freeze({
  FRESH: 'fresh',
  STALE_BUT_USABLE: 'stale_usable',
  DEFERRED_REFRESH: 'deferred_refresh',
  FAILED: 'failed',
});

const CONTROL_PLANE_SNAPSHOT_REFRESH_STATE = Object.freeze({
  IDLE: 'idle',
  SCHEDULED: 'scheduled',
  IN_FLIGHT: 'in_flight',
  DEFERRED: 'deferred',
  APPLIED: 'applied',
  FAILED: 'failed',
});

const CONTROL_PLANE_SNAPSHOT_REPAIR_REASON = Object.freeze({
  CONTROL_SNAPSHOT: 'control_snapshot',
  SERVICE_DISCOVERY: 'service_discovery_snapshot',
});

const CONTROL_PLANE_SNAPSHOT_REASON_CODE = Object.freeze({
  REVISION_BEHIND: 'snapshot_revision_behind',
});

function normalizeDistinctStringArray(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter((value) => value.length > 0),
  )].sort();
}

function normalizeRetryAfterMs(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }
  return Math.floor(parsedValue);
}

function buildSnapshotObservation(snapshot, options = {}) {
  const revisionMetadata = resolveControlPlaneSnapshotRevisionMetadata(
    snapshot,
    {
      expectedMinimumRevision: options.expectedMinimumRevision,
      expectedResumeToken: options.expectedResumeToken,
      stale:
        options.state === CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE
          .STALE_BUT_USABLE,
      deferred:
        options.state === CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE
          .DEFERRED_REFRESH,
    },
  );
  const reasonCodes = normalizeDistinctStringArray([
    ...(Array.isArray(options.reasonCodes) ? options.reasonCodes : []),
    ...(revisionMetadata.revisionState ===
      CONTROL_PLANE_SNAPSHOT_REVISION_STATE.BEHIND ?
      [CONTROL_PLANE_SNAPSHOT_REASON_CODE.REVISION_BEHIND] :
      []),
  ]);
  return Object.freeze({
    state: options.state,
    ...buildOwnerContractOutcome({
      contractState: options.contractState,
      nextAction: options.nextAction,
    }),
    reasonCodes,
    retryAfterMs: normalizeRetryAfterMs(options.retryAfterMs),
    refreshState: options.refreshState,
    revision: revisionMetadata.revision,
    revisionSource: revisionMetadata.revisionSource,
    revisionState: revisionMetadata.revisionState,
    expectedMinimumRevision: revisionMetadata.expectedMinimumRevision,
    revisionGap: revisionMetadata.revisionGap,
    observedAt: revisionMetadata.observedAt,
    observedAtMs: revisionMetadata.observedAtMs,
    resumeToken: revisionMetadata.resumeToken,
  });
}

function attachSnapshotObservation(snapshot, observation) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot;
  }
  snapshot.snapshotObservation = observation;
  snapshot.snapshotRevision = observation?.revision ?? null;
  snapshot.snapshotRevisionSource = observation?.revisionSource ?? null;
  snapshot.snapshotRevisionState = observation?.revisionState ?? null;
  snapshot.snapshotExpectedMinimumRevision =
    observation?.expectedMinimumRevision ?? null;
  snapshot.snapshotRevisionGap = observation?.revisionGap ?? null;
  snapshot.snapshotResumeToken = observation?.resumeToken ?? null;
  snapshot.snapshotObservedAt = observation?.observedAt ?? null;
  snapshot.snapshotObservedAtMs = observation?.observedAtMs ?? null;
  return snapshot;
}

function buildFreshSnapshotObservation(snapshot, reasonCodes = [], options = {}) {
  return buildSnapshotObservation(snapshot, {
    state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
    contractState: OWNER_CONTRACT_STATE.READY,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
    reasonCodes,
    retryAfterMs: null,
    refreshState:
      options.refreshState || CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
    expectedMinimumRevision: options.expectedMinimumRevision,
    expectedResumeToken: options.expectedResumeToken,
  });
}

function buildStaleSnapshotObservation(snapshot, reasonCodes = [], options = {}) {
  return buildSnapshotObservation(snapshot, {
    state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    reasonCodes,
    retryAfterMs: null,
    refreshState:
      options.refreshState || CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
    expectedMinimumRevision: options.expectedMinimumRevision,
    expectedResumeToken: options.expectedResumeToken,
  });
}

function buildDeferredSnapshotObservation(snapshot, reasonCodes = [], options = {}) {
  return buildSnapshotObservation(snapshot, {
    state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
    contractState: OWNER_CONTRACT_STATE.DEFERRED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    reasonCodes,
    retryAfterMs: options.retryAfterMs,
    refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
    expectedMinimumRevision: options.expectedMinimumRevision,
    expectedResumeToken: options.expectedResumeToken,
  });
}

function buildFailedSnapshotObservation(snapshot, reasonCodes = [], options = {}) {
  return buildSnapshotObservation(snapshot, {
    state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FAILED,
    contractState: OWNER_CONTRACT_STATE.FAILED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    reasonCodes,
    retryAfterMs: null,
    refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.FAILED,
    expectedMinimumRevision: options.expectedMinimumRevision,
    expectedResumeToken: options.expectedResumeToken,
  });
}

class ControlPlaneSnapshotOwner {
  constructor(deps = {}) {
    this.controlSnapshot = deps.controlSnapshot || null;
    this.serviceDiscovery = deps.serviceDiscovery || null;
    this.lastObservedSnapshotExpectation = Object.freeze({
      expectedMinimumRevision: null,
      expectedResumeToken: null,
    });
    this.lastObservedServiceDiscoveryExpectation = Object.freeze({
      expectedMinimumRevision: null,
      expectedResumeToken: null,
    });
  }

  buildExpectedRevisionOptions(options = {}, expectation = null) {
    const expectedMinimumRevision =
      Number.isFinite(options?.expectedMinimumRevision) ?
        Math.floor(options.expectedMinimumRevision) :
        expectation?.expectedMinimumRevision ?? null;
    const expectedResumeToken =
      typeof options?.expectedResumeToken === 'string' &&
        options.expectedResumeToken.length > 0 ?
        options.expectedResumeToken :
        expectation?.expectedResumeToken ?? null;
    return Object.freeze({
      ...options,
      expectedMinimumRevision,
      expectedResumeToken,
    });
  }

  recordObservedExpectation(snapshot, reason) {
    const observedExpectation = Object.freeze({
      expectedMinimumRevision:
        Number.isFinite(snapshot?.snapshotRevision) ?
          Math.floor(snapshot.snapshotRevision) :
          null,
      expectedResumeToken:
        typeof snapshot?.snapshotResumeToken === 'string' &&
          snapshot.snapshotResumeToken.length > 0 ?
          snapshot.snapshotResumeToken :
          null,
    });
    if (reason === CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY) {
      this.lastObservedServiceDiscoveryExpectation = observedExpectation;
      return;
    }
    this.lastObservedSnapshotExpectation = observedExpectation;
  }

  async resolveControlSnapshot(localSnapshot, options = {}) {
    const resolvedOptions = this.buildExpectedRevisionOptions(
      options,
      this.lastObservedSnapshotExpectation,
    );
    const repairEvaluation =
      typeof this.controlSnapshot?.evaluateAuthoritativeControlSnapshotRepair ===
        'function' ?
        this.controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
          localSnapshot,
        ) :
        null;
    const reasonCodes = normalizeDistinctStringArray(
      repairEvaluation?.triggerCodes,
    );
    if (resolvedOptions.forceAuthoritativeRepair === true) {
      const forcedSnapshot = await this.forceControlSnapshotRepair(
        resolvedOptions,
        repairEvaluation,
      );
      this.recordObservedExpectation(
        forcedSnapshot,
        CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.CONTROL_SNAPSHOT,
      );
      return forcedSnapshot;
    }
    if (repairEvaluation?.shouldRepair !== true) {
      const observedSnapshot = attachSnapshotObservation(
        localSnapshot,
        buildFreshSnapshotObservation(
          localSnapshot,
          reasonCodes,
          resolvedOptions,
        ),
      );
      this.recordObservedExpectation(
        observedSnapshot,
        CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.CONTROL_SNAPSHOT,
      );
      return observedSnapshot;
    }
    if (this.controlSnapshot?.canRunAuthoritativeControlSnapshotRepair?.() !==
      true ||
      resolvedOptions.allowAuthoritativeRepair !== true) {
      const observedSnapshot = attachSnapshotObservation(
        localSnapshot,
        buildStaleSnapshotObservation(
          localSnapshot,
          reasonCodes,
          resolvedOptions,
        ),
      );
      this.recordObservedExpectation(
        observedSnapshot,
        CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.CONTROL_SNAPSHOT,
      );
      return observedSnapshot;
    }
    const repairOptions = {
      reason: CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.CONTROL_SNAPSHOT,
      triggerCodes: reasonCodes,
    };
    const repairDecision = this.resolveRepairDecision(repairOptions);
    if (repairDecision.state === CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED) {
      this.serviceDiscovery?.scheduleAuthoritativeDiscoveryCacheRepair?.(
        repairOptions,
      );
    }
    const observedSnapshot = attachSnapshotObservation(
      localSnapshot,
      this.buildSnapshotObservationFromRepairDecision(
        localSnapshot,
        repairDecision,
        reasonCodes,
        resolvedOptions,
      ),
    );
    this.recordObservedExpectation(
      observedSnapshot,
      CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.CONTROL_SNAPSHOT,
    );
    return observedSnapshot;
  }

  async resolveServiceDiscoverySnapshot(localSnapshot, options = {}) {
    const resolvedOptions = this.buildExpectedRevisionOptions(
      options,
      this.lastObservedServiceDiscoveryExpectation,
    );
    const repairEvaluation =
      typeof this.serviceDiscovery?.evaluateAuthoritativeDiscoveryRepair ===
        'function' ?
        this.serviceDiscovery.evaluateAuthoritativeDiscoveryRepair(
          localSnapshot,
          resolvedOptions,
        ) :
        null;
    const reasonCodes = normalizeDistinctStringArray(
      repairEvaluation?.triggerCodes,
    );
    if (resolvedOptions.forceAuthoritativeRepair === true) {
      const forcedSnapshot = await this.forceServiceDiscoveryRepair(
        resolvedOptions,
        reasonCodes,
      );
      this.recordObservedExpectation(
        forcedSnapshot,
        CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY,
      );
      return forcedSnapshot;
    }
    if (repairEvaluation?.shouldRepair !== true) {
      const observedSnapshot = attachSnapshotObservation(
        localSnapshot,
        buildFreshSnapshotObservation(
          localSnapshot,
          reasonCodes,
          resolvedOptions,
        ),
      );
      this.recordObservedExpectation(
        observedSnapshot,
        CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY,
      );
      return observedSnapshot;
    }
    if (this.serviceDiscovery?.canReadAuthoritativeDiscoveryRows?.() !== true ||
      resolvedOptions.allowAuthoritativeRepair !== true) {
      const observedSnapshot = attachSnapshotObservation(
        localSnapshot,
        buildStaleSnapshotObservation(
          localSnapshot,
          reasonCodes,
          resolvedOptions,
        ),
      );
      this.recordObservedExpectation(
        observedSnapshot,
        CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY,
      );
      return observedSnapshot;
    }
    const repairOptions = {
      reason: CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY,
      tableName: resolvedOptions.tableName || null,
      tableId: resolvedOptions.tableId || null,
      triggerCodes: reasonCodes,
    };
    const repairDecision = this.resolveRepairDecision(repairOptions);
    if (repairDecision.state === CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED) {
      this.serviceDiscovery?.scheduleAuthoritativeDiscoveryCacheRepair?.(
        repairOptions,
      );
    }
    const observedSnapshot = attachSnapshotObservation(
      localSnapshot,
      this.buildSnapshotObservationFromRepairDecision(
        localSnapshot,
        repairDecision,
        reasonCodes,
        resolvedOptions,
      ),
    );
    this.recordObservedExpectation(
      observedSnapshot,
      CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY,
    );
    return observedSnapshot;
  }

  resolveRepairDecision(repairOptions = {}) {
    if (typeof this.serviceDiscovery?.buildAuthoritativeDiscoveryRepairScheduleDecision !==
      'function') {
      return {
        state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
        repair: null,
      };
    }
    const repairDecision =
      this.serviceDiscovery.buildAuthoritativeDiscoveryRepairScheduleDecision(
        repairOptions,
      );
    return repairDecision && typeof repairDecision === 'object' ?
      repairDecision :
      {
        state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
        repair: null,
      };
  }

  buildSnapshotObservationFromRepairDecision(
    snapshot = null,
    repairDecision = {},
    reasonCodes = [],
    options = {},
  ) {
    if (repairDecision.state === CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED) {
      return buildDeferredSnapshotObservation(snapshot, reasonCodes, {
        retryAfterMs: repairDecision?.repair?.retryAfterMs,
        expectedMinimumRevision: options.expectedMinimumRevision,
        expectedResumeToken: options.expectedResumeToken,
      });
    }
    if (repairDecision.state === CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IN_FLIGHT ||
      repairDecision.state === CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED) {
      return buildStaleSnapshotObservation(snapshot, reasonCodes, {
        refreshState: repairDecision.state,
        expectedMinimumRevision: options.expectedMinimumRevision,
        expectedResumeToken: options.expectedResumeToken,
      });
    }
    if (repairDecision.state === CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.FAILED) {
      return buildFailedSnapshotObservation(snapshot, reasonCodes, options);
    }
    return buildStaleSnapshotObservation(snapshot, reasonCodes, {
      refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
      expectedMinimumRevision: options.expectedMinimumRevision,
      expectedResumeToken: options.expectedResumeToken,
    });
  }

  async forceControlSnapshotRepair(options = {}, repairEvaluation = null) {
    const reasonCodes = normalizeDistinctStringArray(
      repairEvaluation?.triggerCodes,
    );
    if (typeof this.controlSnapshot?.forceAuthoritativeControlSnapshotRepair ===
      'function') {
      const repairedSnapshot =
        await this.controlSnapshot.forceAuthoritativeControlSnapshotRepair(
          options,
          repairEvaluation,
        );
      return attachSnapshotObservation(
        repairedSnapshot,
        buildFreshSnapshotObservation(repairedSnapshot, reasonCodes, {
          refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED,
          expectedMinimumRevision: options.expectedMinimumRevision,
          expectedResumeToken: options.expectedResumeToken,
        }),
      );
    }
    const repair =
      await this.serviceDiscovery?.ensureAuthoritativeDiscoveryCacheRepair?.({
        reason: CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.CONTROL_SNAPSHOT,
        bypassReuse: true,
        triggerCodes: reasonCodes,
      });
    const repairedSnapshot =
      await this.controlSnapshot.buildLocalControlSnapshot({
        ...options,
        preferAuthoritativePublicationRead: true,
        reconcileAuthoritativeMembershipPublication: true,
      });
    this.controlSnapshot?.attachAuthoritativeRepairDiagnostics?.(
      repairedSnapshot,
      {
        repair,
        repairEvaluation,
        forceAuthoritativeRepair: true,
      },
    );
    return attachSnapshotObservation(
      repairedSnapshot,
      buildFreshSnapshotObservation(repairedSnapshot, reasonCodes, {
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED,
        expectedMinimumRevision: options.expectedMinimumRevision,
        expectedResumeToken: options.expectedResumeToken,
      }),
    );
  }

  async forceServiceDiscoveryRepair(options = {}, reasonCodes = []) {
    const repair =
      await this.serviceDiscovery?.ensureAuthoritativeDiscoveryCacheRepair?.({
        reason: CONTROL_PLANE_SNAPSHOT_REPAIR_REASON.SERVICE_DISCOVERY,
        tableName: options.tableName || null,
        tableId: options.tableId || null,
        bypassReuse: true,
        triggerCodes: reasonCodes,
      });
    if (repair?.applied !== true) {
      throw new Error('Authoritative service discovery repair failed');
    }
    const repairedSnapshot =
      await this.serviceDiscovery.buildLocalServiceDiscoverySnapshot(options);
    return attachSnapshotObservation(
      repairedSnapshot,
      buildFreshSnapshotObservation(repairedSnapshot, reasonCodes, {
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED,
        expectedMinimumRevision: options.expectedMinimumRevision,
        expectedResumeToken: options.expectedResumeToken,
      }),
    );
  }
}

export {
  ControlPlaneSnapshotOwner,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
  CONTROL_PLANE_SNAPSHOT_REPAIR_REASON,
};
