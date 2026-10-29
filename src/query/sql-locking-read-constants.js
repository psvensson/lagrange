/**
 * Canonical constants owner module for locking read (SELECT ... FOR UPDATE)
 * and participant write-intent reservations.
 *
 * @module query/sql-locking-read-constants
 */

import {PG_ERROR_CODE} from '../runtime/pgwire-protocol-constants.js';

export const LOCKING_READ_ERROR_CODE = Object.freeze({
  LOCK_NOT_AVAILABLE: 'LOCK_NOT_AVAILABLE',
});

export const LOCKING_READ_SQL_STATE = Object.freeze({
  LOCK_NOT_AVAILABLE: PG_ERROR_CODE.LOCK_NOT_AVAILABLE,
  FEATURE_NOT_SUPPORTED: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
  NO_ACTIVE_TRANSACTION: PG_ERROR_CODE.NO_ACTIVE_SQL_TRANSACTION,
});

export const LOCKING_READ_RESERVATION_KIND = Object.freeze({
  FOR_UPDATE: 'FOR_UPDATE',
  WRITE_STAGED: 'WRITE_STAGED',
});

export const LOCKING_READ_LOCAL_EXPIRY = Object.freeze({
  FORBIDDEN: 'forbidden',
});

export const LOCKING_READ_RESERVATION_OUTCOME = Object.freeze({
  ALREADY_OWNED: 'reservation_already_owned',
  CONFLICT: 'typed_locking_read_reservation_conflict',
  ACQUIRED: 'reservation_acquired',
});

export const LOCKING_READ_CLAUSE = Object.freeze({
  FOR_UPDATE: 'FOR UPDATE',
});

export const LOCKING_READ_STRENGTH = Object.freeze({
  UPDATE: 'UPDATE',
});

export const LOCKING_READ_AST_TYPE = Object.freeze({
  SELECT: 'SELECT',
  INSERT: 'INSERT',
});

export const LOCKING_READ_TX_OWNERSHIP = Object.freeze({
  EXPLICIT: 'EXPLICIT',
});

export const LOCKING_READ_UNKNOWN_PARTITION = 'unknown-partition';

export const LOCKING_READ_ERROR_MSG = Object.freeze({
  NOWAIT_NOT_SUPPORTED:
    'NOWAIT is not supported; the wait policy is fail-fast refusal',
  SKIP_LOCKED_NOT_SUPPORTED:
    'SKIP LOCKED is not supported; the wait policy is fail-fast refusal',
  OF_NOT_SUPPORTED:
    'FOR UPDATE OF is not supported; locking reads target all selected rows',
  DISTINCT_NOT_SUPPORTED:
    'FOR UPDATE cannot be used with DISTINCT',
  GROUP_BY_OR_HAVING_NOT_SUPPORTED:
    'FOR UPDATE cannot be used with GROUP BY or HAVING',
  SET_OPERATIONS_NOT_SUPPORTED:
    'FOR UPDATE cannot be used with set operations (UNION, INTERSECT, EXCEPT)',
  JOIN_NOT_SUPPORTED:
    'FOR UPDATE cannot be used with JOIN',
  SUBQUERY_OR_CTE_NOT_SUPPORTED:
    'Locking read inside subqueries or CTEs is not supported',
  AGGREGATES_NOT_SUPPORTED:
    'FOR UPDATE cannot be used with aggregate functions',
  REQUIRES_FROM_TABLE:
    'FOR UPDATE requires a FROM table',
  REQUIRES_ACTIVE_EXPLICIT_TRANSACTION:
    'SELECT FOR UPDATE requires an active explicit transaction',
});

export const LOCKING_READ_SET_OPERATION_KEYS = Object.freeze([
  'union',
  'intersect',
  'except',
  '_next',
  'setOperation',
]);

export const LOCKING_READ_SUBQUERY_TYPE = 'subquery';
export const LOCKING_READ_AGGREGATE_TYPE = 'aggregate';
