export const SIDE_LAGRANGE = 'lagrange';
export const SIDE_POSTGRESQL = 'postgresql';
export const FIXTURE_LOADS = [100, 200, 300];
export const FIXTURE_MEASURED_MS = 1_000;
export const FIXTURE_WARMUP_MS = 100;
export const FIXTURE_TIMEOUT_MS = 100;
export const FIXTURE_TAIL_MINIMUM = 100;
export const FIXTURE_BLOCK_MINIMUM = 3;
export const FIXTURE_BLOCK_MAXIMUM = 5;
export const FIXTURE_BOOTSTRAP_RESAMPLES = 200;
export const FIXTURE_CONFIDENCE = 0.95;
export const FIXTURE_PRACTICAL_RATIO = 0.05;
export const FIXTURE_CI_WIDTH = 0.1;
export const FIXTURE_SEED = 20_260_727;
export const FIXTURE_P99_SLO_MS = 50;
export const FIXTURE_ERROR_SLO = 0.05;
export const FIXTURE_MAX_IN_FLIGHT = 8;
export const FIXTURE_MAX_QUEUE_DEPTH = 16;
export const FIXTURE_RELEASE_LAG_MS = 100;
export const FIXTURE_FINALIZER_TIMEOUT_MS = 100;
export const FIXTURE_RESET_TIMEOUT_MS = 100;
export const FIXTURE_LIVE_ENVIRONMENT = {
  image: 'fixture-postgresql:1',
  imageId: 'fixture-image-id',
  transport: 'fixture-persistent-pool',
  database: 'fixture',
};
export const FIXTURE_OPERATION = 'INSERT';
export const FIXTURE_OPERATION_OUTCOME = 'command_acknowledged';
export const FIXTURE_DURABILITY_STATUS = 'pass';
export const FIXTURE_STUDY_ID = 'capacity-fixture-v1';
export const FIXTURE_TAIL_QUANTILE = 0.99;
export const FIXTURE_MATRIX_ID = 'capacity-fixture-matrix';
export const FIXTURE_CELL_ID = 'capacity-fixture-stable-workload-cell';
export const FIXTURE_PROFILE_ID = 'fixture';
export const FIXTURE_PAIR_ID = 'fixture';
export const FIXTURE_RUN_ID = 'capacity-fixture-run';
export const MILLISECONDS_PER_SECOND = 1_000;
export const FIXTURE_QUEUE_DELAY_DELTA_MS = 4;
export const FIXTURE_LAGRANGE_CAPACITY = 200;
export const FIXTURE_LAGRANGE_FAST_LATENCY_MS = 20;
export const FIXTURE_LAGRANGE_SLOW_LATENCY_MS = 80;
export const FIXTURE_POSTGRESQL_CAPACITY = 100;
export const FIXTURE_POSTGRESQL_FAST_LATENCY_MS = 18;
export const FIXTURE_POSTGRESQL_SLOW_LATENCY_MS = 70;
export const FIXTURE_WINDOW_TIME_MULTIPLIER = 1_000;
export const FIXTURE_RESET_TIME_MULTIPLIER = 10_000;
export const FIXTURE_WALL_TIME_BASE = 1_000_000;
export const FIXTURE_WALL_BLOCK_MULTIPLIER = 100_000;
export const FIXTURE_WALL_LOAD_MULTIPLIER = 100;
export const FIXTURE_WALL_ORDER_MULTIPLIER = 10;
export const FIXTURE_WINDOW_SQL_PREFIX = 'fixture INSERT';
export const FIXTURE_RESET_PHASE = 'reset';
export const FIXTURE_RESET_SQL = 'fixture TRUNCATE';
export const FIXTURE_RESET_COMMAND = 'TRUNCATE';
export const FIXTURE_LIVE_EVIDENCE_VERSION =
  'benchmark-capacity-live-evidence-v1';
export const FIXTURE_NOT_CLAIM_ELIGIBLE_REASON =
  'synthetic_fixture_not_claim_eligible';
export const FIXTURE_POSTGRES_VERSION = 'fixture-postgresql-1';
export const FIXTURE_FINAL_ROW_COUNT = 100;
export const FIXTURE_FINAL_ROW_COUNT_TEXT = '100';
export const FIXTURE_CONTAINER_LOG =
  'fixture managed PostgreSQL log bytes';
