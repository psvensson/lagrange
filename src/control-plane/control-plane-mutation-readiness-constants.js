const CONTROL_PLANE_MUTATION_READINESS_ERROR =
  'query_admission_deferred';
const CONTROL_PLANE_MUTATION_READINESS_OUTCOME = 'deferred';
const CONTROL_PLANE_MUTATION_READINESS_VISIBILITY_STATE =
  'deferred_by_pressure';
const CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION =
  'transaction_control_routing_gap';
const CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON = Object.freeze({
  OWNER_MISSING: 'transaction_control_owner_missing',
  SERVICE_MISSING: 'transaction_control_service_gap',
});
const CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON_CODES = Object.freeze([
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON.OWNER_MISSING,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON.SERVICE_MISSING,
]);

function hasControlPlaneMutationRoutingGapFailureSignature(value = null) {
  const failedDimensions = Array.isArray(value?.failedDimensions) ?
    value.failedDimensions :
    [];
  if (failedDimensions.includes(
    CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION,
  )) {
    return true;
  }
  const reasonCodes = new Set([
    typeof value?.reasonCode === 'string' ? value.reasonCode : '',
    ...(
      Array.isArray(value?.reasonCodes) ?
        value.reasonCodes.filter((entry) => typeof entry === 'string') :
        []
    ),
  ]);
  return CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON_CODES.some((code) =>
    reasonCodes.has(code),
  );
}

export {
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_MUTATION_READINESS_OUTCOME,
  CONTROL_PLANE_MUTATION_READINESS_VISIBILITY_STATE,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON_CODES,
  hasControlPlaneMutationRoutingGapFailureSignature,
};
