import {test} from '../../src/test-helpers/tap.js';
import {
  ARTIFACT_FORMAT,
  buildJsWasmComponentArtifact,
  parseCallbackModuleArtifact,
} from '../../src/query/callback-module-artifact.js';

test('callback module artifact - build and parse js_wasm_component_v1', async (t) => {
  const source = '\'use strict\';\nmodule.exports.run = async () => [];';
  const runExport = 'run';

  const artifactBlob = buildJsWasmComponentArtifact(source, runExport);
  const parsed = parseCallbackModuleArtifact(artifactBlob);

  t.equal(parsed.format, ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1);
  t.equal(parsed.source, source);
  t.equal(Buffer.isBuffer(parsed.wasmBytes), true);
  t.equal(parsed.runExport, runExport);
  t.same(parsed.exports, [runExport]);
});

test('callback module artifact - raw source fallback', async (t) => {
  const source = '\'use strict\';\nmodule.exports.run = async () => [];';
  const parsed = parseCallbackModuleArtifact(source);

  t.equal(parsed.format, null);
  t.equal(parsed.source, source);
  t.equal(Buffer.isBuffer(parsed.wasmBytes), true);
  t.equal(parsed.runExport, null);
  t.same(parsed.exports, []);
});
