import {unavailableRepairPreparation, preparedRepairBody} from
  './partition-placement-repair-preparation-result.js';
import {RETAINED_COPY_POLICY_STATE as POLICY} from
  './partition-placement-admission-constants.js';
import {operationHoldsPlacementCopyCapacity} from './partition-placement-admission-decision.js';
// Read-only preparation by the actual ledger owner. This grants no effect and
// does not propose, install state, or retain a submitted command.
import {canonicalRetainedPlacementRepair} from './partition-placement-retained-repair.js';
import {buildCurrentRetainedCopyPolicy} from
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
    return unavailableRepairPreparation(PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED);
  }
  const copy = operationHoldsPlacementCopyCapacity(operation);
  const copyPolicy = copy ? buildCurrentRetainedCopyPolicy(
    service.rebalancerLeadershipSink, canonical.statement.operation) : {state: POLICY.NOT_REQUIRED};
  if (copyPolicy.state === POLICY.UNAVAILABLE) {
    return unavailableRepairPreparation(PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE);
  }
  return preparedRepairBody({operation: canonical.statement.operation, copyPolicy},
    {nodeId: service.nodeId, replicaId: service.replicaId});
}

export {requestPlacementRepairPreparation};
