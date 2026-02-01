const ERRORS = Object.freeze({
  // Query execution / routing
  QUERY_FAILED: 'Query failed',
  SYSTEM_CACHE_NOT_AVAILABLE: 'System cache not available',
  SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE:
    'System cache not available for partition lookup',
  NO_LEADER_AVAILABLE_FOR_WRITE: 'No leader available for write operation',
  NO_HANDLER_FOR_ADDRESS: 'No handler registered for address',
});

const ERRNO = Object.freeze({
  EPERM: 'EPERM',
  EACCES: 'EACCES',
  NOT_RUNNING: 'ERR_SERVER_NOT_RUNNING',
});

export {ERRORS, ERRNO};
