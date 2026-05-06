/**
 * Owner contract:
 * Owner: OperationWorkflowOwner segment 5 owns priority publication safety evidence.
 * Inputs: operation rows, replica rows, partition rows, readiness planning snapshots.
 * Canonical output: remove-safety handoff and priority-recovery decision snapshots.
 * Prohibited fallbacks: no quorum or handoff decision from cache-only evidence.
 * Primary tests: test/rebalancer/rebalance-coordinator-operation-ownership.test.js.
 */
import {OperationWorkflowOwnerSegment5Stage5 as OperationWorkflowOwnerSegment5} from './operation-workflow-owner-segment-5-stage-5.js';

export {
  OperationWorkflowOwnerSegment5,
};
