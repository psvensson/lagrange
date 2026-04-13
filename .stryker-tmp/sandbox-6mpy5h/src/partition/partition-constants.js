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
import { NUM, SERVICE_TYPE } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
const PARTITION_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("100531") ? {} : (stryCov_9fa48("100531"), {
  PARTITION: stryMutAct_9fa48("100532") ? "" : (stryCov_9fa48("100532"), 'partition'),
  KEY_RANGE_MANAGER: stryMutAct_9fa48("100533") ? "" : (stryCov_9fa48("100533"), 'key-range-manager'),
  PENDING_REQUEST_TRACKER: stryMutAct_9fa48("100534") ? "" : (stryCov_9fa48("100534"), 'pending-request-tracker'),
  SPLIT_MERGE: stryMutAct_9fa48("100535") ? "" : (stryCov_9fa48("100535"), 'partition-split-merge')
}));
const PARTITION_ENTITY_TYPE = SERVICE_TYPE.PARTITION;
const PARTITION_STATE = Object.freeze(stryMutAct_9fa48("100536") ? {} : (stryCov_9fa48("100536"), {
  NORMAL: stryMutAct_9fa48("100537") ? "" : (stryCov_9fa48("100537"), 'NORMAL'),
  SPLITTING: stryMutAct_9fa48("100538") ? "" : (stryCov_9fa48("100538"), 'SPLITTING'),
  MERGING: stryMutAct_9fa48("100539") ? "" : (stryCov_9fa48("100539"), 'MERGING')
}));
const PARTITION_TRANSITION_STATE = Object.freeze(stryMutAct_9fa48("100540") ? {} : (stryCov_9fa48("100540"), {
  ADMISSION_PENDING: stryMutAct_9fa48("100541") ? "" : (stryCov_9fa48("100541"), 'admission_pending'),
  BLOCKED: stryMutAct_9fa48("100542") ? "" : (stryCov_9fa48("100542"), 'blocked'),
  DEFERRED: stryMutAct_9fa48("100543") ? "" : (stryCov_9fa48("100543"), 'deferred'),
  FAILED: stryMutAct_9fa48("100544") ? "" : (stryCov_9fa48("100544"), 'failed'),
  SPLIT_PREPARING: stryMutAct_9fa48("100545") ? "" : (stryCov_9fa48("100545"), 'split_preparing'),
  SPLIT_BACKFILLING: stryMutAct_9fa48("100546") ? "" : (stryCov_9fa48("100546"), 'split_backfilling'),
  SPLIT_CATCHUP: stryMutAct_9fa48("100547") ? "" : (stryCov_9fa48("100547"), 'split_catchup'),
  SPLIT_CUTOVER_ACTIVE: stryMutAct_9fa48("100548") ? "" : (stryCov_9fa48("100548"), 'split_cutover_active')
}));

/**
 * Set of split lifecycle phases that only ManagedSplitWorkflow may
 * persist as durable partition_transition_state values.
 *
 * PartitionService and other execution participants MUST NOT write
 * these states to the tables system table directly. They report typed
 * acknowledgements and let the workflow owner advance the phase.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_OWNER_MANAGED_PHASES = Object.freeze(new Set(stryMutAct_9fa48("100549") ? [] : (stryCov_9fa48("100549"), [PARTITION_TRANSITION_STATE.ADMISSION_PENDING, PARTITION_TRANSITION_STATE.BLOCKED, PARTITION_TRANSITION_STATE.DEFERRED, PARTITION_TRANSITION_STATE.FAILED, PARTITION_TRANSITION_STATE.SPLIT_PREPARING, PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING, PARTITION_TRANSITION_STATE.SPLIT_CATCHUP, PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE])));
const RETRYABLE_PARTITION_TRANSITION_STATES = Object.freeze(new Set(stryMutAct_9fa48("100550") ? [] : (stryCov_9fa48("100550"), [PARTITION_TRANSITION_STATE.BLOCKED, PARTITION_TRANSITION_STATE.DEFERRED])));
const PARTITION_TRANSITION_METADATA_FIELD = Object.freeze(stryMutAct_9fa48("100551") ? {} : (stryCov_9fa48("100551"), {
  WORKFLOW_ID: stryMutAct_9fa48("100552") ? "" : (stryCov_9fa48("100552"), 'workflowId'),
  ADMISSION: stryMutAct_9fa48("100553") ? "" : (stryCov_9fa48("100553"), 'admission'),
  FAILURE: stryMutAct_9fa48("100554") ? "" : (stryCov_9fa48("100554"), 'failure'),
  PRIMARY_KEY_COLUMN: stryMutAct_9fa48("100555") ? "" : (stryCov_9fa48("100555"), 'primaryKeyColumn'),
  RETRY: stryMutAct_9fa48("100556") ? "" : (stryCov_9fa48("100556"), 'retry'),
  SOURCE_PARTITION_ID: stryMutAct_9fa48("100557") ? "" : (stryCov_9fa48("100557"), 'sourcePartitionId'),
  TOPOLOGY_SNAPSHOT: stryMutAct_9fa48("100558") ? "" : (stryCov_9fa48("100558"), 'topologySnapshot'),
  SPLIT_KEY: stryMutAct_9fa48("100559") ? "" : (stryCov_9fa48("100559"), 'splitKey'),
  TARGET_PARTITION_IDS: stryMutAct_9fa48("100560") ? "" : (stryCov_9fa48("100560"), 'targetPartitionIds'),
  TARGET_PARTITION_VERSION: stryMutAct_9fa48("100561") ? "" : (stryCov_9fa48("100561"), 'targetPartitionVersion'),
  CUTOVER_APPLIED_AT: stryMutAct_9fa48("100562") ? "" : (stryCov_9fa48("100562"), 'cutoverAppliedAt'),
  PARTICIPANTS: stryMutAct_9fa48("100563") ? "" : (stryCov_9fa48("100563"), 'participants'),
  SOURCE_CHECKPOINT: stryMutAct_9fa48("100564") ? "" : (stryCov_9fa48("100564"), 'sourceCheckpoint')
}));
const PARTITION_SPLIT_MIRROR_ORIGIN = Object.freeze(stryMutAct_9fa48("100565") ? {} : (stryCov_9fa48("100565"), {
  SOURCE: stryMutAct_9fa48("100566") ? "" : (stryCov_9fa48("100566"), 'source'),
  TARGET: stryMutAct_9fa48("100567") ? "" : (stryCov_9fa48("100567"), 'target')
}));
const PARTITION_RAFT_ROLE = RAFT_ROLE;
const PARTITION_REQUEST_TYPE = Object.freeze(stryMutAct_9fa48("100568") ? {} : (stryCov_9fa48("100568"), {
  QUERY: stryMutAct_9fa48("100569") ? "" : (stryCov_9fa48("100569"), 'QUERY'),
  FORWARD_WRITE: stryMutAct_9fa48("100570") ? "" : (stryCov_9fa48("100570"), 'FORWARD_WRITE')
}));
const KEY_RANGE_LOG_MSG = Object.freeze(stryMutAct_9fa48("100571") ? {} : (stryCov_9fa48("100571"), {
  ADDED_PARTITION_RANGE: stryMutAct_9fa48("100572") ? "" : (stryCov_9fa48("100572"), 'Added partition range'),
  REMOVED_PARTITION_RANGE: stryMutAct_9fa48("100573") ? "" : (stryCov_9fa48("100573"), 'Removed partition range'),
  SPLIT_PARTITION: stryMutAct_9fa48("100574") ? "" : (stryCov_9fa48("100574"), 'Split partition'),
  MERGED_PARTITIONS: stryMutAct_9fa48("100575") ? "" : (stryCov_9fa48("100575"), 'Merged partitions')
}));
const KEY_RANGE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("100576") ? {} : (stryCov_9fa48("100576"), {
  overlap: stryMutAct_9fa48("100577") ? () => undefined : (stryCov_9fa48("100577"), (partitionId, existingId) => stryMutAct_9fa48("100578") ? `` : (stryCov_9fa48("100578"), `Key range overlap detected: partition ${partitionId} overlaps with ${existingId}`)),
  firstPartitionStarts: stryMutAct_9fa48("100579") ? () => undefined : (stryCov_9fa48("100579"), partitionId => stryMutAct_9fa48("100580") ? `` : (stryCov_9fa48("100580"), `First partition ${partitionId} does not start at NULL`)),
  lastPartitionEnds: stryMutAct_9fa48("100581") ? () => undefined : (stryCov_9fa48("100581"), partitionId => stryMutAct_9fa48("100582") ? `` : (stryCov_9fa48("100582"), `Last partition ${partitionId} does not end at NULL`)),
  gapBetweenPartitions: stryMutAct_9fa48("100583") ? () => undefined : (stryCov_9fa48("100583"), (currentId, nextId, currentEnd, nextStart) => stryMutAct_9fa48("100584") ? `` : (stryCov_9fa48("100584"), `Gap between partitions ${currentId} and ${nextId}: [${currentEnd}, ${nextStart})`)),
  overlapBetweenPartitions: stryMutAct_9fa48("100585") ? () => undefined : (stryCov_9fa48("100585"), (currentId, nextId) => stryMutAct_9fa48("100586") ? `` : (stryCov_9fa48("100586"), `Overlap between partitions ${currentId} and ${nextId}`)),
  partitionNotFound: stryMutAct_9fa48("100587") ? () => undefined : (stryCov_9fa48("100587"), partitionId => stryMutAct_9fa48("100588") ? `` : (stryCov_9fa48("100588"), `Partition ${partitionId} not found`)),
  splitKeyOutOfRange: stryMutAct_9fa48("100589") ? () => undefined : (stryCov_9fa48("100589"), splitKey => stryMutAct_9fa48("100590") ? `` : (stryCov_9fa48("100590"), `Split key ${splitKey} is not in partition range`)),
  leftPartitionNotFound: stryMutAct_9fa48("100591") ? () => undefined : (stryCov_9fa48("100591"), partitionId => stryMutAct_9fa48("100592") ? `` : (stryCov_9fa48("100592"), `Left partition ${partitionId} not found`)),
  rightPartitionNotFound: stryMutAct_9fa48("100593") ? () => undefined : (stryCov_9fa48("100593"), partitionId => stryMutAct_9fa48("100594") ? `` : (stryCov_9fa48("100594"), `Right partition ${partitionId} not found`)),
  partitionsNotAdjacent: stryMutAct_9fa48("100595") ? () => undefined : (stryCov_9fa48("100595"), (leftId, rightId) => stryMutAct_9fa48("100596") ? `` : (stryCov_9fa48("100596"), `Partitions ${leftId} and ${rightId} are not adjacent`))
}));
const SPLIT_MERGE_STATE = Object.freeze(stryMutAct_9fa48("100597") ? {} : (stryCov_9fa48("100597"), {
  IDLE: stryMutAct_9fa48("100598") ? "" : (stryCov_9fa48("100598"), 'IDLE'),
  EVALUATING: stryMutAct_9fa48("100599") ? "" : (stryCov_9fa48("100599"), 'EVALUATING'),
  SPLITTING: stryMutAct_9fa48("100600") ? "" : (stryCov_9fa48("100600"), 'SPLITTING'),
  MERGING: stryMutAct_9fa48("100601") ? "" : (stryCov_9fa48("100601"), 'MERGING')
}));
const SPLIT_MERGE_EVENT = Object.freeze(stryMutAct_9fa48("100602") ? {} : (stryCov_9fa48("100602"), {
  SPLIT_STARTED: stryMutAct_9fa48("100603") ? "" : (stryCov_9fa48("100603"), 'splitStarted'),
  SPLIT_COMPLETED: stryMutAct_9fa48("100604") ? "" : (stryCov_9fa48("100604"), 'splitCompleted'),
  SPLIT_FAILED: stryMutAct_9fa48("100605") ? "" : (stryCov_9fa48("100605"), 'splitFailed'),
  SPLIT_DEFERRED: stryMutAct_9fa48("100606") ? "" : (stryCov_9fa48("100606"), 'splitDeferred'),
  MERGE_STARTED: stryMutAct_9fa48("100607") ? "" : (stryCov_9fa48("100607"), 'mergeStarted'),
  MERGE_COMPLETED: stryMutAct_9fa48("100608") ? "" : (stryCov_9fa48("100608"), 'mergeCompleted'),
  MERGE_FAILED: stryMutAct_9fa48("100609") ? "" : (stryCov_9fa48("100609"), 'mergeFailed'),
  EVALUATION_COMPLETED: stryMutAct_9fa48("100610") ? "" : (stryCov_9fa48("100610"), 'evaluationCompleted')
}));
const SPLIT_MERGE_REASON = Object.freeze(stryMutAct_9fa48("100611") ? {} : (stryCov_9fa48("100611"), {
  BUSY: stryMutAct_9fa48("100612") ? "" : (stryCov_9fa48("100612"), 'busy'),
  CONTROL_PLANE_BACKPRESSURE: stryMutAct_9fa48("100613") ? "" : (stryCov_9fa48("100613"), 'control_plane_backpressure'),
  MANAGED_SPLIT_RETRY_DUE: stryMutAct_9fa48("100614") ? "" : (stryCov_9fa48("100614"), 'managed_split_retry_due'),
  INSUFFICIENT_CAPACITY: stryMutAct_9fa48("100615") ? "" : (stryCov_9fa48("100615"), 'insufficient_capacity'),
  CAPACITY_AVAILABLE: stryMutAct_9fa48("100616") ? "" : (stryCov_9fa48("100616"), 'capacity_available')
}));
const SPLIT_MERGE_ID = Object.freeze(stryMutAct_9fa48("100617") ? {} : (stryCov_9fa48("100617"), {
  PARTITION_SEPARATOR: stryMutAct_9fa48("100618") ? "" : (stryCov_9fa48("100618"), '_p_'),
  LEFT_SUFFIX: stryMutAct_9fa48("100619") ? "" : (stryCov_9fa48("100619"), '_left'),
  RIGHT_SUFFIX: stryMutAct_9fa48("100620") ? "" : (stryCov_9fa48("100620"), '_right'),
  MERGED_SUFFIX: stryMutAct_9fa48("100621") ? "" : (stryCov_9fa48("100621"), '_merged')
}));
const SPLIT_MERGE_SQL = Object.freeze(stryMutAct_9fa48("100622") ? {} : (stryCov_9fa48("100622"), {
  countRows: stryMutAct_9fa48("100623") ? () => undefined : (stryCov_9fa48("100623"), tableName => stryMutAct_9fa48("100624") ? `` : (stryCov_9fa48("100624"), `SELECT COUNT(*) as total FROM ${tableName}`)),
  selectMedian: stryMutAct_9fa48("100625") ? () => undefined : (stryCov_9fa48("100625"), (primaryKeyColumn, tableName) => (stryMutAct_9fa48("100626") ? `` : (stryCov_9fa48("100626"), `SELECT ${primaryKeyColumn} FROM ${tableName} `)) + (stryMutAct_9fa48("100627") ? `` : (stryCov_9fa48("100627"), `ORDER BY ${primaryKeyColumn} LIMIT 1 OFFSET ?`)))
}));
const SPLIT_MERGE_LOG_MSG = Object.freeze(stryMutAct_9fa48("100628") ? {} : (stryCov_9fa48("100628"), {
  MISSING_MEDIAN_PARAMS: stryMutAct_9fa48("100629") ? "" : (stryCov_9fa48("100629"), 'Missing required parameters for median calculation'),
  CALCULATING_MEDIAN_KEY: stryMutAct_9fa48("100630") ? "" : (stryCov_9fa48("100630"), 'Calculating median key'),
  INSUFFICIENT_ROWS_FOR_SPLIT: stryMutAct_9fa48("100631") ? "" : (stryCov_9fa48("100631"), 'Partition has insufficient rows for split'),
  FAILED_MEDIAN_CALC: stryMutAct_9fa48("100632") ? "" : (stryCov_9fa48("100632"), 'Failed to calculate median key'),
  CALCULATED_MEDIAN_KEY: stryMutAct_9fa48("100633") ? "" : (stryCov_9fa48("100633"), 'Calculated median key'),
  EVALUATED_SPLIT_CRITERIA: stryMutAct_9fa48("100634") ? "" : (stryCov_9fa48("100634"), 'Evaluated split criteria'),
  EVALUATED_MERGE_CRITERIA: stryMutAct_9fa48("100635") ? "" : (stryCov_9fa48("100635"), 'Evaluated merge criteria'),
  STARTING_SPLIT: stryMutAct_9fa48("100636") ? "" : (stryCov_9fa48("100636"), 'Starting partition split'),
  SPLIT_PLAN_COMPLETED: stryMutAct_9fa48("100637") ? "" : (stryCov_9fa48("100637"), 'Partition split plan completed'),
  SPLIT_PLAN_FAILED: stryMutAct_9fa48("100638") ? "" : (stryCov_9fa48("100638"), 'Partition split plan failed'),
  SPLIT_EXECUTION_DEFERRED: stryMutAct_9fa48("100639") ? "" : (stryCov_9fa48("100639"), 'Managed split execution deferred'),
  SPLIT_EXECUTION_FAILED: stryMutAct_9fa48("100640") ? "" : (stryCov_9fa48("100640"), 'Managed split execution failed'),
  STARTING_MERGE: stryMutAct_9fa48("100641") ? "" : (stryCov_9fa48("100641"), 'Starting partition merge'),
  MERGE_COMPLETED: stryMutAct_9fa48("100642") ? "" : (stryCov_9fa48("100642"), 'Partition merge completed'),
  MERGE_FAILED: stryMutAct_9fa48("100643") ? "" : (stryCov_9fa48("100643"), 'Partition merge failed'),
  RANGE_INTEGRITY_OVERLAP: stryMutAct_9fa48("100644") ? "" : (stryCov_9fa48("100644"), 'Range integrity violation: left and right ranges overlap'),
  RANGE_VALID_AFTER_SPLIT: stryMutAct_9fa48("100645") ? "" : (stryCov_9fa48("100645"), 'Range integrity validated after split'),
  RANGE_VALID_AFTER_MERGE: stryMutAct_9fa48("100646") ? "" : (stryCov_9fa48("100646"), 'Range integrity validated after merge'),
  STARTING_PERIODIC_EVAL: stryMutAct_9fa48("100647") ? "" : (stryCov_9fa48("100647"), 'Starting periodic split/merge evaluation'),
  PERIODIC_EVAL_FAILED: stryMutAct_9fa48("100648") ? "" : (stryCov_9fa48("100648"), 'Periodic evaluation failed'),
  REQUESTED_EVAL_FAILED: stryMutAct_9fa48("100649") ? "" : (stryCov_9fa48("100649"), 'Requested split/merge evaluation failed'),
  STOPPED_PERIODIC_EVAL: stryMutAct_9fa48("100650") ? "" : (stryCov_9fa48("100650"), 'Stopped periodic split/merge evaluation'),
  SKIPPING_EVAL_BUSY: stryMutAct_9fa48("100651") ? "" : (stryCov_9fa48("100651"), 'Skipping evaluation: manager is busy'),
  PARTITION_EVAL_COMPLETED: stryMutAct_9fa48("100652") ? "" : (stryCov_9fa48("100652"), 'Partition evaluation completed'),
  THRESHOLDS_UPDATED: stryMutAct_9fa48("100653") ? "" : (stryCov_9fa48("100653"), 'Thresholds updated'),
  MANAGER_SHUTDOWN: stryMutAct_9fa48("100654") ? "" : (stryCov_9fa48("100654"), 'PartitionSplitMergeManager shutdown'),
  SPLIT_CAPACITY_PREFLIGHT: stryMutAct_9fa48("100655") ? "" : (stryCov_9fa48("100655"), 'Split capacity preflight check'),
  SPLIT_DEFERRED_CAPACITY: stryMutAct_9fa48("100656") ? "" : (stryCov_9fa48("100656"), 'Split deferred due to insufficient capacity'),
  SPLIT_DEFERRED_BACKPRESSURE: stryMutAct_9fa48("100657") ? "" : (stryCov_9fa48("100657"), 'Split deferred due to control-plane backpressure'),
  SPLIT_CAPACITY_ALLOWED: stryMutAct_9fa48("100658") ? "" : (stryCov_9fa48("100658"), 'Split capacity preflight passed'),
  MERGE_ELIGIBLE_UNDER_PRESSURE: stryMutAct_9fa48("100659") ? "" : (stryCov_9fa48("100659"), 'Merge remains eligible under capacity pressure')
}));
const SPLIT_MERGE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("100660") ? {} : (stryCov_9fa48("100660"), {
  rangeIntegrityNotContiguous: stryMutAct_9fa48("100661") ? () => undefined : (stryCov_9fa48("100661"), (leftEnd, rightStart) => (stryMutAct_9fa48("100662") ? "" : (stryCov_9fa48("100662"), 'Range integrity violation: ranges not contiguous - ')) + (stryMutAct_9fa48("100663") ? `` : (stryCov_9fa48("100663"), `left end (${leftEnd}) != right start (${rightStart})`))),
  KEY_RANGE_MANAGER_REQUIRED: stryMutAct_9fa48("100664") ? "" : (stryCov_9fa48("100664"), 'KeyRangeManager is required for merge operations'),
  rangeIntegrityLeftStart: stryMutAct_9fa48("100665") ? () => undefined : (stryCov_9fa48("100665"), (leftStart, originalStart) => stryMutAct_9fa48("100666") ? `` : (stryCov_9fa48("100666"), `Range integrity violation: left start (${leftStart}) != original start (${originalStart})`)),
  rangeIntegrityRightEnd: stryMutAct_9fa48("100667") ? () => undefined : (stryCov_9fa48("100667"), (rightEnd, originalEnd) => stryMutAct_9fa48("100668") ? `` : (stryCov_9fa48("100668"), `Range integrity violation: right end (${rightEnd}) != original end (${originalEnd})`)),
  rangeIntegrityMergedStart: stryMutAct_9fa48("100669") ? () => undefined : (stryCov_9fa48("100669"), (mergedStart, leftStart) => stryMutAct_9fa48("100670") ? `` : (stryCov_9fa48("100670"), `Range integrity violation: merged start (${mergedStart}) != left start (${leftStart})`)),
  rangeIntegrityMergedEnd: stryMutAct_9fa48("100671") ? () => undefined : (stryCov_9fa48("100671"), (mergedEnd, rightEnd) => stryMutAct_9fa48("100672") ? `` : (stryCov_9fa48("100672"), `Range integrity violation: merged end (${mergedEnd}) != right end (${rightEnd})`)),
  managerBusy: stryMutAct_9fa48("100673") ? () => undefined : (stryCov_9fa48("100673"), state => stryMutAct_9fa48("100674") ? `` : (stryCov_9fa48("100674"), `Cannot split: manager is in ${state} state`)),
  mergeManagerBusy: stryMutAct_9fa48("100675") ? () => undefined : (stryCov_9fa48("100675"), state => stryMutAct_9fa48("100676") ? `` : (stryCov_9fa48("100676"), `Cannot merge: manager is in ${state} state`)),
  MANAGED_SPLIT_EXECUTION_FAILED: stryMutAct_9fa48("100677") ? "" : (stryCov_9fa48("100677"), 'Managed split execution failed'),
  partitionRangeMissing: stryMutAct_9fa48("100678") ? () => undefined : (stryCov_9fa48("100678"), partitionId => stryMutAct_9fa48("100679") ? `` : (stryCov_9fa48("100679"), `Partition ${partitionId} not found in key range manager`)),
  leftPartitionMissing: stryMutAct_9fa48("100680") ? () => undefined : (stryCov_9fa48("100680"), partitionId => stryMutAct_9fa48("100681") ? `` : (stryCov_9fa48("100681"), `Left partition ${partitionId} not found`)),
  rightPartitionMissing: stryMutAct_9fa48("100682") ? () => undefined : (stryCov_9fa48("100682"), partitionId => stryMutAct_9fa48("100683") ? `` : (stryCov_9fa48("100683"), `Right partition ${partitionId} not found`)),
  partitionsNotAdjacent: stryMutAct_9fa48("100684") ? () => undefined : (stryCov_9fa48("100684"), (leftId, leftEnd, rightId, rightStart) => (stryMutAct_9fa48("100685") ? `` : (stryCov_9fa48("100685"), `Partitions are not adjacent: ${leftId} end (${leftEnd}) != `)) + (stryMutAct_9fa48("100686") ? `` : (stryCov_9fa48("100686"), `${rightId} start (${rightStart})`))),
  SPLIT_PREFLIGHT_OWNER_REQUIRED: stryMutAct_9fa48("100687") ? "" : (stryCov_9fa48("100687"), 'Split capacity preflight requires storageAdmissionService and storageAccountingService')
}));
const SPLIT_MERGE_DEFAULT = Object.freeze(stryMutAct_9fa48("100688") ? {} : (stryCov_9fa48("100688"), {
  SPLIT_STORAGE_THRESHOLD_BYTES: stryMutAct_9fa48("100689") ? 10 * 1024 * 1024 / 1024 : (stryCov_9fa48("100689"), (stryMutAct_9fa48("100690") ? 10 * 1024 / 1024 : (stryCov_9fa48("100690"), (stryMutAct_9fa48("100691") ? 10 / 1024 : (stryCov_9fa48("100691"), 10 * 1024)) * 1024)) * 1024),
  SPLIT_TRAFFIC_THRESHOLD_QPM: 1000,
  MERGE_STORAGE_THRESHOLD_BYTES: stryMutAct_9fa48("100692") ? 2 * 1024 * 1024 / 1024 : (stryCov_9fa48("100692"), (stryMutAct_9fa48("100693") ? 2 * 1024 / 1024 : (stryCov_9fa48("100693"), (stryMutAct_9fa48("100694") ? 2 / 1024 : (stryCov_9fa48("100694"), 2 * 1024)) * 1024)) * 1024),
  MERGE_TRAFFIC_THRESHOLD_QPM: 200,
  EVALUATION_INTERVAL_MS: stryMutAct_9fa48("100695") ? 5 * 60 / 1000 : (stryCov_9fa48("100695"), (stryMutAct_9fa48("100696") ? 5 / 60 : (stryCov_9fa48("100696"), 5 * 60)) * 1000)
}));
const PENDING_REQUEST_DEFAULT = Object.freeze(stryMutAct_9fa48("100697") ? {} : (stryCov_9fa48("100697"), {
  REQUEST_TIMEOUT_MS: 30000,
  CLEANUP_INTERVAL_MS: 60000,
  STALE_REQUEST_BUFFER_MS: 5000,
  MAX_PENDING_REQUESTS: 1024
}));
const PENDING_REQUEST_LOG_MSG = Object.freeze(stryMutAct_9fa48("100698") ? {} : (stryCov_9fa48("100698"), {
  REQUEST_TIMED_OUT: stryMutAct_9fa48("100699") ? "" : (stryCov_9fa48("100699"), 'Request timed out'),
  TRACKING_REQUEST: stryMutAct_9fa48("100700") ? "" : (stryCov_9fa48("100700"), 'Tracking request'),
  REQUEST_RESOLVED: stryMutAct_9fa48("100701") ? "" : (stryCov_9fa48("100701"), 'Request resolved'),
  REQUEST_REJECTED: stryMutAct_9fa48("100702") ? "" : (stryCov_9fa48("100702"), 'Request rejected'),
  BACKPRESSURE_APPLIED: stryMutAct_9fa48("100703") ? "" : (stryCov_9fa48("100703"), 'Pending request tracker at capacity'),
  NO_PENDING_REQUEST_RESOLVE: stryMutAct_9fa48("100704") ? "" : (stryCov_9fa48("100704"), 'No pending request found for resolution'),
  NO_PENDING_REQUEST_REJECT: stryMutAct_9fa48("100705") ? "" : (stryCov_9fa48("100705"), 'No pending request found for rejection'),
  TRACKER_SHUTDOWN: stryMutAct_9fa48("100706") ? "" : (stryCov_9fa48("100706"), 'Tracker shutdown'),
  CLEARED_PENDING_REQUESTS: stryMutAct_9fa48("100707") ? "" : (stryCov_9fa48("100707"), 'Cleared pending requests on shutdown'),
  CLEANED_STALE_REQUEST: stryMutAct_9fa48("100708") ? "" : (stryCov_9fa48("100708"), 'Cleaned up stale request')
}));
const PENDING_REQUEST_ERROR_MSG = Object.freeze(stryMutAct_9fa48("100709") ? {} : (stryCov_9fa48("100709"), {
  ackTimeout: stryMutAct_9fa48("100710") ? () => undefined : (stryCov_9fa48("100710"), (timeoutMs, requestId) => stryMutAct_9fa48("100711") ? `` : (stryCov_9fa48("100711"), `ACK timeout after ${timeoutMs}ms for request ${requestId}`)),
  staleRequest: stryMutAct_9fa48("100712") ? () => undefined : (stryCov_9fa48("100712"), elapsedMs => stryMutAct_9fa48("100713") ? `` : (stryCov_9fa48("100713"), `Stale request cleanup after ${elapsedMs}ms`)),
  backpressure: stryMutAct_9fa48("100714") ? () => undefined : (stryCov_9fa48("100714"), maxPendingRequests => stryMutAct_9fa48("100715") ? `` : (stryCov_9fa48("100715"), `Pending request tracker at capacity (${maxPendingRequests})`))
}));
const PENDING_REQUEST_VALUE = Object.freeze(stryMutAct_9fa48("100716") ? {} : (stryCov_9fa48("100716"), {
  ZERO: NUM.ZERO
}));
export { PARTITION_ENTITY_TYPE, PARTITION_RAFT_ROLE, PARTITION_REQUEST_TYPE, PARTITION_STATE, PARTITION_SUBSYSTEM, KEY_RANGE_ERROR_MSG, KEY_RANGE_LOG_MSG, PENDING_REQUEST_DEFAULT, PENDING_REQUEST_ERROR_MSG, PENDING_REQUEST_LOG_MSG, PENDING_REQUEST_VALUE, SPLIT_MERGE_DEFAULT, SPLIT_MERGE_ERROR_MSG, SPLIT_MERGE_EVENT, SPLIT_MERGE_ID, SPLIT_MERGE_LOG_MSG, SPLIT_MERGE_REASON, SPLIT_MERGE_SQL, SPLIT_MERGE_STATE, PARTITION_TRANSITION_STATE, RETRYABLE_PARTITION_TRANSITION_STATES, PARTITION_TRANSITION_METADATA_FIELD, PARTITION_SPLIT_MIRROR_ORIGIN, SPLIT_OWNER_MANAGED_PHASES };