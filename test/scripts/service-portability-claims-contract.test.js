import tap from 'tap';
import path from 'node:path';

import {
  checkServicePortabilityClaimsContract,
  evaluateServicePortabilityClaimsContract,
  loadServicePortabilityClaimsContract,
} from '../../scripts/checks/service-portability-claims-contract.js';
import {packageExample} from '../../scripts/examples/package-examples.js';

const REHEARSAL_EXAMPLE_DIR = path.join(
  process.cwd(), 'examples/distributed-sql/06-wasm-remote-replica');
const WASM_CORE_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

function evaluateMutation(mutate) {
  const input = structuredClone(loadServicePortabilityClaimsContract());
  const baseline = evaluateServicePortabilityClaimsContract(input);
  if (!baseline.valid) {
    throw new Error(`mutation baseline is invalid: ${baseline.problems.join('; ')}`);
  }
  const before = JSON.stringify(input);
  mutate(input);
  if (JSON.stringify(input) === before) {
    throw new Error('claims mutation did not change its input');
  }
  return evaluateServicePortabilityClaimsContract(input);
}

tap.test('live public capability claims match current runtime evidence', (t) => {
  const result = checkServicePortabilityClaimsContract();
  t.equal(result.valid, true, result.problems.join('\n'));
  t.same(result.problems, []);
  t.end();
});

tap.test('JavaScript envelopes cannot be represented as compiled WASM', (t) => {
  const result = evaluateMutation((input) => {
    input.documents['examples/distributed-sql/README.md'] +=
      '\nThis is a compiled WASM component.\n';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems.join('\n'), /forbidden capability claim/iu);
  t.end();
});

tap.test('native_js cannot become externally installable by documentation drift',
  (t) => {
    const result = evaluateMutation((input) => {
      input.capabilities.runtimes.native_js.externalInstall = 'supported';
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems.join('\n'), /native_js must remain unsupported/iu);
    t.end();
  });

tap.test('OCI callback support cannot be claimed while invocation fails closed',
  (t) => {
    const result = evaluateMutation((input) => {
      input.documents['docs/wasm-services-user-guide.md'] +=
        '\nOCI callback invocation is supported.\n';
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems.join('\n'), /forbidden capability claim/iu);
    t.end();
  });

tap.test('legacy example must remain explicitly labelled as a rehearsal', (t) => {
  const result = evaluateMutation((input) => {
    delete input.example.manifest.artifactContract;
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems.join('\n'), /js_callback_envelope_rehearsal/iu);
  t.end();
});

tap.test('runtime implementation drift requires a capability-contract update',
  (t) => {
    const result = evaluateMutation((input) => {
      input.evidence.callbackCompiler = input.evidence.callbackCompiler
        .replace('new Function(', 'compileComponent(');
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems.join('\n'), /JavaScript evaluation/iu);
    t.end();
  });

const SEMANTIC_FALSE_CLAIMS = Object.freeze([
  'The active runtime executes distributed functions as genuine WebAssembly modules.',
  'Third-party WASM services can be installed from external manifests today.',
  'OCI callbacks can now be invoked by partition_callback.',
  'WASM is one execution format in the system.',
  'WASM matters here because it is a useful unit for sandboxed, portable, replicable compute.',
]);

for (const falseClaim of SEMANTIC_FALSE_CLAIMS) {
  tap.test(`semantic false claim is rejected: ${falseClaim}`, (t) => {
    const result = evaluateMutation((input) => {
      input.documents['README.md'] += `\n${falseClaim}\n`;
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems[0], /forbidden capability claim/iu);
    t.end();
  });
}

tap.test('actual rehearsal packages JavaScript bytes, not a WASM binary',
  async (t) => {
    const packaged = await packageExample(REHEARSAL_EXAMPLE_DIR);
    const envelope = JSON.parse(packaged.codeBlob);
    const encodedBytes = Buffer.from(envelope.wasmBytesBase64, 'base64');
    const sourceBytes = Buffer.from(packaged.source, 'utf8');

    t.equal(packaged.runtimeKind, 'wasm_component');
    t.equal(envelope.format, 'js_wasm_component_v1');
    t.equal(envelope.source, packaged.source);
    t.same(encodedBytes, sourceBytes);
    t.notSame(encodedBytes.subarray(0, WASM_CORE_MAGIC.length), WASM_CORE_MAGIC);
    t.match(packaged.source, /artifactEnvelopeExecuted/iu);
    t.notMatch(packaged.source, /wasmCompiled/iu);
  });
