/**
 * Probe helpers for the Binding v3 guard test: drive the REAL owners
 * (request-binding service-definition owner for the runtime config,
 * request-cell runtime contract for the readiness projection) with a
 * minimal in-memory binding row + artifact, so the test asserts the
 * owners' own behavior rather than a reimplementation.
 */
import {
  buildRequestBindingServiceDefinition,
} from
  '../../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  buildBindingRow,
} from '../../../src/control-plane/owners/deployment-binding-contract.js';
import {
  projectRequestCellRuntime,
} from '../../../src/runtime/request-cell-runtime-contract.js';

const TEST_PACKAGE_ID = `service-package-${'a'.repeat(64)}`;
const TEST_MANIFEST_DIGEST = `sha256:${'b'.repeat(64)}`;
const TEST_ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const PROBE_SECURITY_CONTEXT = Object.freeze({
  principal: 'tester',
  roles: Object.freeze(['application']),
  tenantId: 'tenant-a',
});
const PROBE_CREATED_AT = 1_700_000_000_000;

function artifactFor(manifest) {
  return {
    artifactDigest: TEST_ARTIFACT_DIGEST,
    manifest,
    manifestDigest: TEST_MANIFEST_DIGEST,
    packageId: TEST_PACKAGE_ID,
  };
}

// The runtime config the service-definition owner derives for the bound
// declaration — for v3 it must carry the derived fixed export plus the
// handler id. The row is built by the binding owner itself so its
// identity fields stay self-consistent.
function buildRuntimeConfigProbe(boundDeclaration, manifest) {
  const row = buildBindingRow(
    boundDeclaration, PROBE_SECURITY_CONTEXT, PROBE_CREATED_AT);
  const definition = buildRequestBindingServiceDefinition(
    row, artifactFor(manifest));
  return definition.runtime_config;
}

// The request-cell runtime contract's projection of the definition: the
// readiness proof that the derived export + handler id reach the Cell.
function projectRequestCellRuntimeProbe({
  binding,
  bindingRow,
  manifest,
  runtimeConfig,
}) {
  return projectRequestCellRuntime({
    binding_digest: bindingRow.binding_digest,
    binding_projection: JSON.stringify({
      binding_digest: bindingRow.binding_digest,
      binding_version_id: bindingRow.binding_version_id,
      declaration: {...binding, capabilities: []},
      tenant_id: bindingRow.tenant_id,
    }),
    binding_version_id: bindingRow.binding_version_id,
    manifest,
    resource_budget: JSON.stringify(binding.budgets),
    runtime_config: runtimeConfig,
    runtime_kind: 'wasm_component',
    runtime_ref: `${manifest.artifact.ref}@${TEST_ARTIFACT_DIGEST}`,
    service_id: 'service-test',
  });
}

export {buildRuntimeConfigProbe, projectRequestCellRuntimeProbe};
