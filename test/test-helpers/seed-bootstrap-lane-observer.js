// Test-only observation of the seed's bootstrap write window, installed in the
// fresh-seed public child before startLagrangeRuntime (line-regression-causes
// stage 3, item 5): counts every statement executed on a replica OUTSIDE raft
// (a write through PartitionService.executeLocalQuery - the CDC
// bootstrap-direct fallback is its one writer), and counts the window's raft
// writes to the services partition. In REFUSE mode the first such raft write
// in the window is answered at the raft lane with the partition write kernel's
// own NOT_LEADER refusal (buildPartitionWriteLeadershipRefusal): the
// leaderless-window failure the fallback arm was written for. Nothing else is
// replaced.
import {PartitionService} from '../../src/partition/partition-service.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {buildPartitionWriteLeadershipRefusal} from
  '../../src/partition/partition-write-kernel.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const SEED_LANE_OBSERVATION = Object.freeze({
  COUNT: 'count-direct-writes',
  REFUSE: 'refuse-first-window-write',
});
const READ_HEAD = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const SQL_PREVIEW = 80;
const TARGET_PARTITION = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];

function isWrite(sql) {
  return !READ_HEAD.test(String(sql));
}

function installSeedBootstrapLaneObserver(mode) {
  const state = {windowOpen: false, windowWrites: 0, refused: null, directWrites: []};
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
    if (state.windowOpen && isWrite(sql) && this.partitionId === TARGET_PARTITION) {
      state.windowWrites += 1;
      if (mode === SEED_LANE_OBSERVATION.REFUSE && state.refused === null) {
        state.refused = {partitionId: this.partitionId, sql: String(sql).slice(0, SQL_PREVIEW)};
        return Promise.resolve(buildPartitionWriteLeadershipRefusal(
          {role: RAFT_ROLE.FOLLOWER}, this.partitionId));
      }
    }
    return executeQuery.call(this, sql, params, options);
  };
  return {
    report: () => ({mode, targetPartition: TARGET_PARTITION, windowWrites: state.windowWrites,
      refused: state.refused, directWrites: [...state.directWrites]}),
  };
}

export {SEED_LANE_OBSERVATION, installSeedBootstrapLaneObserver};
