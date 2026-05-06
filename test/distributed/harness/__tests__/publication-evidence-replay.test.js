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
  buildPublicationEvidenceReplayFixture01,
} from './publication-evidence-replay-fixture-01.js';
import {
  buildPublicationEvidenceReplayFixture02,
} from './publication-evidence-replay-fixture-02.js';
import {
  buildPublicationEvidenceReplayFixture03,
} from './publication-evidence-replay-fixture-03.js';
import {
  buildPublicationEvidenceReplayFixture04,
} from './publication-evidence-replay-fixture-04.js';
import {
  buildPublicationEvidenceReplayFixture05,
} from './publication-evidence-replay-fixture-05.js';
import {
  registerPublicationEvidenceReplayCore01Tests,
} from './publication-evidence-replay-core-01-test-cases.js';
import {
  registerPublicationEvidenceReplayCore02Tests,
} from './publication-evidence-replay-core-02-test-cases.js';
import {
  registerPublicationEvidenceReplayCore03Tests,
} from './publication-evidence-replay-core-03-test-cases.js';
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
  buildPublicationEvidenceReplayFixture01(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayFixture02(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayFixture03(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayFixture04(publicationEvidenceReplayTestContext),
);
Object.assign(
  publicationEvidenceReplayTestContext,
  buildPublicationEvidenceReplayFixture05(publicationEvidenceReplayTestContext),
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

  registerPublicationEvidenceReplayCore01Tests(publicationEvidenceReplayTestContext);
  registerPublicationEvidenceReplayCore02Tests(publicationEvidenceReplayTestContext);
  registerPublicationEvidenceReplayCore03Tests(publicationEvidenceReplayTestContext);
});
