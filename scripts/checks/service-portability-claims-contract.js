import fs from 'node:fs';
import path from 'node:path';

const CAPABILITY_PATH = 'docs/service-portability-capabilities.json';

const PUBLIC_DOCUMENT_PATHS = Object.freeze([
  'README.md',
  'examples/README.md',
  'docs/current-capabilities-and-limitations.md',
  'docs/service-deployment-guide.md',
  'docs/native-programming-model.md',
]);
const CANONICAL_HUMAN_DOCUMENT_PATH =
  'docs/current-capabilities-and-limitations.md';

const IMPLEMENTATION_EVIDENCE_PATHS = Object.freeze({
  ociDriver: 'src/runtime/oci-container-driver.js',
});

const CAPABILITY_STATE = Object.freeze({
  UNSUPPORTED: 'unsupported',
  SQL_INSTALL_SERVICE: 'sql_install_service',
  GENUINE_WASI_CELL: 'genuine_wasi_component_cell',
  OCI_LIFECYCLE_SCAFFOLD: 'descriptor_and_in_memory_lifecycle_scaffold',
  RUNTIME_NEUTRAL: 'runtime_neutral',
  SHARED: 'shared',
});

const WASI_CELL_EXECUTION_PATH = 'binding_cell_runtime';

const CLAIM_MARKER = Object.freeze({
  CAPABILITY_PAGE: 'Current Capabilities And Limitations',
  PUBLIC_MODEL: 'Artifact / Binding / Cell',
  ONE_SERVICE_API: 'One service API',
  BINDING_DEPLOYMENT: 'Binding source kinds are publicly invocable',
  OCI_EXECUTION_UNAVAILABLE: 'Managed OCI activation remains unsupported',
});

const TEXT_ENCODING_UTF8 = 'utf8';

const IMPLEMENTATION_EVIDENCE_MARKER = Object.freeze({
  OCI_PREPARED_MAP: 'this._prepared = new Map()',
  OCI_RUNNING_SET: 'this._running = new Set()',
});

const CONTRACT_ERROR = Object.freeze({
  VERSION: 'capability contractVersion must be 2',
  SERVICE_API: 'service capability contract must be runtime-neutral',
  WASM_EXTERNAL:
    'wasm_component external installation must be labelled sql_install_service',
  WASM_MANAGED:
    'wasm_component managed execution must be labelled genuine_wasi_component_cell',
  WASM_API: 'wasm_component must use the shared service API',
  WASM_GENUINE:
    'genuineComponentExecution must be true for the binding cell runtime path',
  WASM_GENUINE_PATH:
    'genuineComponentExecutionPath must name the binding cell runtime path',
  OCI_EXTERNAL:
    'oci_container external installation must remain unsupported until cutover',
  OCI_MANAGED:
    'oci_container must identify descriptor/in-memory lifecycle scaffolding',
  OCI_API: 'oci_container must use the shared service API',
  OCI_ACTIVATION:
    'realContainerActivation must remain false until provider cutover',
  EVIDENCE_OCI_DRIVER:
    'OCI driver evidence no longer matches in-memory lifecycle scaffolding',
});

const FORBIDDEN_PUBLIC_CLAIMS = Object.freeze([
  /native_js/iu,
  /JavaScript-envelope/iu,
  /separate OCI (?:service )?API/iu,
  /OCI callback invocation is supported/iu,
  /OCI callbacks can now be invoked by partition_callback/iu,
]);

function addProblem(problems, condition, message) {
  if (!condition) problems.push(message);
}

function validateWasmCapabilities(wasmRuntime, problems) {
  addProblem(problems,
    wasmRuntime?.externalInstall === CAPABILITY_STATE.SQL_INSTALL_SERVICE,
    CONTRACT_ERROR.WASM_EXTERNAL);
  addProblem(problems,
    wasmRuntime?.managedExecution === CAPABILITY_STATE.GENUINE_WASI_CELL,
    CONTRACT_ERROR.WASM_MANAGED);
  addProblem(problems,
    wasmRuntime?.serviceApi === CAPABILITY_STATE.SHARED,
    CONTRACT_ERROR.WASM_API);
  addProblem(problems, wasmRuntime?.genuineComponentExecution === true,
    CONTRACT_ERROR.WASM_GENUINE);
  addProblem(problems,
    wasmRuntime?.genuineComponentExecutionPath === WASI_CELL_EXECUTION_PATH,
    CONTRACT_ERROR.WASM_GENUINE_PATH);
}

function validateOciCapabilities(ociRuntime, problems) {
  addProblem(problems,
    ociRuntime?.externalInstall === CAPABILITY_STATE.UNSUPPORTED,
    CONTRACT_ERROR.OCI_EXTERNAL);
  addProblem(problems,
    ociRuntime?.managedExecution === CAPABILITY_STATE.OCI_LIFECYCLE_SCAFFOLD,
    CONTRACT_ERROR.OCI_MANAGED);
  addProblem(problems,
    ociRuntime?.serviceApi === CAPABILITY_STATE.SHARED,
    CONTRACT_ERROR.OCI_API);
  addProblem(problems, ociRuntime?.realContainerActivation === false,
    CONTRACT_ERROR.OCI_ACTIVATION);
}

function validateCapabilities(capabilities, problems) {
  addProblem(problems, capabilities?.contractVersion === 2,
    CONTRACT_ERROR.VERSION);
  addProblem(problems,
    capabilities?.serviceApi === CAPABILITY_STATE.RUNTIME_NEUTRAL,
    CONTRACT_ERROR.SERVICE_API);
  validateWasmCapabilities(capabilities?.runtimes?.wasm_component, problems);
  validateOciCapabilities(capabilities?.runtimes?.oci_container, problems);
}

function validatePublicDocuments(documents, problems) {
  for (const documentPath of PUBLIC_DOCUMENT_PATHS) {
    const content = documents[documentPath];
    addProblem(problems, typeof content === 'string',
      `missing public claims document: ${documentPath}`);
    if (typeof content !== 'string') continue;
    for (const pattern of FORBIDDEN_PUBLIC_CLAIMS) {
      addProblem(problems, !pattern.test(content),
        `${documentPath} contains forbidden capability claim ${pattern}`);
    }
  }

  const canonicalDocument = documents[CANONICAL_HUMAN_DOCUMENT_PATH] ?? '';
  for (const marker of Object.values(CLAIM_MARKER)) {
    addProblem(problems, canonicalDocument.includes(marker),
      `canonical human capability page is missing marker: ${marker}`);
  }
}

function validateImplementationEvidence(evidence, problems) {
  addProblem(problems,
    evidence.ociDriver.includes(IMPLEMENTATION_EVIDENCE_MARKER.OCI_PREPARED_MAP) &&
      evidence.ociDriver.includes(IMPLEMENTATION_EVIDENCE_MARKER.OCI_RUNNING_SET),
    CONTRACT_ERROR.EVIDENCE_OCI_DRIVER);
}

function evaluateServicePortabilityClaimsContract(input) {
  const problems = [];
  validateCapabilities(input.capabilities, problems);
  validatePublicDocuments(input.documents, problems);
  validateImplementationEvidence(input.evidence, problems);
  return {valid: problems.length === 0, problems};
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(
    path.join(root, relativePath), TEXT_ENCODING_UTF8));
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING_UTF8);
}

function loadServicePortabilityClaimsContract(root = process.cwd()) {
  return {
    capabilities: readJson(root, CAPABILITY_PATH),
    documents: Object.fromEntries(PUBLIC_DOCUMENT_PATHS.map((relativePath) => [
      relativePath,
      readText(root, relativePath),
    ])),
    evidence: Object.fromEntries(Object.entries(IMPLEMENTATION_EVIDENCE_PATHS)
      .map(([key, relativePath]) => [key, readText(root, relativePath)])),
  };
}

function checkServicePortabilityClaimsContract(root = process.cwd()) {
  return evaluateServicePortabilityClaimsContract(
    loadServicePortabilityClaimsContract(root),
  );
}

export {
  CAPABILITY_STATE,
  CLAIM_MARKER,
  evaluateServicePortabilityClaimsContract,
  loadServicePortabilityClaimsContract,
  checkServicePortabilityClaimsContract,
};
