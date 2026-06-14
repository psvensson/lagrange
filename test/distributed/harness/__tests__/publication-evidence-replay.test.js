import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../../../src/bootstrap/system-table-schemas-constants.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from
  '../../../../src/bootstrap/system-partition-classification.js';
import {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {NUM, SERVICE_STATUS, SERVICE_TYPE, STATE} from '../../../../src/constants/index.js';
import {RAFT_ROLE} from '../../../../src/raft/constants.js';
import {
  READINESS_SKIP_DETAIL,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_CAPACITY_LOG_MSG,
} from '../../../../src/rebalancer/storage-capacity-constants.js';
import {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  formatPublicationEvidenceReplaySummary,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE,
  replayPublicationPriorityEvidenceFromReportDir,
} from '../publication-evidence-replay.js';

import {
  buildPublicationEvidenceReplayScenarioConstants,
} from './publication-evidence-replay-scenario-constants.js';
import {
  buildPublicationEvidenceReplaySharedFixtureBuilders,
} from './publication-evidence-replay-shared-fixture-builders.js';
import {
  buildPublicationEvidenceReplayOwnerRepairScenarioBuilders,
} from './publication-evidence-replay-owner-repair-scenario-builders.js';
import {
  buildPublicationEvidenceReplayPublicationPendingScenarioBuilders,
} from './publication-evidence-replay-publication-pending-scenario-builders.js';
import {
  buildPublicationEvidenceReplayRebalancerHandoffScenarioBuilders,
} from './publication-evidence-replay-rebalancer-handoff-scenario-builders.js';
import {
  registerPublicationEvidenceReplayRuntimeAndOwnerTests,
} from './publication-evidence-replay-runtime-and-owner-replay-test-cases.js';
import {
  registerPublicationEvidenceReplayPostAckPublicationPendingTests,
} from './publication-evidence-replay-post-ack-publication-pending-replay-test-cases.js';
import {
  registerPublicationEvidenceReplayReachabilityRebalancerTests,
} from './publication-evidence-replay-reachability-rebalancer-replay-test-cases.js';
const publicationEvidenceReplayTestContext = {
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
  afterEach,
  assert,
  beforeEach,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
  describe,
  formatPublicationEvidenceReplaySummary,
  INITIAL_PARTITION_IDS,
  it,
  join,
  mkdtemp,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE,
  RAFT_ROLE,
  READINESS_SKIP_DETAIL,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
  replayPublicationPriorityEvidenceFromReportDir,
  rm,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STORAGE_CAPACITY_LOG_MSG,
  SYSTEM_TABLE_NAME,
  tmpdir,
  writeFile,
};

Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayScenarioConstants(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplaySharedFixtureBuilders(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayOwnerRepairScenarioBuilders(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayPublicationPendingScenarioBuilders(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayRebalancerHandoffScenarioBuilders(publicationEvidenceReplayTestContext),
);
describe(publicationEvidenceReplayTestContext.REPLAY_TEST_SUITE_NAME, () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(
      tmpdir(),
      publicationEvidenceReplayTestContext.REPLAY_TEST_TEMP_PREFIX,
    ));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  publicationEvidenceReplayTestContext.state = {
    get tempDir() {
      return tempDir;
    },
  };

  registerPublicationEvidenceReplayRuntimeAndOwnerTests(publicationEvidenceReplayTestContext);
  registerPublicationEvidenceReplayPostAckPublicationPendingTests(publicationEvidenceReplayTestContext);
  registerPublicationEvidenceReplayReachabilityRebalancerTests(publicationEvidenceReplayTestContext);
});
