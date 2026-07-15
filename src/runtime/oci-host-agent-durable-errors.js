const OCI_HOST_AGENT_DURABLE_ERROR = Object.freeze({
  ADMISSION_CONFIGURATION_INVALID: 'admission_configuration_invalid',
  ADMISSION_SETTLEMENT_INVALID: 'admission_settlement_invalid',
  CLOSED: 'durable_state_closed',
  ENROLLMENT_UNAVAILABLE: 'enrollment_unavailable',
  GENERATION_CONFLICT: 'receipt_generation_conflict',
  INTENT_CONFLICT: 'intent_conflict',
  INVALID_CONFIGURATION: 'durable_state_configuration_invalid',
  LOCK_UNAVAILABLE: 'receipt_volume_lock_unavailable',
  RECEIPT_CAPACITY_EXHAUSTED: 'receipt_capacity_exhausted',
  RECEIPT_UNAVAILABLE: 'receipt_unavailable',
  RESOURCE_FENCED: 'resource_fenced',
  RETIREMENT_REQUIRED: 'host_retirement_required',
});
const DURABLE_ERROR_NAME = 'OciHostAgentDurableStateError';

class OciHostAgentDurableStateError extends Error {
  constructor(code) {
    super(code);
    this.name = DURABLE_ERROR_NAME;
    this.code = code;
  }
}

function durableStateError(code) {
  throw new OciHostAgentDurableStateError(code);
}

export {
  OCI_HOST_AGENT_DURABLE_ERROR,
  OciHostAgentDurableStateError,
  durableStateError,
};
