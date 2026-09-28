const SCHEMA_PROVISIONING_CHILD_INTENT_KIND = Object.freeze({
  OPERATION: 'operation',
  REPLICA: 'replica',
});

function buildSchemaProvisioningChildIntentId(jobId, targetNodeId, kind) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) return null;
  return `${normalizedJobId}:${kind}:${String(targetNodeId || '').trim()}`;
}

function buildSchemaProvisioningChildIntent(jobId, targetNodeId) {
  return Object.freeze({
    operationIntentId: buildSchemaProvisioningChildIntentId(
      jobId,
      targetNodeId,
      SCHEMA_PROVISIONING_CHILD_INTENT_KIND.OPERATION,
    ),
    replicaIntentId: buildSchemaProvisioningChildIntentId(
      jobId,
      targetNodeId,
      SCHEMA_PROVISIONING_CHILD_INTENT_KIND.REPLICA,
    ),
  });
}

export {
  buildSchemaProvisioningChildIntent,
};
