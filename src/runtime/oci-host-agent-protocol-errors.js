const OCI_HOST_AGENT_PROTOCOL_ERROR = Object.freeze({
  AUTHENTICATION_FAILED: 'authentication_failed',
  DEADLINE_EXPIRED: 'deadline_expired',
  DUPLICATE_OBJECT_KEY: 'duplicate_object_key',
  FRAME_LENGTH_INVALID: 'frame_length_invalid',
  FRAME_TOO_LARGE: 'frame_too_large',
  INVALID_FIELD: 'invalid_field',
  INVALID_JSON: 'invalid_json',
  INVALID_JSON_NUMBER: 'invalid_json_number',
  INVALID_UNICODE: 'invalid_unicode',
  KEY_UNAVAILABLE: 'key_unavailable',
  MISSING_FIELD: 'missing_field',
  NON_CANONICAL_JSON: 'non_canonical_json',
  NULL_NOT_ALLOWED: 'null_not_allowed',
  RESPONSE_BINDING_MISMATCH: 'response_binding_mismatch',
  UNKNOWN_FIELD: 'unknown_field',
});
class OciHostAgentProtocolError extends Error {
  constructor(code) {
    super(code);
    this.name = this.constructor.name;
    this.code = code;
  }
}

function protocolError(code) {
  throw new OciHostAgentProtocolError(code);
}

export {
  OCI_HOST_AGENT_PROTOCOL_ERROR,
  OciHostAgentProtocolError,
  protocolError,
};
