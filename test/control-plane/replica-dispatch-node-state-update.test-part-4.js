/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {} from '../../src/bootstrap/system-table-schemas-constants.js';
import {} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {} from '../../src/control-plane/control-plane-workload-profile.js';
import {} from '../../src/message-group/message-group-forwarding-owner.js';
import {} from '../../src/rebalancer/replica-operation-repository.js';

import './replica-dispatch-node-state-update.test-part-4-replay-cases.js';
import './replica-dispatch-node-state-update.test-part-4-dispatch-readiness-cases.js';
import './replica-dispatch-node-state-update.test-part-4-ready-sync-recovery-cases.js';
import './replica-dispatch-node-state-update.test-part-4-direct-wakeup-cases.js';
