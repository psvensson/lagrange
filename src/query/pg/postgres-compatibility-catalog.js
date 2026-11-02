/**
 * Canonical catalog of PostgreSQL wire-protocol compatibility dimensions,
 * external client identifiers, error codes, and declared feature cells for Q10
 * (`postgres-compatibility-certification-matrix`).
 *
 * @module query/pg/postgres-compatibility-catalog
 */

const objectFreeze = Object.freeze;
const objectValues = Object.values;

const PG_COMPAT_MATRIX_SCHEMA = 'lagrange-postgres-compatibility-matrix/2';
const PG_COMPAT_QUEST_ID = 'postgres-compatibility-certification-matrix';
const PG_COMPAT_EDITION_SCOPE = 'community-agpl';
const PG_COMPAT_ORM_CLAIM_POLICY =
  'driver_connectivity_does_not_imply_orm_compatibility';
const PG_COMPAT_CELL_ID_SEPARATOR = ':';
const PG_COMPAT_ERROR_NAME = 'PostgresCompatibilityMatrixError';

const PG_COMPAT_CLIENT_ID = objectFreeze({
  NODE_PG: 'node-pg',
  PSQL: 'psql',
  PG_POOL: 'pg-pool',
});

const PG_COMPAT_ALL_CLIENTS = objectFreeze([
  PG_COMPAT_CLIENT_ID.NODE_PG,
  PG_COMPAT_CLIENT_ID.PSQL,
  PG_COMPAT_CLIENT_ID.PG_POOL,
]);

// The client builds the matrix certifies, by major version. The claim is
// about the product's SQL surface; the generating host's exact builds are
// environment, recorded beside the matrix and outside its digest
// (postgres-compatibility-matrix-driver-version-pin). Admitted by
// measurement: psql 14 (14.24, the controller) and psql 16 (16.15, the
// hosted runner of run 41431327759) observed every cell and negative control
// identically; node-pg 8 and pg-pool 3 are the locked dependencies. A build
// outside these majors is refused, never certified by assumption.
const PG_COMPAT_SUPPORTED_CLIENT_MAJORS = objectFreeze({
  [PG_COMPAT_CLIENT_ID.NODE_PG]: objectFreeze([8]),
  [PG_COMPAT_CLIENT_ID.PSQL]: objectFreeze([14, 16]),
  [PG_COMPAT_CLIENT_ID.PG_POOL]: objectFreeze([3]),
});

const PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS = objectFreeze([
  PG_COMPAT_CLIENT_ID.NODE_PG,
  PG_COMPAT_CLIENT_ID.PG_POOL,
]);

const PG_COMPAT_DIMENSION = objectFreeze({
  STARTUP_TLS_AUTHENTICATION: 'startup_tls_authentication',
  SIMPLE_AND_EXTENDED_QUERY: 'simple_and_extended_query',
  PARAMETER_TYPES: 'parameter_types',
  TRANSACTIONS: 'transactions',
  DDL: 'ddl',
  INSERTS_UPDATES_DELETES: 'inserts_updates_deletes',
  RESULT_TYPES: 'result_types',
  ERRORS: 'errors',
  CONNECTION_POOLING: 'connection_pooling',
  PREPARED_STATEMENTS: 'prepared_statements',
  CANCELLATION_BEHAVIOR: 'cancellation_behavior',
  LIFECYCLE_SQL_PERMISSIONS: 'lifecycle_sql_permissions',
});

const PG_COMPAT_ALL_DIMENSIONS = objectFreeze(
  objectValues(PG_COMPAT_DIMENSION),
);

const PG_COMPAT_CELL_STATUS = objectFreeze({
  SUPPORTED: 'supported',
  UNSUPPORTED: 'unsupported',
});

const PG_COMPAT_NEGATIVE_CONTROL_ID = objectFreeze({
  WRONG_PASSWORD: 'wrong_password',
  WRONG_CA: 'wrong_ca',
  UNSUPPORTED_SQL: 'unsupported_sql',
});

const PG_COMPAT_ALL_NEGATIVE_CONTROLS = objectFreeze([
  PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_PASSWORD,
  PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_CA,
  PG_COMPAT_NEGATIVE_CONTROL_ID.UNSUPPORTED_SQL,
]);

const PG_COMPAT_MATRIX_ERROR_CODE = objectFreeze({
  MISSING_CELL_RECEIPT: 'MISSING_CELL_RECEIPT',
  INVALID_CELL_RECEIPT: 'INVALID_CELL_RECEIPT',
  UNSUPPORTED_CELL_OMITTED: 'UNSUPPORTED_CELL_OMITTED',
  SUPPORTED_CELL_REGRESSION: 'SUPPORTED_CELL_REGRESSION',
  MATRIX_RECEIPT_DIGEST_MISMATCH: 'MATRIX_RECEIPT_DIGEST_MISMATCH',
  NEGATIVE_CONTROL_BREACH: 'NEGATIVE_CONTROL_BREACH',
  ORM_OVERCLAIM_FORBIDDEN: 'ORM_OVERCLAIM_FORBIDDEN',
  DRIVER_VERSION_UNSUPPORTED: 'DRIVER_VERSION_UNSUPPORTED',
});

const PG_COMPAT_SQLSTATE = objectFreeze({
  SUCCESSFUL_COMPLETION: '00000',
  FEATURE_NOT_SUPPORTED: '0A000',
  CONNECTION_FAILURE: '08006',
  PROTOCOL_VIOLATION: '08P01',
  IN_FAILED_SQL_TRANSACTION: '25P02',
  INVALID_AUTHORIZATION: '28000',
  INVALID_PASSWORD: '28P01',
  SYNTAX_ERROR: '42601',
  INSUFFICIENT_PRIVILEGE: '42501',
  INTERNAL_ERROR: 'XX000',
});

const PG_COMPAT_FEATURE_ID = objectFreeze({
  TLS_REQUIRE_PASSWORD_AUTH: 'tls_require_password_auth',
  PLAINTEXT_DOWNGRADE_WHEN_TLS_REQUIRED:
    'plaintext_downgrade_when_tls_required',
  SIMPLE_AND_EXTENDED_QUERY_EXECUTION: 'simple_and_extended_query_execution',
  MULTI_STATEMENT_BATCH_QUERY: 'multi_statement_batch_query',
  POSITIONAL_TYPED_PARAMETERS_AND_CASTS:
    'positional_typed_parameters_and_casts',
  UNBOUNDED_OFFSET_OR_PARAMETERIZED_LIMIT:
    'unbounded_offset_or_parameterized_limit',
  EXPLICIT_BEGIN_COMMIT_ROLLBACK: 'explicit_begin_commit_rollback',
  SERIALIZABLE_ISOLATION_MODE: 'serializable_isolation_mode',
  CREATE_TABLE_PRIMARY_KEY: 'create_table_primary_key',
  FOREIGN_KEY_AND_DROP_TABLE_DDL: 'foreign_key_and_drop_table_ddl',
  PARTITION_SPANNING_DML_COMMAND_TAGS: 'partition_spanning_dml_command_tags',
  DML_RETURNING_AND_CONFLICT_UPDATE: 'dml_returning_and_conflict_update',
  TEXT_ROW_DESCRIPTION_AND_EXPRESSIONS: 'text_row_description_and_expressions',
  COPY_STREAMING_PROTOCOL: 'copy_streaming_protocol',
  SQLSTATE_FAILED_TRANSACTION_FENCING: 'sqlstate_failed_transaction_fencing',
  SYSTEM_TABLE_DIRECT_CLIENT_MUTATION: 'system_table_direct_client_mutation',
  CONCURRENT_SESSION_AND_POOL_REUSE: 'concurrent_session_and_pool_reuse',
  MAX_SESSIONS_OVERFLOW_ADMISSION: 'max_sessions_overflow_admission',
  NAMED_EXTENDED_PREPARED_STATEMENT: 'named_extended_prepared_statement',
  SQL_PREPARE_EXECUTE_SYNTAX: 'sql_prepare_execute_syntax',
  DISCONNECT_ABORTS_OPEN_TRANSACTION: 'disconnect_aborts_open_transaction',
  OUT_OF_BAND_CANCEL_REQUEST_PACKET: 'out_of_band_cancel_request_packet',
  PASSWORD_AUTH_LIFECYCLE_SHOW_SERVICES:
    'password_auth_lifecycle_show_services',
  TRUST_AUTH_LIFECYCLE_SQL_DENIED: 'trust_auth_lifecycle_sql_denied',
});

const FEATURE_SPEC_DEFINITIONS = objectFreeze([
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.STARTUP_TLS_AUTHENTICATION,
    featureId: PG_COMPAT_FEATURE_ID.TLS_REQUIRE_PASSWORD_AUTH,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Verified TLS require-mode handshake and cleartext password authentication',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.STARTUP_TLS_AUTHENTICATION,
    featureId: PG_COMPAT_FEATURE_ID.PLAINTEXT_DOWNGRADE_WHEN_TLS_REQUIRED,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.CONNECTION_FAILURE,
    requiresMutationPrevented: true,
    description:
      'Plaintext startup against a TLS-require listener is rejected before SQL',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.SIMPLE_AND_EXTENDED_QUERY,
    featureId: PG_COMPAT_FEATURE_ID.SIMPLE_AND_EXTENDED_QUERY_EXECUTION,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Single-statement simple and extended protocol query execution',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.SIMPLE_AND_EXTENDED_QUERY,
    featureId: PG_COMPAT_FEATURE_ID.MULTI_STATEMENT_BATCH_QUERY,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    requiresMutationPrevented: true,
    description:
      'Semicolon-chained multi-statement batches are refused whole without mutation',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.PARAMETER_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.POSITIONAL_TYPED_PARAMETERS_AND_CASTS,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Positional $N parameters, integer/text type casts, booleans, and NULL',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.PARAMETER_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.UNBOUNDED_OFFSET_OR_PARAMETERIZED_LIMIT,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    requiresMutationPrevented: true,
    description:
      'Parameterized LIMIT $1 or OFFSET without LIMIT is refused at parse time',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.TRANSACTIONS,
    featureId: PG_COMPAT_FEATURE_ID.EXPLICIT_BEGIN_COMMIT_ROLLBACK,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Explicit BEGIN, COMMIT, and ROLLBACK blocks across partitioned tables',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.TRANSACTIONS,
    featureId: PG_COMPAT_FEATURE_ID.SERIALIZABLE_ISOLATION_MODE,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    requiresMutationPrevented: true,
    description:
      'Unenforced transaction isolation modes (SERIALIZABLE, READ ONLY) are refused',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.DDL,
    featureId: PG_COMPAT_FEATURE_ID.CREATE_TABLE_PRIMARY_KEY,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'CREATE TABLE with explicit PRIMARY KEY returns CREATE TABLE command tag',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.DDL,
    featureId: PG_COMPAT_FEATURE_ID.FOREIGN_KEY_AND_DROP_TABLE_DDL,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    requiresMutationPrevented: true,
    description:
      'Cross-partition FOREIGN KEY / REFERENCES DDL is refused before execution',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.INSERTS_UPDATES_DELETES,
    featureId: PG_COMPAT_FEATURE_ID.PARTITION_SPANNING_DML_COMMAND_TAGS,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'INSERT, UPDATE, and DELETE aggregate affected row counts across partitions',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.INSERTS_UPDATES_DELETES,
    featureId: PG_COMPAT_FEATURE_ID.DML_RETURNING_AND_CONFLICT_UPDATE,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    requiresMutationPrevented: true,
    description:
      'DML RETURNING and ON CONFLICT DO UPDATE clauses are refused without mutation',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.RESULT_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.TEXT_ROW_DESCRIPTION_AND_EXPRESSIONS,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Text-format RowDescription and DataRow frames for expressions, CASE, and casts',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.RESULT_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.COPY_STREAMING_PROTOCOL,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    requiresMutationPrevented: true,
    description:
      'PostgreSQL COPY streaming statements are refused before execution',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.ERRORS,
    featureId: PG_COMPAT_FEATURE_ID.SQLSTATE_FAILED_TRANSACTION_FENCING,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.IN_FAILED_SQL_TRANSACTION,
    requiresMutationPrevented: true,
    description:
      'Aborted transaction block fences follow-up queries with 25P02 until ROLLBACK',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.ERRORS,
    featureId: PG_COMPAT_FEATURE_ID.SYSTEM_TABLE_DIRECT_CLIENT_MUTATION,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.INSUFFICIENT_PRIVILEGE,
    requiresMutationPrevented: true,
    description:
      'Direct client DML against system tables is refused with SQLSTATE 42501',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.CONNECTION_POOLING,
    featureId: PG_COMPAT_FEATURE_ID.CONCURRENT_SESSION_AND_POOL_REUSE,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Concurrent client sessions and pooled checkout/release execute isolated queries',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.CONNECTION_POOLING,
    featureId: PG_COMPAT_FEATURE_ID.MAX_SESSIONS_OVERFLOW_ADMISSION,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.CONNECTION_FAILURE,
    requiresMutationPrevented: true,
    description:
      'Connections exceeding maxSessions ceiling are closed before SQL execution',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.PREPARED_STATEMENTS,
    featureId: PG_COMPAT_FEATURE_ID.NAMED_EXTENDED_PREPARED_STATEMENT,
    clients: PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Extended-protocol named prepared statement Parse/Bind/Execute reuse',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.PREPARED_STATEMENTS,
    featureId: PG_COMPAT_FEATURE_ID.SQL_PREPARE_EXECUTE_SYNTAX,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    requiresMutationPrevented: true,
    description:
      'SQL-text PREPARE/EXECUTE statement syntax is refused in favor of wire Parse/Bind',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.CANCELLATION_BEHAVIOR,
    featureId: PG_COMPAT_FEATURE_ID.DISCONNECT_ABORTS_OPEN_TRANSACTION,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: true,
    description:
      'Client disconnect inside an open transaction block rolls back uncommitted writes',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.CANCELLATION_BEHAVIOR,
    featureId: PG_COMPAT_FEATURE_ID.OUT_OF_BAND_CANCEL_REQUEST_PACKET,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.PROTOCOL_VIOLATION,
    requiresMutationPrevented: true,
    description:
      'Out-of-band PostgreSQL CancelRequest startup packets are refused with 08P01',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.LIFECYCLE_SQL_PERMISSIONS,
    featureId: PG_COMPAT_FEATURE_ID.PASSWORD_AUTH_LIFECYCLE_SHOW_SERVICES,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.SUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    requiresMutationPrevented: false,
    description:
      'Password-authenticated session is authorized to execute SHOW SERVICES',
  }),
  objectFreeze({
    dimension: PG_COMPAT_DIMENSION.LIFECYCLE_SQL_PERMISSIONS,
    featureId: PG_COMPAT_FEATURE_ID.TRUST_AUTH_LIFECYCLE_SQL_DENIED,
    clients: PG_COMPAT_ALL_CLIENTS,
    declaredStatus: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    expectedSqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    requiresMutationPrevented: true,
    description:
      'Loopback trust session is denied service lifecycle SQL before SqlCore execution',
  }),
]);

function buildCompatibilityCellId(clientId, dimension, featureId) {
  return `${clientId}${PG_COMPAT_CELL_ID_SEPARATOR}` +
    `${dimension}${PG_COMPAT_CELL_ID_SEPARATOR}${featureId}`;
}

function expandDeclaredCells() {
  const cells = [];
  for (const spec of FEATURE_SPEC_DEFINITIONS) {
    for (const clientId of spec.clients) {
      cells.push(objectFreeze({
        cellId: buildCompatibilityCellId(
          clientId,
          spec.dimension,
          spec.featureId,
        ),
        clientId,
        dimension: spec.dimension,
        featureId: spec.featureId,
        status: spec.declaredStatus,
        expectedSqlState: spec.expectedSqlState,
        requiresMutationPrevented: spec.requiresMutationPrevented,
        description: spec.description,
      }));
    }
  }
  return objectFreeze(cells);
}

const PG_COMPAT_DECLARED_CELLS = expandDeclaredCells();

const PG_COMPAT_DECLARED_CELL_BY_ID = new Map(
  PG_COMPAT_DECLARED_CELLS.map((cell) => [cell.cellId, cell]),
);

class PostgresCompatibilityMatrixError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = PG_COMPAT_ERROR_NAME;
    this.code = code;
    this.details = objectFreeze({...details});
  }
}

export {
  PG_COMPAT_ALL_CLIENTS,
  PG_COMPAT_ALL_DIMENSIONS,
  PG_COMPAT_ALL_NEGATIVE_CONTROLS,
  PG_COMPAT_CELL_STATUS,
  PG_COMPAT_CLIENT_ID,
  PG_COMPAT_DECLARED_CELL_BY_ID,
  PG_COMPAT_DECLARED_CELLS,
  PG_COMPAT_DIMENSION,
  PG_COMPAT_EDITION_SCOPE,
  PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS,
  PG_COMPAT_FEATURE_ID,
  PG_COMPAT_MATRIX_ERROR_CODE,
  PG_COMPAT_MATRIX_SCHEMA,
  PG_COMPAT_NEGATIVE_CONTROL_ID,
  PG_COMPAT_ORM_CLAIM_POLICY,
  PG_COMPAT_QUEST_ID,
  PG_COMPAT_SQLSTATE,
  PG_COMPAT_SUPPORTED_CLIENT_MAJORS,
  PostgresCompatibilityMatrixError,
  buildCompatibilityCellId,
};
