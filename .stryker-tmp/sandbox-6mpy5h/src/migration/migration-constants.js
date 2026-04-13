// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const MIGRATION_STATUS = Object.freeze(stryMutAct_9fa48("90001") ? {} : (stryCov_9fa48("90001"), {
  PENDING: stryMutAct_9fa48("90002") ? "" : (stryCov_9fa48("90002"), 'pending'),
  DUAL_WRITE: stryMutAct_9fa48("90003") ? "" : (stryCov_9fa48("90003"), 'dual_write'),
  DUAL_WRITE_COMPLETE: stryMutAct_9fa48("90004") ? "" : (stryCov_9fa48("90004"), 'dual_write_complete'),
  BACKFILL: stryMutAct_9fa48("90005") ? "" : (stryCov_9fa48("90005"), 'backfill'),
  BACKFILL_COMPLETE: stryMutAct_9fa48("90006") ? "" : (stryCov_9fa48("90006"), 'backfill_complete'),
  CUTOVER_PENDING: stryMutAct_9fa48("90007") ? "" : (stryCov_9fa48("90007"), 'cutover_pending'),
  COMPLETED: stryMutAct_9fa48("90008") ? "" : (stryCov_9fa48("90008"), 'completed'),
  CANCELLING: stryMutAct_9fa48("90009") ? "" : (stryCov_9fa48("90009"), 'cancelling'),
  CANCELLED: stryMutAct_9fa48("90010") ? "" : (stryCov_9fa48("90010"), 'cancelled'),
  FAILED: stryMutAct_9fa48("90011") ? "" : (stryCov_9fa48("90011"), 'failed')
}));
const MIGRATION_TYPE = Object.freeze(stryMutAct_9fa48("90012") ? {} : (stryCov_9fa48("90012"), {
  ADD_COLUMN: stryMutAct_9fa48("90013") ? "" : (stryCov_9fa48("90013"), 'add_column'),
  DROP_COLUMN: stryMutAct_9fa48("90014") ? "" : (stryCov_9fa48("90014"), 'drop_column'),
  RENAME_COLUMN: stryMutAct_9fa48("90015") ? "" : (stryCov_9fa48("90015"), 'rename_column'),
  ALTER_COLUMN_TYPE: stryMutAct_9fa48("90016") ? "" : (stryCov_9fa48("90016"), 'alter_column_type')
}));
const MIGRATION_STAGE_ORDER = Object.freeze(stryMutAct_9fa48("90017") ? [] : (stryCov_9fa48("90017"), [MIGRATION_STATUS.PENDING, MIGRATION_STATUS.DUAL_WRITE, MIGRATION_STATUS.DUAL_WRITE_COMPLETE, MIGRATION_STATUS.BACKFILL, MIGRATION_STATUS.BACKFILL_COMPLETE, MIGRATION_STATUS.CUTOVER_PENDING, MIGRATION_STATUS.COMPLETED]));
const MIGRATION_CANCELLABLE_STAGES = Object.freeze(new Set(stryMutAct_9fa48("90018") ? [] : (stryCov_9fa48("90018"), [MIGRATION_STATUS.PENDING, MIGRATION_STATUS.DUAL_WRITE, MIGRATION_STATUS.DUAL_WRITE_COMPLETE, MIGRATION_STATUS.BACKFILL, MIGRATION_STATUS.BACKFILL_COMPLETE])));
const MIGRATION_TERMINAL_STATUSES = Object.freeze(new Set(stryMutAct_9fa48("90019") ? [] : (stryCov_9fa48("90019"), [MIGRATION_STATUS.COMPLETED, MIGRATION_STATUS.CANCELLED, MIGRATION_STATUS.FAILED])));
const MIGRATION_DEFAULT = Object.freeze(stryMutAct_9fa48("90020") ? {} : (stryCov_9fa48("90020"), {
  BACKFILL_BATCH_SIZE: 100,
  MAX_RETRY_COUNT: 3,
  RETRY_BASE_DELAY_MS: 100,
  RETRY_MAX_DELAY_MS: 5000,
  TIMEOUT_BUDGET_MS: 300000
}));
const MIGRATION_LOG_MSG = Object.freeze(stryMutAct_9fa48("90021") ? {} : (stryCov_9fa48("90021"), {
  STAGE_TRANSITION: stryMutAct_9fa48("90022") ? "" : (stryCov_9fa48("90022"), 'Schema migration stage transition'),
  MIGRATION_INITIATED: stryMutAct_9fa48("90023") ? "" : (stryCov_9fa48("90023"), 'Schema migration initiated'),
  MIGRATION_RECOVERED: stryMutAct_9fa48("90024") ? "" : (stryCov_9fa48("90024"), 'Schema migration recovered'),
  PARTITION_RETRY: stryMutAct_9fa48("90025") ? "" : (stryCov_9fa48("90025"), 'Schema migration partition operation retry'),
  CUTOVER_RETRY: stryMutAct_9fa48("90026") ? "" : (stryCov_9fa48("90026"), 'Schema migration cutover retry'),
  MIGRATION_CANCELLED: stryMutAct_9fa48("90027") ? "" : (stryCov_9fa48("90027"), 'Schema migration cancelled')
}));
const MIGRATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("90028") ? {} : (stryCov_9fa48("90028"), {
  SQL_CORE_REQUIRED: stryMutAct_9fa48("90029") ? "" : (stryCov_9fa48("90029"), 'MigrationCoordinator requires sqlCore'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("90030") ? "" : (stryCov_9fa48("90030"), 'MigrationCoordinator requires systemTableCache'),
  MIGRATION_NOT_FOUND: stryMutAct_9fa48("90031") ? "" : (stryCov_9fa48("90031"), 'Migration not found'),
  ACTIVE_MIGRATION_CONFLICT_PREFIX: stryMutAct_9fa48("90032") ? "" : (stryCov_9fa48("90032"), 'Active migration already exists for table: '),
  UNSUPPORTED_MIGRATION_TYPE_PREFIX: stryMutAct_9fa48("90033") ? "" : (stryCov_9fa48("90033"), 'Unsupported migration type: '),
  INVALID_STAGE_TRANSITION_PREFIX: stryMutAct_9fa48("90034") ? "" : (stryCov_9fa48("90034"), 'Invalid migration stage transition: '),
  NOT_CANCELLABLE_PREFIX: stryMutAct_9fa48("90035") ? "" : (stryCov_9fa48("90035"), 'Migration cannot be cancelled in stage: '),
  RETRY_EXHAUSTED: stryMutAct_9fa48("90036") ? "" : (stryCov_9fa48("90036"), 'Migration retry budget exhausted')
}));
const MIGRATION_COLUMN = Object.freeze(stryMutAct_9fa48("90037") ? {} : (stryCov_9fa48("90037"), {
  MIGRATION_ID: stryMutAct_9fa48("90038") ? "" : (stryCov_9fa48("90038"), 'migration_id'),
  TABLE_ID: stryMutAct_9fa48("90039") ? "" : (stryCov_9fa48("90039"), 'table_id'),
  TABLE_NAME: stryMutAct_9fa48("90040") ? "" : (stryCov_9fa48("90040"), 'table_name'),
  MIGRATION_TYPE: stryMutAct_9fa48("90041") ? "" : (stryCov_9fa48("90041"), 'migration_type'),
  SOURCE_SCHEMA: stryMutAct_9fa48("90042") ? "" : (stryCov_9fa48("90042"), 'source_schema'),
  TARGET_SCHEMA: stryMutAct_9fa48("90043") ? "" : (stryCov_9fa48("90043"), 'target_schema'),
  STATUS: stryMutAct_9fa48("90044") ? "" : (stryCov_9fa48("90044"), 'status'),
  CURRENT_STAGE: stryMutAct_9fa48("90045") ? "" : (stryCov_9fa48("90045"), 'current_stage'),
  ERROR_MESSAGE: stryMutAct_9fa48("90046") ? "" : (stryCov_9fa48("90046"), 'error_message'),
  CREATED_AT: stryMutAct_9fa48("90047") ? "" : (stryCov_9fa48("90047"), 'created_at'),
  UPDATED_AT: stryMutAct_9fa48("90048") ? "" : (stryCov_9fa48("90048"), 'updated_at'),
  COMPLETED_AT: stryMutAct_9fa48("90049") ? "" : (stryCov_9fa48("90049"), 'completed_at'),
  PARTITION_ID: stryMutAct_9fa48("90050") ? "" : (stryCov_9fa48("90050"), 'partition_id'),
  BACKFILL_CURSOR: stryMutAct_9fa48("90051") ? "" : (stryCov_9fa48("90051"), 'backfill_cursor'),
  RETRY_COUNT: stryMutAct_9fa48("90052") ? "" : (stryCov_9fa48("90052"), 'retry_count')
}));
const MIGRATION_PARTITION_OPERATION = Object.freeze(stryMutAct_9fa48("90053") ? {} : (stryCov_9fa48("90053"), {
  ALTER_TABLE: stryMutAct_9fa48("90054") ? "" : (stryCov_9fa48("90054"), 'alter_table')
}));
export { MIGRATION_STATUS, MIGRATION_TYPE, MIGRATION_STAGE_ORDER, MIGRATION_CANCELLABLE_STAGES, MIGRATION_TERMINAL_STATUSES, MIGRATION_DEFAULT, MIGRATION_LOG_MSG, MIGRATION_ERROR_MSG, MIGRATION_COLUMN, MIGRATION_PARTITION_OPERATION };