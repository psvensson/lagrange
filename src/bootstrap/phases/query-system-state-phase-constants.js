import {NUM} from '../../constants/index.js';

const LOG_CACHE_POPULATED =
  'System cache populated from bootstrap response';
const LOG_BOOTSTRAP_MISSING_SNAPSHOTS =
  'Bootstrap response missing systemTableSnapshots';
const LOG_CACHE_HYDRATED =
  'System cache hydrated from bootstrap response';
const LOG_TOPOLOGY_EPOCH_APPLIED =
  'Applied bootstrap topology epoch to local cache watermark';
const LOG_SNAPSHOT_MISSING =
  'Snapshot missing or invalid for table';
const LOG_HYDRATED_TABLE =
  'Hydrated table from snapshot';
const LOG_SKIPPING_STALE_SNAPSHOT =
  'Skipping stale snapshot row during cache hydration';
const LOG_BLOCKING_BACKFILL_START =
  'Starting blocking join backfill for discovery-critical propagated tables';
const LOG_BLOCKING_BACKFILL_COMPLETE =
  'Completed blocking join backfill for discovery-critical propagated tables';
const LOG_BLOCKING_BACKFILL_FAILED =
  'Blocking join backfill failed for discovery-critical propagated tables';
const LOG_BLOCKING_BACKFILL_SKIPPED =
  'Skipping blocking join backfill because bootstrap snapshot already covers ' +
  'discovery-critical propagated tables';
const LOG_OPPORTUNISTIC_BACKFILL_SKIPPED =
  'Skipping opportunistic join backfill because bootstrap snapshot already ' +
  'covers opportunistic propagated tables';
const LOG_OPPORTUNISTIC_BACKFILL_COMPLETE =
  'Completed opportunistic join backfill for non-critical propagated tables';
const LOG_OPPORTUNISTIC_BACKFILL_FAILED =
  'Opportunistic join backfill failed for non-critical propagated tables';
const LOG_NODE_REGISTRATION_RETRY =
  'Retrying join node registration after retryable admission failure';
const JOIN_NODE_REGISTRATION_MAX_ATTEMPTS = 2;
const JOIN_NODE_REGISTRATION_RETRY_DELAY_MS = 2 * NUM.HUNDRED;
const JOIN_NODE_REGISTRATION_MAX_DELAY_MS = NUM.THOUSAND;

export {
  JOIN_NODE_REGISTRATION_MAX_ATTEMPTS,
  JOIN_NODE_REGISTRATION_MAX_DELAY_MS,
  JOIN_NODE_REGISTRATION_RETRY_DELAY_MS,
  LOG_BLOCKING_BACKFILL_COMPLETE,
  LOG_BLOCKING_BACKFILL_FAILED,
  LOG_BLOCKING_BACKFILL_SKIPPED,
  LOG_BLOCKING_BACKFILL_START,
  LOG_BOOTSTRAP_MISSING_SNAPSHOTS,
  LOG_CACHE_HYDRATED,
  LOG_CACHE_POPULATED,
  LOG_HYDRATED_TABLE,
  LOG_NODE_REGISTRATION_RETRY,
  LOG_OPPORTUNISTIC_BACKFILL_COMPLETE,
  LOG_OPPORTUNISTIC_BACKFILL_FAILED,
  LOG_OPPORTUNISTIC_BACKFILL_SKIPPED,
  LOG_SKIPPING_STALE_SNAPSHOT,
  LOG_SNAPSHOT_MISSING,
  LOG_TOPOLOGY_EPOCH_APPLIED,
};
