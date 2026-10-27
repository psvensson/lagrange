// One identity derivation shared by authenticated commands and creation lineage.
import {canonicalJson, sha256Json} from
  '../control-plane/owners/service-install-catalog-contract.js';
const SERVICE_LIFECYCLE_ID_KIND = Object.freeze({
  DEFINITION: 'definition', INSTALLATION: 'installation', OPERATION: 'operation', REVISION: 'revision',
});
const DIGEST_PREFIX_LENGTH = 7;
function deriveServiceLifecycleId(kind, value) {
  return `service-${kind}-${sha256Json(canonicalJson(value)).slice(DIGEST_PREFIX_LENGTH)}`;
}
function deriveServiceDefinitionId(tenantId, serviceName) {
  return deriveServiceLifecycleId(SERVICE_LIFECYCLE_ID_KIND.DEFINITION, {tenantId, serviceName});
}
export {SERVICE_LIFECYCLE_ID_KIND, deriveServiceLifecycleId, deriveServiceDefinitionId};
