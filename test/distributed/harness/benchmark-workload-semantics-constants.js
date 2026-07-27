export const BENCHMARK_SEMANTIC_ZERO = 0;
export const BENCHMARK_SEMANTIC_ONE = 1;
export const BENCHMARK_PAYLOAD_MODULO = 100000;
export const BENCHMARK_TIMESTAMP_BASE_MS = 1700000000000;
export const BENCHMARK_EVENT_ID_PREFIX = 'bench-';
export const BENCHMARK_TABLE_NAME = 'benchmark_events';
export const BENCHMARK_INSERT_OPERATION = 'INSERT';
export const BENCHMARK_SELECT_OPERATION = 'SELECT';
export const BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED =
  'command_acknowledged';
export const BENCHMARK_RESULT_ORACLE_SINGLE_COUNT_ROW = 'single_count_row';
export const BENCHMARK_ORDERING_CONTRACT =
  'not_applicable_single_aggregate_row';
export const BENCHMARK_TRANSACTION_CONTRACT =
  'single_statement_autocommit_atomic';
export const BENCHMARK_CONSISTENCY_CONTRACT =
  'statement_reads_committed_state';
export const BENCHMARK_DURABILITY_CONTRACT =
  'acknowledged_write_visible_after_completion';
export const BENCHMARK_ERROR_CONTRACT = 'terminal_non_success_is_explicit';
export const BENCHMARK_CORRECT_THROUGHPUT_BASIS = 'correct_operations';
export const BENCHMARK_LEGACY_THROUGHPUT_BASIS =
  'legacy_diagnostic_ops_per_sec';
export const BENCHMARK_SEMANTIC_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
});
export const BENCHMARK_SQL_DIALECT = Object.freeze({
  SQLITE: 'sqlite',
  POSTGRESQL: 'postgresql',
});
export const BENCHMARK_SEMANTIC_CONTRACT_VERSION =
  'benchmark-semantic-parity-v1';
export const BENCHMARK_VISIBILITY_CHUNK_SIZE = 100;
export const BENCHMARK_VISIBILITY_RESULT_ALIAS = 'event_id';
export const BENCHMARK_SQL_TEXT_QUOTE = '\'';
export const BENCHMARK_SQL_ESCAPED_TEXT_QUOTE = '\'\'';
export const BENCHMARK_INSERT_COLUMNS_SQL =
  '(event_id, payload, created_at) VALUES ';
export const BENCHMARK_POSTGRES_CONFLICT_SQL =
  ' ON CONFLICT (event_id) DO NOTHING';
export const BENCHMARK_SEMANTIC_RESULT_ERROR_CODE =
  'BENCHMARK_SEMANTIC_RESULT_MISMATCH';
export const BENCHMARK_SEMANTIC_RESULT_ERROR_MESSAGE =
  'benchmark semantic result oracle expected one non-negative count row';
export const BENCHMARK_SEMANTIC_RUNTIME_RECEIPT_MISSING =
  'benchmark_semantic_runtime_receipt_missing';
export const BENCHMARK_SEMANTIC_PARITY_FAILED_PREFIX =
  'benchmark_semantic_parity_failed:';
export const BENCHMARK_DURABILITY_OBSERVER_MISSING =
  'durability_observer_missing';
export const BENCHMARK_ACKNOWLEDGED_WRITES_NOT_VISIBLE =
  'acknowledged_writes_not_visible';
export const BENCHMARK_PUBLICATION_REASON = Object.freeze({
  SEMANTIC_CONTRACT_MISSING: 'semantic_contract_missing',
  SEMANTIC_CONTRACT_MISMATCH: 'semantic_contract_mismatch',
  SEMANTIC_DIALECT_MISMATCH: 'semantic_dialect_mismatch',
  SEMANTIC_ORACLE_FAILED: 'semantic_oracle_failed',
  SEMANTIC_DIMENSION_INCOMPLETE: 'semantic_dimension_incomplete',
  SEMANTIC_EVIDENCE_INCOMPLETE: 'semantic_evidence_incomplete',
  SEMANTIC_RECEIPT_DIGEST_MISMATCH: 'semantic_receipt_digest_mismatch',
  PAIRED_RESULT_SET_MISMATCH: 'paired_result_set_mismatch',
  CORRECT_THROUGHPUT_MISSING: 'correct_throughput_missing',
  CORRECT_THROUGHPUT_INVALID: 'correct_throughput_invalid',
  DERIVED_METRIC_INVALID: 'derived_metric_invalid',
});
