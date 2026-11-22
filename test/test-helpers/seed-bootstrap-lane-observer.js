// Test-only observation of the seed's bootstrap write window, installed in the
// fresh-seed public child before startLagrangeRuntime (line-regression-causes
// stage 3, item 5; stage 4, items C and D): counts every statement executed on
// a replica OUTSIDE raft (a write through PartitionService.executeLocalQuery -
// the CDC bootstrap-direct fallback was its one writer), and counts the
// window's raft writes to the services partition. In every mode it records
// each partition the window writes through the raft lane and whether a
// completed partition-leadership wait of the seed (SeedPartitionsPhase
// #waitForPartitionLeadership, the owned wait) covered that partition before
// the write, and each run of the dynamic-config seeding with the size of every
// list it answered.
//
// Modes:
// - REFUSE: the first window write to the services partition is answered at
//   the raft lane with the partition write kernel's own NOT_LEADER refusal
//   (buildPartitionWriteLeadershipRefusal).
// - DELAY_LEADER:<table> / WITHHOLD_LEADER:<table>: the table's first
//   partition has no observable leader (PartitionService#isLeader reads false)
//   and its raft lane refuses every write with the same NOT_LEADER refusal,
//   until LEADER_DELAY_MS after the seed starts its partition elections
//   (startDeferredBootstrapReplicaElections), resp. never: a leader that
//   appears late, resp. not at all. Its real consensus state is untouched.
// - RESEED_CONFIG: after the runtime returned, the window's dynamic-config
//   seeding service seeds the same definitions once more (afterStart).
import {PartitionService} from '../../src/partition/partition-service.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SeedPartitionsPhase} from '../../src/bootstrap/phases/seed-partitions-phase.js';
import {DynamicConfigService} from '../../src/config/dynamic-config-service.js';
import {CONFIG_SEED_SOURCE} from '../../src/config/config-constants.js';
import {buildPartitionWriteLeadershipRefusal} from
  '../../src/partition/partition-write-kernel.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const SEED_LANE_OBSERVATION = Object.freeze({
  COUNT: 'count-direct-writes',
  REFUSE: 'refuse-first-window-write',
  DELAY_LEADER: 'delay-leader',
  WITHHOLD_LEADER: 'withhold-leader',
  RESEED_CONFIG: 'reseed-config-after-start',
});
const MODE_SEPARATOR = ':';
// Far beyond the window's first write to any table on a normal seed (GCP run 1:
// 3.2 s from the election start to the first service_definitions write, 4.5 s
// to config) and inside the owned wait's 30 s deadline.
const LEADER_DELAY_MS = 20000;
const READ_HEAD = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const SQL_PREVIEW = 80;
const TARGET_PARTITION = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];

function isWrite(sql) {
  return !READ_HEAD.test(String(sql));
}

function leaderHoldMode(kind, tableName) {
  return `${kind}${MODE_SEPARATOR}${tableName}`;
}

function parseMode(mode) {
  const [kind, tableName] = String(mode).split(MODE_SEPARATOR);
  const held = kind === SEED_LANE_OBSERVATION.DELAY_LEADER ||
    kind === SEED_LANE_OBSERVATION.WITHHOLD_LEADER;
  return {kind, heldPartition: held ? INITIAL_PARTITION_IDS[tableName] : null};
}

function listSizes(answer) {
  return Object.fromEntries(Object.entries(answer ?? {})
    .map(([name, value]) => [name, Array.isArray(value) ? value.length : value]));
}

function installLeaderHold(state, kind) {
  const observedLeader = Symbol('observedLeader');
  Object.defineProperty(PartitionService.prototype, 'isLeader', {
    configurable: true,
    get() {
      return state.isHeld(this.partitionId) ? false : this[observedLeader];
    },
    set(value) {
      this[observedLeader] = value;
    },
  });
  const phase = SeedPartitionsPhase.prototype;
  const startElections = phase.startDeferredBootstrapReplicaElections;
  phase.startDeferredBootstrapReplicaElections = function observed(...args) {
    if (state.hold.electionsStartedAt === null) {
      state.hold.electionsStartedAt = Date.now();
      if (kind === SEED_LANE_OBSERVATION.DELAY_LEADER) {
        setTimeout(() => {
          state.hold.releasedAt = Date.now();
        }, LEADER_DELAY_MS).unref();
      }
    }
    return startElections.apply(this, args);
  };
}

function installWaitObserver(state) {
  const phase = SeedPartitionsPhase.prototype;
  const wait = phase.waitForPartitionLeadership;
  phase.waitForPartitionLeadership = async function observed(options = {}) {
    const answer = await wait.call(this, options);
    const requested = options.partitionIds instanceof Set ? [...options.partitionIds] :
      options.partitionIds;
    const covered = Array.isArray(requested) ? requested :
      [...this.delegates.getPartitionServices().values()].map((entry) => entry.partitionId);
    for (const partitionId of covered) state.waited.add(partitionId);
    return answer;
  };
}

function installSeedingObserver(state) {
  const seed = DynamicConfigService.prototype.seedConfiguration;
  DynamicConfigService.prototype.seedConfiguration = async function observed(...args) {
    state.seedingService = this;
    const answer = await seed.apply(this, args);
    state.configSeeding.push(listSizes(answer));
    return answer;
  };
}

function recordRaftWrite(state, partition, sql, params) {
  const statement = {partitionId: partition.partitionId,
    sql: String(sql).slice(0, SQL_PREVIEW), atMs: Date.now() - state.startedAt};
  if (state.isHeld(partition.partitionId)) {
    state.refusedWrites.push({...statement, windowOpen: state.windowOpen});
    return buildPartitionWriteLeadershipRefusal({role: RAFT_ROLE.FOLLOWER},
      partition.partitionId);
  }
  if (!state.windowOpen) return null;
  state.windowPartitions.add(partition.partitionId);
  if (!state.waited.has(partition.partitionId)) {
    state.unwaitedWindowPartitions.add(partition.partitionId);
  }
  if (partition.partitionId === state.hold.partitionId) {
    state.heldPartitionWrites.push(`${sql}|${JSON.stringify(params ?? [])}`);
  }
  if (partition.partitionId === TARGET_PARTITION) {
    state.windowWrites += 1;
    if (state.mode === SEED_LANE_OBSERVATION.REFUSE && state.refused === null) {
      state.refused = {partitionId: partition.partitionId, sql: statement.sql};
      return buildPartitionWriteLeadershipRefusal({role: RAFT_ROLE.FOLLOWER},
        partition.partitionId);
    }
  }
  return null;
}

function installSeedBootstrapLaneObserver(mode) {
  const {kind, heldPartition} = parseMode(mode);
  const state = {mode, startedAt: Date.now(), windowOpen: false, windowWrites: 0,
    refused: null, directWrites: [], waited: new Set(), windowPartitions: new Set(),
    unwaitedWindowPartitions: new Set(), refusedWrites: [], heldPartitionWrites: [],
    configSeeding: [], seedingService: null,
    hold: {partitionId: heldPartition, electionsStartedAt: null, releasedAt: null},
    isHeld: (partitionId) => heldPartition !== null && partitionId === heldPartition &&
      state.hold.releasedAt === null};
  if (heldPartition !== null) installLeaderHold(state, kind);
  installWaitObserver(state);
  installSeedingObserver(state);
  const setBootstrapMode = CDCIntegrationService.prototype.setBootstrapMode;
  CDCIntegrationService.prototype.setBootstrapMode = function observed(enabled, ...rest) {
    state.windowOpen = enabled === true;
    return setBootstrapMode.call(this, enabled, ...rest);
  };
  const executeLocalQuery = PartitionService.prototype.executeLocalQuery;
  PartitionService.prototype.executeLocalQuery = function observed(sql, params) {
    if (isWrite(sql)) {
      state.directWrites.push({partitionId: this.partitionId,
        sql: String(sql).slice(0, SQL_PREVIEW)});
    }
    return executeLocalQuery.call(this, sql, params);
  };
  const executeQuery = PartitionService.prototype.executeQuery;
  PartitionService.prototype.executeQuery = function observed(sql, params, options) {
    const refusal = isWrite(sql) ? recordRaftWrite(state, this, sql, params) : null;
    return refusal === null ? executeQuery.call(this, sql, params, options) :
      Promise.resolve(refusal);
  };
  return {
    async afterStart() {
      if (kind !== SEED_LANE_OBSERVATION.RESEED_CONFIG || state.seedingService === null) {
        return null;
      }
      return listSizes(await state.seedingService.seedConfiguration(
        CONFIG_SEED_SOURCE.SYSTEM, {nowMs: Date.now()}));
    },
    report: () => ({mode, targetPartition: TARGET_PARTITION, windowWrites: state.windowWrites,
      refused: state.refused, directWrites: [...state.directWrites],
      windowPartitions: [...state.windowPartitions].sort(),
      unwaitedWindowPartitions: [...state.unwaitedWindowPartitions].sort(),
      hold: {...state.hold, delayMs: LEADER_DELAY_MS}, refusedWrites: [...state.refusedWrites],
      heldPartitionWrites: [...state.heldPartitionWrites],
      configSeeding: [...state.configSeeding]}),
  };
}

export {SEED_LANE_OBSERVATION, installSeedBootstrapLaneObserver, leaderHoldMode};
