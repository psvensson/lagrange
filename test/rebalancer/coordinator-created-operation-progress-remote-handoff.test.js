import {test} from '../../src/test-helpers/tap.js';
import {
  registerCoordinatorCreatedRemoteHandoffCreateOperationTests,
} from './coordinator-created-operation-progress-remote-handoff-create-operation-test-cases.js';
import {
  registerCoordinatorCreatedRemoteHandoffPriorityRecoveryTests,
} from './coordinator-created-operation-progress-remote-handoff-priority-recovery-test-cases.js';

registerCoordinatorCreatedRemoteHandoffCreateOperationTests({test});
registerCoordinatorCreatedRemoteHandoffPriorityRecoveryTests({test});
