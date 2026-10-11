// The fixed query-owner interaction at partition request/committed apply.
const COORDINATOR_SETTLEMENT_TYPE = 'COORDINATOR_SETTLEMENT';
const COORDINATOR_SETTLEMENT_RESULT = 'settlementResult';
const COORDINATOR_SETTLEMENT_ERROR = Object.freeze({
  ORIGIN: 'coordinator_settlement_origin_refused',
  BYTES: 'coordinator_settlement_bytes_invalid',
  TARGET: 'coordinator_settlement_target_invalid',
  RESULT: 'coordinator_settlement_result_unavailable',
});
export {COORDINATOR_SETTLEMENT_TYPE, COORDINATOR_SETTLEMENT_RESULT,
  COORDINATOR_SETTLEMENT_ERROR};
