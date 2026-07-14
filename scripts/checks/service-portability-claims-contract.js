import fs from 'node:fs';
import path from 'node:path';

const CAPABILITY_PATH = 'docs/service-portability-capabilities.json';
const EXAMPLE_MANIFEST_PATH =
  'examples/distributed-sql/06-wasm-remote-replica/example.manifest.json';
const EXAMPLE_SOURCE_PATH =
  'examples/distributed-sql/06-wasm-remote-replica/index.js';
const EXAMPLE_EXPECTED_PATH =
  'examples/distributed-sql/06-wasm-remote-replica/expected.json';

const PUBLIC_DOCUMENT_PATHS = Object.freeze([
  'README.md',
  'examples/README.md',
  'examples/distributed-sql/README.md',
  'docs/README.md',
  'docs/dockerhub-overview.md',
  'docs/wasm-services-user-guide.md',
]);

const IMPLEMENTATION_EVIDENCE_PATHS = Object.freeze({
  callbackArtifact: 'src/query/callback/callback-module-artifact.js',
  callbackCompiler:
    'src/query/sql-query-engine-lifecycle-and-callback-dispatch.js',
  ociDriver: 'src/runtime/oci-container-driver.js',
  ociCallback: 'src/query/callback/callback-runtime-driver-registry.js',
});

const CAPABILITY_STATE = Object.freeze({
  UNSUPPORTED: 'unsupported',
  KERNEL_INTERNAL: 'kernel_internal',
  INTERNAL_SUPPORTED: 'internal_supported',
  LIFECYCLE_SCAFFOLD: 'lifecycle_scaffold',
  JS_ENVELOPE_REHEARSAL: 'javascript_envelope_rehearsal',
  OCI_LIFECYCLE_SCAFFOLD: 'descriptor_and_in_memory_lifecycle_scaffold',
});

const CLAIM_MARKER = Object.freeze({
  CAPABILITY_LINK: 'docs/service-portability-capabilities.json',
  DISCLOSURE: 'Service portability status:',
  JS_NOT_WASM: 'not a WebAssembly binary or component',
  EXTERNAL_INSTALL_UNAVAILABLE:
    'External service installation is not implemented yet',
  OCI_CALLBACK_UNSUPPORTED: 'OCI callback invocation remains unsupported',
});

const LEGACY_ARTIFACT_FORMAT = 'js_wasm_component_v1';
const LEGACY_EXAMPLE_CONTRACT = 'js_callback_envelope_rehearsal';
const LEGACY_EXAMPLE_RESULT = 'artifactEnvelopeExecuted';
const RETIRED_EXAMPLE_RESULT = 'wasmCompiled';
const RUNTIME_KIND_WASM_COMPONENT = 'wasm_component';
const TEXT_ENCODING_UTF8 = 'utf8';

const IMPLEMENTATION_EVIDENCE_MARKER = Object.freeze({
  JS_UTF8_BYTES: 'Buffer.from(source, ARTIFACT_ENCODING.UTF8)',
  JS_COMPILER: 'new Function(',
  OCI_PREPARED_MAP: 'this._prepared = new Map()',
  OCI_RUNNING_SET: 'this._running = new Set()',
  OCI_CALLBACK_FUTURE: 'Future: delegate to OCI runtime',
  OCI_CALLBACK_ERROR: 'REGISTRY_OCI_CONTAINER_GATED',
});

const CONTRACT_ERROR = Object.freeze({
  VERSION: 'capability contractVersion must be 1',
  NATIVE_EXTERNAL:
    'native_js must remain unsupported for external installation',
  NATIVE_MANAGED: 'native_js managed execution must be kernel_internal',
  NATIVE_CALLBACK:
    'native_js callback invocation must be labelled internal_supported',
  WASM_EXTERNAL:
    'wasm_component external installation must remain unsupported until cutover',
  WASM_MANAGED:
    'wasm_component managed execution must be labelled lifecycle_scaffold',
  WASM_CALLBACK:
    'wasm_component callback path must be labelled javascript envelope rehearsal',
  WASM_GENUINE:
    'genuineComponentExecution must remain false until real engine cutover',
  OCI_EXTERNAL:
    'oci_container external installation must remain unsupported until cutover',
  OCI_MANAGED:
    'oci_container must identify descriptor/in-memory lifecycle scaffolding',
  OCI_CALLBACK: 'oci_container callback invocation must remain unsupported',
  OCI_ACTIVATION:
    'realContainerActivation must remain false until provider cutover',
  EXAMPLE_RUNTIME:
    'legacy callback rehearsal must continue to exercise wasm_component routing',
  EXAMPLE_TITLE: 'legacy callback title must identify itself as a rehearsal',
  EVIDENCE_JS_ARTIFACT:
    'callback artifact evidence no longer proves the JS UTF-8 envelope',
  EVIDENCE_JS_COMPILER:
    'callback compiler evidence no longer proves JavaScript evaluation',
  EVIDENCE_OCI_DRIVER:
    'OCI driver evidence no longer matches in-memory lifecycle scaffolding',
  EVIDENCE_OCI_CALLBACK:
    'OCI callback evidence no longer proves fail-closed unsupported invocation',
});

const FORBIDDEN_PUBLIC_CLAIMS = Object.freeze([
  /compiled (?:WebAssembly|WASM) component/iu,
  /native_js is externally installable/iu,
  /OCI callback invocation is supported/iu,
  /services and WASM modules are first-class runtime pieces/iu,
  /WASM Service Groups(?:<br>|\s)+Distributed Compute/iu,
  /Distributed functions run as WebAssembly modules/iu,
  /build, upload,\s+and run distributed WASM services/iu,
  /compute \(JS\/WASM services\)/iu,
  /active runtime executes distributed functions as genuine WebAssembly modules/iu,
  /third-party WASM services can be installed from external manifests today/iu,
  /OCI callbacks can now be invoked by partition_callback/iu,
  /WASM is (?:one|an) execution format in the system/iu,
  /WASM matters here because it is a useful unit for sandboxed, portable, replicable compute/iu,
]);

function addProblem(problems, condition, message) {
  if (!condition) problems.push(message);
}

function validateNativeCapabilities(nativeRuntime, problems) {
  addProblem(problems,
    nativeRuntime?.externalInstall === CAPABILITY_STATE.UNSUPPORTED,
    CONTRACT_ERROR.NATIVE_EXTERNAL);
  addProblem(problems,
    nativeRuntime?.managedExecution === CAPABILITY_STATE.KERNEL_INTERNAL,
    CONTRACT_ERROR.NATIVE_MANAGED);
  addProblem(problems,
    nativeRuntime?.callbackInvocation === CAPABILITY_STATE.INTERNAL_SUPPORTED,
    CONTRACT_ERROR.NATIVE_CALLBACK);
}

function validateWasmCapabilities(wasmRuntime, problems) {
  addProblem(problems,
    wasmRuntime?.externalInstall === CAPABILITY_STATE.UNSUPPORTED,
    CONTRACT_ERROR.WASM_EXTERNAL);
  addProblem(problems,
    wasmRuntime?.managedExecution === CAPABILITY_STATE.LIFECYCLE_SCAFFOLD,
    CONTRACT_ERROR.WASM_MANAGED);
  addProblem(problems,
    wasmRuntime?.callbackInvocation === CAPABILITY_STATE.JS_ENVELOPE_REHEARSAL,
    CONTRACT_ERROR.WASM_CALLBACK);
  addProblem(problems, wasmRuntime?.artifactFormat === LEGACY_ARTIFACT_FORMAT,
    `wasm_component rehearsal must name ${LEGACY_ARTIFACT_FORMAT}`);
  addProblem(problems, wasmRuntime?.genuineComponentExecution === false,
    CONTRACT_ERROR.WASM_GENUINE);
}

function validateOciCapabilities(ociRuntime, problems) {
  addProblem(problems,
    ociRuntime?.externalInstall === CAPABILITY_STATE.UNSUPPORTED,
    CONTRACT_ERROR.OCI_EXTERNAL);
  addProblem(problems,
    ociRuntime?.managedExecution === CAPABILITY_STATE.OCI_LIFECYCLE_SCAFFOLD,
    CONTRACT_ERROR.OCI_MANAGED);
  addProblem(problems,
    ociRuntime?.callbackInvocation === CAPABILITY_STATE.UNSUPPORTED,
    CONTRACT_ERROR.OCI_CALLBACK);
  addProblem(problems, ociRuntime?.realContainerActivation === false,
    CONTRACT_ERROR.OCI_ACTIVATION);
}

function validateCapabilities(capabilities, problems) {
  addProblem(problems, capabilities?.contractVersion === 1,
    CONTRACT_ERROR.VERSION);
  const nativeRuntime = capabilities?.runtimes?.native_js;
  const wasmRuntime = capabilities?.runtimes?.wasm_component;
  const ociRuntime = capabilities?.runtimes?.oci_container;
  validateNativeCapabilities(nativeRuntime, problems);
  validateWasmCapabilities(wasmRuntime, problems);
  validateOciCapabilities(ociRuntime, problems);
}

function validatePublicDocuments(documents, problems) {
  for (const documentPath of PUBLIC_DOCUMENT_PATHS) {
    const content = documents[documentPath];
    addProblem(problems, typeof content === 'string',
      `missing public claims document: ${documentPath}`);
    if (typeof content !== 'string') continue;
    addProblem(problems, content.includes(CLAIM_MARKER.CAPABILITY_LINK),
      `${documentPath} must link the machine-readable capability contract`);
    addProblem(problems, content.includes(CLAIM_MARKER.DISCLOSURE),
      `${documentPath} must carry the service-portability disclosure marker`);
    for (const pattern of FORBIDDEN_PUBLIC_CLAIMS) {
      addProblem(problems, !pattern.test(content),
        `${documentPath} contains forbidden capability claim ${pattern}`);
    }
  }

  const combined = Object.values(documents).join('\n');
  for (const marker of Object.values(CLAIM_MARKER)) {
    addProblem(problems, combined.includes(marker),
      `public documentation is missing capability marker: ${marker}`);
  }
}

function validateLegacyExample(example, problems) {
  addProblem(problems,
    example.manifest?.runtimeKind === RUNTIME_KIND_WASM_COMPONENT,
    CONTRACT_ERROR.EXAMPLE_RUNTIME);
  addProblem(problems,
    example.manifest?.artifactContract === LEGACY_EXAMPLE_CONTRACT,
    `legacy callback rehearsal must declare ${LEGACY_EXAMPLE_CONTRACT}`);
  addProblem(problems,
    typeof example.manifest?.title === 'string' &&
      /rehearsal/iu.test(example.manifest.title),
    CONTRACT_ERROR.EXAMPLE_TITLE);
  addProblem(problems,
    example.source.includes(LEGACY_EXAMPLE_RESULT),
    `legacy callback result must expose ${LEGACY_EXAMPLE_RESULT}`);
  addProblem(problems,
    !example.source.includes(RETIRED_EXAMPLE_RESULT),
    `legacy callback source must not claim ${RETIRED_EXAMPLE_RESULT}`);
  addProblem(problems,
    example.expected?.firstRow?.[LEGACY_EXAMPLE_RESULT] === true,
    `expected output must require ${LEGACY_EXAMPLE_RESULT}`);
  addProblem(problems,
    example.expected?.firstRow?.[RETIRED_EXAMPLE_RESULT] === undefined,
    `expected output must not require ${RETIRED_EXAMPLE_RESULT}`);
}

function validateImplementationEvidence(evidence, problems) {
  addProblem(problems,
    evidence.callbackArtifact.includes(LEGACY_ARTIFACT_FORMAT) &&
      evidence.callbackArtifact.includes(IMPLEMENTATION_EVIDENCE_MARKER.JS_UTF8_BYTES),
    CONTRACT_ERROR.EVIDENCE_JS_ARTIFACT);
  addProblem(problems,
    evidence.callbackCompiler.includes(IMPLEMENTATION_EVIDENCE_MARKER.JS_COMPILER),
    CONTRACT_ERROR.EVIDENCE_JS_COMPILER);
  addProblem(problems,
    evidence.ociDriver.includes(IMPLEMENTATION_EVIDENCE_MARKER.OCI_PREPARED_MAP) &&
      evidence.ociDriver.includes(IMPLEMENTATION_EVIDENCE_MARKER.OCI_RUNNING_SET),
    CONTRACT_ERROR.EVIDENCE_OCI_DRIVER);
  addProblem(problems,
    evidence.ociCallback.includes(
      IMPLEMENTATION_EVIDENCE_MARKER.OCI_CALLBACK_FUTURE) &&
      evidence.ociCallback.includes(
        IMPLEMENTATION_EVIDENCE_MARKER.OCI_CALLBACK_ERROR),
    CONTRACT_ERROR.EVIDENCE_OCI_CALLBACK);
}

function evaluateServicePortabilityClaimsContract(input) {
  const problems = [];
  validateCapabilities(input.capabilities, problems);
  validatePublicDocuments(input.documents, problems);
  validateLegacyExample(input.example, problems);
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
    example: {
      manifest: readJson(root, EXAMPLE_MANIFEST_PATH),
      source: readText(root, EXAMPLE_SOURCE_PATH),
      expected: readJson(root, EXAMPLE_EXPECTED_PATH),
    },
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
