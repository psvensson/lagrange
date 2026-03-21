/**
 * Focused facade compatibility tests for RebalanceCoordinator.
 *
 * Validates: Requirements 6.4, 6.5
 * Design: D7.2, D11.2
 *
 * Locks that the coordinator remains a compatibility facade while delegating
 * extracted concerns to repository/workflow/policy owners.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';

function createTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createFacadeCoordinator(overrides = {}) {
  const calls = {
    repository: [],
    workflow: [],
    policy: [],
  };

  const repository = {
    async queryOperationById(operationId) {
      calls.repository.push(['queryOperationById', operationId]);
      return {operationId};
    },
    async queryExistingInFlightOperation(...args) {
      calls.repository.push(['queryExistingInFlightOperation', args]);
      return {args};
    },
    async persistNewOperation(operation) {
      calls.repository.push(['persistNewOperation', operation]);
      return true;
    },
    async persistOperationUpdate(operation, options) {
      calls.repository.push(['persistOperationUpdate', operation, options]);
      return undefined;
    },
    async getAllOperations() {
      calls.repository.push(['getAllOperations']);
      return [{operationId: 'op-a'}];
    },
    async getOperationsByEntity(entityType, entityId) {
      calls.repository.push(['getOperationsByEntity', entityType, entityId]);
      return [{entityType, entityId}];
    },
  };

  const workflowOwner = {
    async claimDispatchTransition(operationId) {
      calls.workflow.push(['claimDispatchTransition', operationId]);
      return {operationId, workflowStep: 'sending'};
    },
    async dispatchOperation(operationInput) {
      calls.workflow.push(['dispatchOperation', operationInput]);
      return {success: true, operationInput};
    },
    async executeOperation(operation) {
      calls.workflow.push(['executeOperation', operation]);
      return {success: true};
    },
    async getMoveSafetyError(move) {
      calls.workflow.push(['getMoveSafetyError', move]);
      return null;
    },
    getTimeoutForStep(step) {
      calls.workflow.push(['getTimeoutForStep', step]);
      return 1234;
    },
  };

  const provisioningAdmissionPolicy = {
    normalizeControlPlaneMutationWorkClass(move) {
      calls.policy.push(['normalizeControlPlaneMutationWorkClass', move]);
      return 'background';
    },
    async checkProvisioningAdmission(move) {
      calls.policy.push(['checkProvisioningAdmission', move]);
      return {allowed: true, decisionType: 'admitted'};
    },
    async ensureProvisioningAdmissionAllowed(context) {
      calls.policy.push(['ensureProvisioningAdmissionAllowed', context]);
      return undefined;
    },
    async evaluateProvisioningAdmission(context) {
      calls.policy.push(['evaluateProvisioningAdmission', context]);
      return {admissionResult: null, estimatedBytes: 0, moveType: null};
    },
    estimateProvisioningAdmissionBytes(entityType) {
      calls.policy.push(['estimateProvisioningAdmissionBytes', entityType]);
      return 64;
    },
    assertProvisioningAdmissionDependencies(moveType) {
      calls.policy.push(['assertProvisioningAdmissionDependencies', moveType]);
      return undefined;
    },
    createProvisioningAdmissionError(move, admissionResult) {
      calls.policy.push(['createProvisioningAdmissionError', move, admissionResult]);
      return new Error('facade-policy-error');
    },
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
    transactionCoordinator: createTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async upsertSystemTableRow() {
        return {success: true};
      },
      async updateSystemTableRow() {
        return {success: true};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
      getConnectionState() {
        return 'connected';
      },
      async pingNode() {
        return true;
      },
      isOutboundQueueAvailable() {
        return true;
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    repository,
    workflowOwner,
    provisioningAdmissionPolicy,
    enableTimeouts: false,
    ...overrides,
  });

  return {coordinator, calls};
}

test('RebalanceCoordinator facade delegates repository contract methods',
  async (t) => {
    const {coordinator, calls} = createFacadeCoordinator();

    const byId = await coordinator.queryOperationById('op-1');
    t.equal(byId.operationId, 'op-1');

    const inFlight = await coordinator.queryExistingInFlightOperation(
      'partition-1',
      'node-2',
      'partition',
      'partition-1',
      {type: 'ADD', partitionId: 'partition-1', nodeId: 'node-2'},
    );
    t.equal(
      typeof inFlight.args[5],
      'function',
      'coordinator should pass move-intent matcher callback to repository',
    );

    const inserted = await coordinator.persistNewOperation({operationId: 'op-2'});
    t.equal(inserted, true);

    await coordinator.persistOperationUpdate(
      {operationId: 'op-2'},
      {skipWaitForCache: true},
    );
    const allOperations = await coordinator.getAllOperations();
    t.equal(allOperations.length, 1);
    const byEntity = await coordinator.getOperationsByEntity('partition', 'partition-1');
    t.equal(byEntity.length, 1);

    t.same(calls.repository.map(([name]) => name), [
      'queryOperationById',
      'queryExistingInFlightOperation',
      'persistNewOperation',
      'persistOperationUpdate',
      'getAllOperations',
      'getOperationsByEntity',
    ]);
  });

test('RebalanceCoordinator facade delegates workflow contract methods',
  async (t) => {
    const {coordinator, calls} = createFacadeCoordinator();

    const claimResult = await coordinator.claimDispatchTransition('op-1');
    t.equal(claimResult.workflowStep, 'sending');

    const dispatchResult = await coordinator.dispatchOperation({operationId: 'op-1'});
    t.equal(dispatchResult.success, true);

    const executeResult = await coordinator.executeOperation({operationId: 'op-1'});
    t.equal(executeResult.success, true);

    const moveSafetyError = await coordinator.getMoveSafetyError({
      type: 'REMOVE',
      partitionId: 'partition-1',
      nodeId: 'node-2',
    });
    t.equal(moveSafetyError, null);

    const timeoutMs = coordinator.getTimeoutForStep('SYNCING');
    t.equal(timeoutMs, 1234);

    t.same(calls.workflow.map(([name]) => name), [
      'claimDispatchTransition',
      'dispatchOperation',
      'executeOperation',
      'getMoveSafetyError',
      'getTimeoutForStep',
    ]);
  });

test('RebalanceCoordinator facade delegates provisioning policy methods',
  async (t) => {
    const {coordinator, calls} = createFacadeCoordinator();

    const normalizedWorkClass =
      coordinator.normalizeControlPlaneMutationWorkClass({type: 'ADD'});
    t.equal(normalizedWorkClass, 'background');

    const admissionProbe = await coordinator.checkProvisioningAdmission({
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-2',
    });
    t.equal(admissionProbe.allowed, true);

    await coordinator.ensureProvisioningAdmissionAllowed({
      move: {type: 'ADD', nodeId: 'node-2'},
      partitionId: 'partition-1',
      entityType: 'partition',
      entityId: 'partition-1',
      sourceNodeId: 'node-local',
    });

    const admissionEvaluation = await coordinator.evaluateProvisioningAdmission({
      move: {type: 'ADD', nodeId: 'node-2'},
      partitionId: 'partition-1',
      entityType: 'partition',
      entityId: 'partition-1',
      sourceNodeId: 'node-local',
    });
    t.equal(admissionEvaluation.estimatedBytes, 0);

    const estimatedBytes = coordinator.estimateProvisioningAdmissionBytes('partition');
    t.equal(estimatedBytes, 64);

    coordinator.assertProvisioningAdmissionDependencies('ADD');
    const error = coordinator.createProvisioningAdmissionError(
      {type: 'ADD', nodeId: 'node-2'},
      {allowed: false},
    );
    t.equal(error.message, 'facade-policy-error');

    t.same(calls.policy.map(([name]) => name), [
      'normalizeControlPlaneMutationWorkClass',
      'checkProvisioningAdmission',
      'ensureProvisioningAdmissionAllowed',
      'evaluateProvisioningAdmission',
      'estimateProvisioningAdmissionBytes',
      'assertProvisioningAdmissionDependencies',
      'createProvisioningAdmissionError',
    ]);
  });
