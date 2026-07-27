export const BENCHMARK_CAPACITY_PROTOCOL_VERSION =
  'benchmark-statistical-capacity-v1';

export const BENCHMARK_CAPACITY_SIDE_COUNT = 2;
export const BENCHMARK_CAPACITY_MIN_PAIRED_BLOCKS = 3;
export const BENCHMARK_CAPACITY_MIN_TAIL_SAMPLES = 100;
export const BENCHMARK_CAPACITY_MIN_BOOTSTRAP_RESAMPLES = 100;
export const BENCHMARK_CAPACITY_MAX_PAIRED_BLOCKS = 100;
export const BENCHMARK_CAPACITY_MAX_LOAD_POINTS = 100;
export const BENCHMARK_CAPACITY_MAX_MATRIX_RUNS = 2048;
export const BENCHMARK_CAPACITY_MAX_PLANNED_OPERATIONS = 500000;
export const BENCHMARK_CAPACITY_MAX_BOOTSTRAP_DRAWS = 5000000;
export const BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES = 67108864;
export const BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES = 8388608;
export const BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS = 512;
export const BENCHMARK_CAPACITY_PERCENTILE_P50 = 0.5;
export const BENCHMARK_CAPACITY_PERCENTILE_P95 = 0.95;
export const BENCHMARK_CAPACITY_PERCENTILE_P99 = 0.99;
export const BENCHMARK_CAPACITY_RATIO_IDENTITY = 1;
export const BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND = 1000;
export const BENCHMARK_CAPACITY_MAX_OPERATIONS_PER_WINDOW = 1000000;
export const BENCHMARK_CAPACITY_MAX_BOOTSTRAP_RESAMPLES = 100000;

export const BENCHMARK_CAPACITY_ESTIMATOR =
  'paired_median_max_correct_throughput_ratio';
export const BENCHMARK_CAPACITY_INTERVAL =
  'deterministic_percentile_bootstrap';
export const BENCHMARK_CAPACITY_STOPPING_RULE =
  'min_n_tail_sufficient_and_ci_precision_else_max_n';
export const BENCHMARK_CAPACITY_MULTIPLE_COMPARISON =
  'bonferroni_familywise_all_side_load_capacity_curve_intervals';
export const BENCHMARK_CAPACITY_RUN_ORDER_POLICY =
  'seeded_balanced_randomized_blocked_pairs';
export const BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM = 'mulberry32';
export const BENCHMARK_CAPACITY_SCHEDULE_MODE =
  'open_loop_absolute_release';
export const BENCHMARK_CAPACITY_CACHE_POLICY =
  'reset_before_each_blocked_side_run';
export const BENCHMARK_CAPACITY_TIMEOUT_POLICY =
  'terminal_non_success_never_correct';
export const BENCHMARK_CAPACITY_REJECT_POLICY =
  'terminal_non_success_never_correct';
export const BENCHMARK_CAPACITY_ARTIFACT_POLICY =
  'content_addressed_raw_samples';
export const BENCHMARK_CAPACITY_THROUGHPUT_DENOMINATOR_POLICY =
  'actual_release_start_to_terminal_drain';
export const BENCHMARK_CAPACITY_RECEIPT_CLOCK = 'unix_epoch_millisecond';
export const BENCHMARK_CAPACITY_RECEIPT_INTERVAL = 'closed_open';
export const BENCHMARK_CAPACITY_RESET_PHASE = 'reset';

export const BENCHMARK_CAPACITY_PHASE = Object.freeze({
  WARMUP: 'warmup',
  MEASURED: 'measured',
});

export const BENCHMARK_CAPACITY_OUTCOME = Object.freeze({
  CORRECT: 'correct',
  REJECTED: 'rejected',
  TIMED_OUT: 'timed_out',
  ERRORED: 'errored',
  CANCELLED: 'cancelled',
});

export const BENCHMARK_CAPACITY_MEASUREMENT_STATE = Object.freeze({
  MEASURED: 'measured',
  NON_MEASURING: 'non_measuring',
});

export const BENCHMARK_CAPACITY_STOP_DECISION = Object.freeze({
  PRECISION_REACHED: 'precision_reached',
  MAXIMUM_REPETITIONS: 'maximum_repetitions',
  NON_MEASURING: 'non_measuring',
});

export const BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION = Object.freeze({
  FIRST_SIDE_FASTER: 'first_side_faster',
  SECOND_SIDE_FASTER: 'second_side_faster',
  PRACTICALLY_EQUIVALENT: 'practically_equivalent',
  INCONCLUSIVE: 'inconclusive',
  NO_RESULT: 'no_result',
});

export const BENCHMARK_CAPACITY_REASON = Object.freeze({
  EMPTY_CAPACITY: 'empty_slo_capacity',
  INCOMPLETE_MATRIX: 'incomplete_capacity_matrix',
  INSUFFICIENT_TAIL_SAMPLES: 'insufficient_p99_samples',
  INVALID_PAIRED_EFFECT: 'invalid_paired_effect',
  MAXIMUM_REPETITIONS_REACHED: 'maximum_repetitions_reached',
  PRECISION_TARGET_REACHED: 'confidence_interval_precision_reached',
});

export const BENCHMARK_CAPACITY_SAMPLE_VERSION =
  'benchmark-capacity-run-sample-v1';

export const BENCHMARK_CAPACITY_WINDOW_RECEIPT_VERSION =
  'benchmark-capacity-window-receipt-v1';

export const BENCHMARK_CAPACITY_CACHE_RESET_RECEIPT_VERSION =
  'benchmark-capacity-cache-reset-receipt-v1';

export const BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS = Object.freeze({
  EXTERNALLY_OBSERVED: 'externally_observed_live',
  SYNTHETIC_FIXTURE: 'synthetic_fixture',
});

export const BENCHMARK_CAPACITY_OPERATION_LOG_VERSION =
  'benchmark-capacity-operation-log-v1';

export const BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER = Object.freeze({
  MANAGED_POSTGRESQL: 'managed_postgresql_pool',
  SYNTHETIC_FIXTURE: 'synthetic_fixture',
});

export const BENCHMARK_CAPACITY_LIVE_PROVENANCE_VERSION =
  'benchmark-capacity-live-provenance-v1';

export const BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER =
  'docker_provider_inspect_v1';
