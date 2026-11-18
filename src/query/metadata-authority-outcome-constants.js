// The three-state answer of a table or partition metadata lookup against
// its authority (a leaf module: the SQL engine's routing-metadata refresh
// and the table-creation lookups both import it without importing each
// other). FOUND holds a row; ABSENT only on the authority's explicit empty
// success; UNAVAILABLE when the authority could not answer, never absent.
const METADATA_AUTHORITY_REFRESH_OUTCOME = Object.freeze({
  FOUND: 'FOUND',
  ABSENT: 'ABSENT',
  UNAVAILABLE: 'UNAVAILABLE',
});

const METADATA_AUTHORITY_UNAVAILABLE_REASON = Object.freeze({
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
  AUTHORITY_READ_FAILED: 'authority_read_failed',
});

export {
  METADATA_AUTHORITY_REFRESH_OUTCOME,
  METADATA_AUTHORITY_UNAVAILABLE_REASON,
};
