import {OperationType} from '../rebalancer/replica-operation-progress.js';
// Read-only preparation by the actual ledger owner. This grants no effect and
// does not propose, install state, or retain a submitted command.
import {canonicalRetainedPlacementRepair} from './partition-placement-retained-repair.js';
import {buildCurrentRetainedCopyStatement} from
  '../rebalancer/replica-placement-owner-retained-repair-statement.js';
import {PLACEMENT_STATEMENT_VALIDITY} from
  '../rebalancer/replica-placement-owner-admission-statement.js';
import {PLACEMENT_REFUSAL} from '../rebalancer/replica-placement-owner-constants.js';
import {partitionWriteLeadershipRefusalOf} from './partition-service-raft-write-commit.js';

function requestPlacementRepairPreparation(service, {operation}) {
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) return leadership;
  const canonical = canonicalRetainedPlacementRepair({operation});
  if (canonical.validity !== PLACEMENT_STATEMENT_VALIDITY.VALID) {
    return {state: 'unavailable', reason: PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED};
  }
  const copy = operation.completedAt === null &&
    (operation.type === OperationType.ADD || operation.type === OperationType.REPLACE);
  const admissionStatement = copy ? buildCurrentRetainedCopyStatement(
    service.rebalancerLeadershipSink, canonical.statement.operation) : null;
  if (copy && admissionStatement === null) {
    return {state: 'unavailable', reason: PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE};
  }
  return {state: 'prepared', owner: {nodeId: service.nodeId, replicaId: service.replicaId},
    body: {operation: canonical.statement.operation, admissionStatement}};
}

export {requestPlacementRepairPreparation};
