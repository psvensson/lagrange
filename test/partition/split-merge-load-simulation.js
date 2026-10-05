/**
 * Deterministic split/merge load simulation for the auto split/merge policy
 * witnesses. The REAL PartitionSplitMergeManager and the REAL managed-split
 * metrics provider (the production QPM authority) run against an injected
 * clock; only the cluster is modelled: partition rows in a list (the
 * durable `partitions` rows, with `created_at` stamped exactly as the split
 * and merge workflows stamp a new child: at the moment the row is written),
 * one local-leader partition service per row whose CDC
 * `eventsGenerated` counter advances with the modelled write load, and
 * split/merge executors that replace rows in one step.
 *
 * The load is uniform over the integer key space [0, KEY_SPACE), so a
 * partition receives the share of the table's QPM its key range covers.
 *
 * Evaluation cadence modes (the measurement must not depend on them):
 *  - `evaluation: 'reactive'` (default): the write-driven evaluation fires
 *    `evaluationsPerSecond` times (default 1) in every second the table
 *    takes writes, plus the periodic timer. Each evaluation asks the
 *    provider about every partition ~3 times (split loop, then left and
 *    right in the merge loop), so even the default exceeds 64 provider
 *    calls per partition per window once a table has two partitions.
 *  - `evaluation: 'periodic-only'`: only the periodic timer
 *    (`partition.evaluationIntervalMs`, 300 s by default) evaluates, as on
 *    a node whose led partitions take no writes.
 */

import {CDC_PIPELINE_METRIC} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY} from '../../src/config/config-key-constants.js';
import {
  PartitionSplitMergeManager,
} from '../../src/partition/partition-split-merge-manager.js';
import {
  createManagedSplitMetricsProvider,
} from '../../src/partition/managed-split-metrics-provider.js';

const KEY_SPACE = 1000;
const TABLE_ID = 'tbl-sim';
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const SIM_START_MS = 1_700_000_000_000;
const EVALUATION_MODE = Object.freeze({
  REACTIVE: 'reactive',
  PERIODIC_ONLY: 'periodic-only',
});
const ALLOW_PRESSURE_GOVERNOR = Object.freeze({
  configure() {},
  evaluate() {
    return {action: 'allow', retryAfterMs: 0};
  },
});

/**
 * Resolve the numeric [start, end) bounds of one partition row.
 * @param {Object} row - Partition row.
 * @return {{start: number, end: number}} Bounds.
 */
function rowBounds(row) {
  return {
    start: row.partition_key_start === null ? 0 :
      Number(row.partition_key_start),
    end: row.partition_key_end === null ? KEY_SPACE :
      Number(row.partition_key_end),
  };
}

/**
 * Build one simulated cluster with a single-partition table.
 * @param {Object} [options={}] - Simulation options.
 * @return {Object} Simulation handle.
 */
function createSplitMergeSimulation(options = {}) {
  let nowMs = options.startMs ?? SIM_START_MS;
  let sequence = 0;
  const rows = [];
  const services = new Map();
  const events = [];
  const counters = new Map();

  const addRow = (start, end, suffix) => {
    sequence += 1;
    const row = {
      partition_id: `${TABLE_ID}-${suffix}${sequence}`,
      table_id: TABLE_ID,
      table_name: 'sim',
      partition_key_start: start === 0 ? null : String(start),
      partition_key_end: end === KEY_SPACE ? null : String(end),
      partition_version: sequence,
      replica_count: 1,
      size_bytes: options.partitionSizeBytes ?? 4096,
      leader_node_id: 'sim-node',
      state: 'ACTIVE',
      created_at: nowMs,
      updated_at: nowMs,
    };
    rows.push(row);
    counters.set(row.partition_id, 0);
    services.set(`${row.partition_id}-r1`, {
      partitionId: row.partition_id,
      isLeader: true,
      getSize: () => row.size_bytes,
      cdcPipelineMetrics: {
        getSnapshot: () => ({
          [CDC_PIPELINE_METRIC.EVENTS_GENERATED]:
            counters.get(row.partition_id),
        }),
      },
    });
    return row;
  };
  const removeRow = (partitionId) => {
    const index = rows.findIndex((row) => row.partition_id === partitionId);
    if (index >= 0) {
      rows.splice(index, 1);
    }
    services.delete(`${partitionId}-r1`);
  };
  const sortedRows = () => [...rows].sort(
    (left, right) => rowBounds(left).start - rowBounds(right).start,
  );

  addRow(0, KEY_SPACE, 'p');

  const executeSplitCandidate = async (partitionId) => {
    const source = rows.find((row) => row.partition_id === partitionId);
    if (!source) {
      return {success: false, state: 'failed', error: 'source missing'};
    }
    const {start, end} = rowBounds(source);
    const median = Math.floor((start + end) / 2);
    removeRow(partitionId);
    addRow(start, median, 'left');
    addRow(median, end, 'right');
    events.push({kind: 'split', atMs: nowMs, partitionId});
    return {success: true, workflowId: `split-${partitionId}`};
  };
  const executeMergeCandidate = async (candidate) => {
    const left = rows.find((row) => row.partition_id === candidate.leftId);
    const right = rows.find((row) => row.partition_id === candidate.rightId);
    if (!left || !right) {
      return {success: false, state: 'failed', error: 'source missing'};
    }
    const start = rowBounds(left).start;
    const end = rowBounds(right).end;
    removeRow(left.partition_id);
    removeRow(right.partition_id);
    addRow(start, end, 'merged');
    events.push({kind: 'merge', atMs: nowMs, candidate});
    return {success: true, workflowId: `merge-${candidate.leftId}`};
  };

  const now = () => nowMs;
  // The provider is composed exactly as the runtime composes it: from the
  // raw configured window and evaluation interval.
  const config = ConfigurationManager.getInstance();
  const buildManager = () => new PartitionSplitMergeManager({
    nodeId: 'sim-node',
    now,
    pressureGovernor: ALLOW_PRESSURE_GOVERNOR,
    listPartitions: () => sortedRows(),
    getPartitionMetrics: createManagedSplitMetricsProvider({
      partitionServices: services,
      now,
      trafficWindowMs: config.get(CONFIG_KEY.PARTITION_TRAFFIC_WINDOW_MS),
      evaluationIntervalMs:
        config.get(CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS),
    }),
    executeSplitCandidate,
    executeMergeCandidate,
    ...options.managerOptions,
  });

  let manager = buildManager();

  /**
   * Apply one second of modelled table load at `qpm` queries per minute.
   * @param {number} qpm - Table-wide queries per minute.
   */
  const applyLoadSecond = (qpm) => {
    const perKey = qpm / MINUTE_MS * SECOND_MS / KEY_SPACE;
    for (const row of rows) {
      const {start, end} = rowBounds(row);
      counters.set(
        row.partition_id,
        counters.get(row.partition_id) + perKey * (end - start),
      );
    }
  };

  const evaluationMode = options.evaluation ?? EVALUATION_MODE.REACTIVE;
  const evaluationsPerSecond = options.evaluationsPerSecond ?? 1;
  const evaluate = async (triggerReason) => {
    const results = await manager.evaluateAllPartitions({
      triggerReason,
      reasonCodes: ['write_activity'],
    });
    if (options.onEvaluation) {
      options.onEvaluation(results, nowMs);
    }
  };

  /**
   * Advance the clock second by second; in the reactive mode the
   * write-driven evaluation fires `evaluationsPerSecond` times each second
   * the table takes writes; the periodic evaluation fires on its own
   * interval in every mode.
   * @param {number} seconds - Seconds to simulate.
   * @param {Function} qpmAt - (elapsedMs) => table-wide QPM this second.
   * @return {Promise<void>}
   */
  const run = async (seconds, qpmAt) => {
    for (let second = 0; second < seconds; second += 1) {
      const qpm = qpmAt(nowMs - (options.startMs ?? SIM_START_MS));
      nowMs += SECOND_MS;
      applyLoadSecond(qpm);
      const periodicDue = Math.floor(nowMs / manager.evaluationIntervalMs) !==
        Math.floor((nowMs - SECOND_MS) / manager.evaluationIntervalMs);
      const reactiveDue = evaluationMode === EVALUATION_MODE.REACTIVE &&
        (qpm > 0 || options.evaluateEverySecond === true);
      if (reactiveDue) {
        for (let index = 0; index < evaluationsPerSecond; index += 1) {
          await evaluate('reactive_request');
        }
      } else if (periodicDue) {
        await evaluate('periodic_timer');
      }
    }
  };

  return {
    get manager() {
      return manager;
    },
    restartManager() {
      manager.shutdown();
      manager = buildManager();
      return manager;
    },
    advance(ms) {
      nowMs += ms;
    },
    now,
    rows,
    events,
    run,
    splitRequest: executeSplitCandidate,
    partitionCount: () => rows.length,
    count: (kind) => events.filter((event) => event.kind === kind).length,
  };
}

export {
  EVALUATION_MODE,
  KEY_SPACE,
  MINUTE_MS,
  SECOND_MS,
  createSplitMergeSimulation,
};
