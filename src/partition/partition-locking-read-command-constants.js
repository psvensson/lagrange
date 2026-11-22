/**
 * Canonical constants for authoritative partition locking-read reservation
 * commands and RPC operations.
 *
 * @module partition/partition-locking-read-command-constants
 */

export const LOCKING_READ_RESERVATION_TYPE = 'LOCKING_READ_RESERVATION';

export const LOCKING_READ_PARTITION_OP = Object.freeze({
  ACQUIRE: 'ACQUIRE',
  RELEASE_TRANSACTION: 'RELEASE_TRANSACTION',
  RELEASE_SESSION: 'RELEASE_SESSION',
});

export const LOCKING_READ_RESERVATION_COMMAND_ERROR = Object.freeze({
  ORIGIN: 'locking_read_reservation_origin_refused',
  BYTES: 'locking_read_reservation_bytes_invalid',
  TARGET: 'locking_read_reservation_target_invalid',
  UNSUPPORTED_OP: 'locking_read_reservation_unsupported_operation',
});

export const DB_LOCKING_READ_ACQUIRE_STATUS = Object.freeze({
  ACQUIRED: 'acquired',
  ALREADY_OWNED: 'already_owned',
  CONFLICT: 'conflict',
  UNAVAILABLE: 'unavailable',
});
