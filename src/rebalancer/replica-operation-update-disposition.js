// Typed disposition for replica_operation UPDATE persistence. Mirrors
// REPLICA_OPERATION_INSERT_DISPOSITION (replica-operation-insert-disposition.js):
// persistOperationUpdate historically returned true|false and the false arm
// conflated "lost the terminal CAS to a different durable terminal" with
// "unresolved divergence / expected-step CAS miss". Terminal-transition
// writers must tell those apart: a lost terminal write ADOPTS the winning
// terminal and stands its repair down, while an unresolved divergence keeps
// retrying. The default boolean contract is unchanged; callers opt into the
// typed result with options.returnDisposition === true.
const REPLICA_OPERATION_UPDATE_DISPOSITION = Object.freeze({
  UPDATED: 'updated',
  RECOVERED: 'recovered',
  IDEMPOTENT_REPLAY: 'idempotent_replay',
  REINSERTED: 'reinserted',
  TERMINAL_ADOPTED: 'terminal_adopted',
  REFUSED: 'refused',
});

export {REPLICA_OPERATION_UPDATE_DISPOSITION};
