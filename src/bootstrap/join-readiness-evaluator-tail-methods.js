import {
  createJoinReadinessMeshConnectivityMethods,
} from './join-readiness-mesh-connectivity-methods.js';
import {
  createJoinReadinessReplicaOperationMethods,
} from './join-readiness-replica-operation-methods.js';
import {
  createJoinReadinessEvaluationTailMethods,
} from './join-readiness-evaluation-tail-methods.js';

function createJoinReadinessEvaluatorTailMethods(options = {}) {
  return Object.assign(
    {},
    createJoinReadinessMeshConnectivityMethods(options),
    createJoinReadinessReplicaOperationMethods(options),
    createJoinReadinessEvaluationTailMethods(options),
  );
}

export {createJoinReadinessEvaluatorTailMethods};
