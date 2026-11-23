// Mandatory replica-operation UPDATE result vocabulary. The repository owns
// {persisted, disposition, operation}; consumers validate that complete result.
const REPLICA_OPERATION_UPDATE_DISPOSITION = Object.freeze({
  UPDATED: 'updated',
  RECOVERED: 'recovered',
  IDEMPOTENT_REPLAY: 'idempotent_replay',
  REINSERTED: 'reinserted',
  TERMINAL_ADOPTED: 'terminal_adopted',
  REFUSED: 'refused',
});

export {REPLICA_OPERATION_UPDATE_DISPOSITION};
