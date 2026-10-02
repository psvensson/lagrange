import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {buildSchemaProvisioningChildIntent} from './schema-provisioning-child-intent.js';

const LOCAL_STR_OBJECT = 'object';

const {OPERATION_METADATA_KEY} = SQL_QUERY_ENGINE_SHARED;

function getInitialPlanningStepEntry(operation) {
  if (!Array.isArray(operation?.stepsHistory)) {
    return null;
  }
  const initialStepEntry = operation.stepsHistory[0];
  if (!initialStepEntry || typeof initialStepEntry !== LOCAL_STR_OBJECT) {
    return null;
  }
  return initialStepEntry;
}

function isDurableSchemaPlanningOperation(schemaJobId, operation) {
  const targetNodeId = String(
    operation?.targetNodeId || operation?.nodeId || '',
  ).trim();
  if (!targetNodeId) {
    return false;
  }
  const deterministicIntent = buildSchemaProvisioningChildIntent(
    schemaJobId,
    targetNodeId,
  );
  if (operation?.operationId !== deterministicIntent.operationIntentId) {
    return false;
  }
  if (operation?.replicaId !== deterministicIntent.replicaIntentId) {
    return false;
  }
  return getInitialPlanningStepEntry(operation)?.[
    OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED
  ] === true;
}

function shouldRetainDurableSchemaPlanningOperations(context, operations) {
  const schemaJobId = String(context?.schemaJobId || '').trim();
  if (!schemaJobId || !Array.isArray(operations) || operations.length === 0) {
    return false;
  }
  return operations.every((operation) =>
    isDurableSchemaPlanningOperation(schemaJobId, operation));
}

export {shouldRetainDurableSchemaPlanningOperations};
