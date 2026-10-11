const CDC_COVERAGE_QUERY_FIELD = Object.freeze({
  CHUNK_ORDINAL: 'cdcCoverageChunkOrdinal',
  COMPLETE: 'cdcCompleteCoverage',
  DEADLINE_MS: 'cdcCoverageDeadlineMs',
  EXPECTED_SCOPE_ID: 'cdcCoverageExpectedScopeId',
  MODE: 'cdcCoverageMode',
  PAGE_START: 'cdcCoveragePageStart',
  RECONCILE_GENERATION_ID: 'cdcCoverageReconcileGenerationId',
  REQUEST_ID: 'cdcCoverageRequestId',
  TARGET_LIFECYCLE_ID: 'cdcCoverageTargetLifecycleId',
  TARGET_NODE_ID: 'cdcCoverageTargetNodeId',
  TRANSFER_ID: 'cdcCoverageTransferId',
});

const CDC_COVERAGE_REQUEST_MODE = Object.freeze({
  CANCEL: 'cancel',
  CHUNK: 'chunk',
  PAGE: 'page',
});

const CDC_COVERAGE_RESPONSE_STATE = Object.freeze({
  CANCELLED: 'cancelled',
  CHUNK: 'chunk',
  COMPLETE: 'complete',
  OFFER: 'offer',
  REFUSED: 'refused',
});

export {
  CDC_COVERAGE_QUERY_FIELD,
  CDC_COVERAGE_REQUEST_MODE,
  CDC_COVERAGE_RESPONSE_STATE,
};
