/**
 * Owner contract:
 * Owner: OperationWorkflowOwner owns replica-operation workflow lifecycle progress.
 * Inputs: operation repository state, executor outcomes, readiness, replica status.
 * Canonical output: one workflow owner class with canonical transition methods.
 * Prohibited fallbacks: callers must not import segment classes to bypass this surface.
 * Primary tests: test/rebalancer/replace-replica-workflow.test.js.
 */
export {OperationWorkflowOwnerSegment7 as OperationWorkflowOwner}
  from './operation-workflow-owner-segment-7.js';
