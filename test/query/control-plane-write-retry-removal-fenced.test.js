// Characterization of the routed control-plane write retry decision for a
// failure whose target member is fenced for removal or retired: in each of its
// three spellings (typed failure code, either refusal text) a deferred
// system-table write is not retried on its partition; an unfenced deferred
// failure is.
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {ERRORS} from '../../src/constants/errors.js';
import {createMockMessageRouter, createMockSystemCache} from './query-executor-test-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const {CONTROL_PLANE_WRITE_RETRY_DECISION_STATE: DECISION} = QUERY_EXECUTOR_SHARED;
const PARTITION_ID = 'nodes-p1';

function systemTableExecutor() {
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
  });
  executor.getPartitionRecord = () => ({partition_id: PARTITION_ID, table_name: 'nodes'});
  return executor;
}

const FENCED_FAILURES = Object.freeze([
  {failureCode: ERRORS.MEMBERSHIP_RECOVERY_RETIRED_MEMBER_FENCED, error: 'refused'},
  {error: `write refused: ${ERRORS.SERVING_ADMISSION_FENCED_FOR_REMOVAL}`},
  {error: `write refused: ${ERRORS.MEMBERSHIP_RECOVERY_RETIRED_MEMBER_FENCED}`},
]);

test('a deferred system-table write fenced for removal is not retried on its partition', (t) => {
  const executor = systemTableExecutor();
  const unfenced = executor.resolveControlPlaneWriteRetryDecision(
    PARTITION_ID, {deferRetry: true, error: 'busy'}, false, null);
  t.equal(unfenced.state, DECISION.DEFER_PARTITION_RETRY, 'an unfenced deferred write is retried');
  for (const failure of FENCED_FAILURES) {
    const decision = executor.resolveControlPlaneWriteRetryDecision(
      PARTITION_ID, {...failure, deferRetry: true}, false, null);
    t.not(decision.state, DECISION.DEFER_PARTITION_RETRY, JSON.stringify(failure));
  }
  t.end();
});
