const CONTROL_PLANE_CACHE_RECONCILE_INTENT = Object.freeze({
  REFRESH_EVIDENCE: 'refresh_evidence',
  REPLACE_CACHE: 'replace_cache',
});

const CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE = Object.freeze({
  COMPLETE_TABLE: 'complete_table',
});

const CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR = Object.freeze({
  CACHE_NOT_RECONCILED: 'authoritative_observation_cache_not_reconciled',
  CONTRACT_INVALID: 'authoritative_observation_contract_invalid',
  READ_INCOMPLETE: 'authoritative_observation_read_incomplete',
  STORAGE_UNAVAILABLE: 'authoritative_observation_storage_unavailable',
});

export {
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
};
