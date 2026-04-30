import {
  NUM,
  TYPEOF,
} from '../constants/index.js';

const LOCAL_NUM_THREE = 3;

const CONTROL_PLANE_SNAPSHOT_REVISION_STATE = Object.freeze({
  CURRENT: 'current',
  STALE_USABLE: 'stale_usable',
  BEHIND: 'behind',
  UNAVAILABLE: 'unavailable',
});

const CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE = Object.freeze({
  SNAPSHOT_REVISION: 'snapshot_revision',
  SNAPSHOT_VERSION: 'snapshot_version',
  TOPOLOGY_EPOCH: 'topology_epoch',
  CAPTURED_AT: 'captured_at',
  OBSERVED_AT: 'observed_at',
  NONE: 'none',
});

const CONTROL_PLANE_SNAPSHOT_RESUME_TOKEN_LITERAL = Object.freeze({
  PREFIX: 'control-plane-revision',
  SEPARATOR: ':',
});

function normalizeNonNegativeInteger(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < NUM.ZERO) {
    return null;
  }
  return Math.floor(normalized);
}

function normalizeObservedAtMs(value) {
  const numericValue = normalizeNonNegativeInteger(value);
  if (numericValue !== null) {
    return numericValue;
  }
  if (typeof value !== TYPEOF.STRING || value.length === NUM.ZERO) {
    return null;
  }
  const parsedValue = Date.parse(value);
  return Number.isFinite(parsedValue) ?
    Math.max(NUM.ZERO, Math.floor(parsedValue)) :
    null;
}

function normalizeObservedAt(observedAtMs, fallbackValue = null) {
  if (Number.isFinite(observedAtMs)) {
    return new Date(observedAtMs).toISOString();
  }
  if (typeof fallbackValue === TYPEOF.STRING && fallbackValue.length > NUM.ZERO) {
    return fallbackValue;
  }
  return null;
}

function buildControlPlaneSnapshotResumeToken(revision, source) {
  const normalizedRevision = normalizeNonNegativeInteger(revision);
  if (normalizedRevision === null) {
    return null;
  }
  const normalizedSource =
    typeof source === TYPEOF.STRING && source.length > NUM.ZERO ?
      source :
      CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.NONE;
  return [
    CONTROL_PLANE_SNAPSHOT_RESUME_TOKEN_LITERAL.PREFIX,
    normalizedSource,
    normalizedRevision,
  ].join(CONTROL_PLANE_SNAPSHOT_RESUME_TOKEN_LITERAL.SEPARATOR);
}

function readResumeTokenRevision(resumeToken) {
  if (typeof resumeToken !== TYPEOF.STRING || resumeToken.length === NUM.ZERO) {
    return null;
  }
  const segments = resumeToken.split(
    CONTROL_PLANE_SNAPSHOT_RESUME_TOKEN_LITERAL.SEPARATOR,
  );
  if (segments.length < LOCAL_NUM_THREE ||
      segments[NUM.ZERO] !== CONTROL_PLANE_SNAPSHOT_RESUME_TOKEN_LITERAL.PREFIX) {
    return null;
  }
  return normalizeNonNegativeInteger(segments[segments.length - NUM.ONE]);
}

function resolveSnapshotRevisionCandidate(snapshot = null) {
  const value =
    normalizeNonNegativeInteger(snapshot?.snapshotRevision);
  if (value !== null) {
    return Object.freeze({
      revision: value,
      source: CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.SNAPSHOT_REVISION,
    });
  }
  const snapshotVersion =
    normalizeNonNegativeInteger(snapshot?.snapshotVersion);
  if (snapshotVersion !== null) {
    return Object.freeze({
      revision: snapshotVersion,
      source: CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.SNAPSHOT_VERSION,
    });
  }
  const topologyEpoch =
    normalizeNonNegativeInteger(
      snapshot?.topologySnapshotEpoch ??
      snapshot?.topologyEpoch,
    );
  if (topologyEpoch !== null) {
    return Object.freeze({
      revision: topologyEpoch,
      source: CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.TOPOLOGY_EPOCH,
    });
  }
  const capturedAt =
    normalizeNonNegativeInteger(snapshot?.capturedAt);
  if (capturedAt !== null) {
    return Object.freeze({
      revision: capturedAt,
      source: CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.CAPTURED_AT,
    });
  }
  const observedAtMs = normalizeObservedAtMs(
    snapshot?.observedAtMs ?? snapshot?.observedAt,
  );
  if (observedAtMs !== null) {
    return Object.freeze({
      revision: observedAtMs,
      source: CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.OBSERVED_AT,
    });
  }
  return Object.freeze({
    revision: null,
    source: CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE.NONE,
  });
}

function resolveExpectedMinimumRevision(options = {}) {
  const explicitRevision =
    normalizeNonNegativeInteger(options.expectedMinimumRevision);
  if (explicitRevision !== null) {
    return explicitRevision;
  }
  return readResumeTokenRevision(options.expectedResumeToken);
}

function resolveControlPlaneSnapshotRevisionState(options = {}) {
  const revision = normalizeNonNegativeInteger(options.revision);
  if (revision === null) {
    return CONTROL_PLANE_SNAPSHOT_REVISION_STATE.UNAVAILABLE;
  }
  const expectedMinimumRevision =
    normalizeNonNegativeInteger(options.expectedMinimumRevision);
  if (expectedMinimumRevision !== null && revision < expectedMinimumRevision) {
    return CONTROL_PLANE_SNAPSHOT_REVISION_STATE.BEHIND;
  }
  if (options.stale === true || options.deferred === true) {
    return CONTROL_PLANE_SNAPSHOT_REVISION_STATE.STALE_USABLE;
  }
  return CONTROL_PLANE_SNAPSHOT_REVISION_STATE.CURRENT;
}

function resolveControlPlaneSnapshotRevisionMetadata(snapshot = null, options = {}) {
  const revisionCandidate = resolveSnapshotRevisionCandidate(snapshot);
  const expectedMinimumRevision =
    resolveExpectedMinimumRevision(options);
  const observedAtMs = normalizeObservedAtMs(
    snapshot?.observedAtMs ??
    snapshot?.capturedAt ??
    snapshot?.observedAt,
  );
  const revisionState =
    resolveControlPlaneSnapshotRevisionState({
      revision: revisionCandidate.revision,
      expectedMinimumRevision,
      stale: options.stale === true,
      deferred: options.deferred === true,
    });
  const revisionGap =
    revisionCandidate.revision !== null &&
    expectedMinimumRevision !== null &&
    expectedMinimumRevision > revisionCandidate.revision ?
      expectedMinimumRevision - revisionCandidate.revision :
      NUM.ZERO;
  return Object.freeze({
    revision: revisionCandidate.revision,
    revisionSource: revisionCandidate.source,
    revisionState,
    expectedMinimumRevision,
    revisionGap,
    observedAtMs,
    observedAt: normalizeObservedAt(observedAtMs, snapshot?.observedAt),
    resumeToken: buildControlPlaneSnapshotResumeToken(
      revisionCandidate.revision,
      revisionCandidate.source,
    ),
  });
}

export {
  buildControlPlaneSnapshotResumeToken,
  CONTROL_PLANE_SNAPSHOT_REVISION_SOURCE,
  CONTROL_PLANE_SNAPSHOT_REVISION_STATE,
  readResumeTokenRevision,
  resolveControlPlaneSnapshotRevisionMetadata,
};
