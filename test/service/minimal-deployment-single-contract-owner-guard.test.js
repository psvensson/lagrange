import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const SOURCE = Object.freeze({
  architecture: readFileSync(
    'architecture/minimal-deployment-surface.md',
    'utf8',
  ),
  artifact: readFileSync(
    'src/service/external-service-manifest.js',
    'utf8',
  ),
  binding: readFileSync(
    'src/control-plane/owners/deployment-binding-contract.js',
    'utf8',
  ),
  catalog: readFileSync(
    'src/control-plane/owners/service-install-catalog-contract.js',
    'utf8',
  ),
  compiler: readFileSync(
    'src/control-plane/owners/request-binding-service-definition-contract.js',
    'utf8',
  ),
  definitions: readFileSync(
    'src/control-plane/owners/service-definitions-owner.js',
    'utf8',
  ),
  runtime: readFileSync(
    'src/runtime/request-cell-runtime-contract.js',
    'utf8',
  ),
});

test('Artifact has one schema and one validator', () => {
  assert.match(
    SOURCE.artifact,
    /const EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION = 3;/u,
  );
  assert.equal(
    SOURCE.artifact.match(/lagrange\.external-service-manifest\.v\d+/gu)
      ?.length,
    1,
  );
  assert.doesNotMatch(
    SOURCE.artifact,
    /SCHEMA_VERSION_V\d+|schemaV\d+|schemaValidators|LEGACY_|TABLE_ACCESS_SCHEMA/u,
  );
  assert.match(SOURCE.artifact, /const validateSchema = ajv\.compile\(schema\)/u);
});

test('Binding ingress and replay share one schema and one normalizer', () => {
  // The code-first-service-compiler epic (sealed decisions 5 and 7) added
  // schema v3 THROUGH this owner: exactly two accepted versions (2 and 3),
  // one deliberate v3 target fork inside the single normalizer, and no
  // legacy-split normalization paths. The guard pins that exact shape so
  // any further version or fork drift returns to the epic first.
  assert.match(
    SOURCE.binding,
    /const DEPLOYMENT_BINDING_SCHEMA_VERSION = 2;/u,
  );
  assert.match(
    SOURCE.binding,
    /const DEPLOYMENT_BINDING_SCHEMA_VERSION_V3 = 3;/u,
  );
  assert.equal(
    SOURCE.binding.match(
      /const DEPLOYMENT_BINDING_SCHEMA_VERSION\w* = \d+;/gu,
    )?.length,
    2,
  );
  assert.doesNotMatch(
    SOURCE.binding,
    /SCHEMA_VERSION_V(?!3\b)\d+|normalizeLegacy|LEGACY_|elasticity|contexts/u,
  );
  assert.equal(
    SOURCE.binding.match(/function normalizeTargetV\d+/gu)?.length,
    1,
  );
  assert.match(
    SOURCE.binding,
    /const declaration = normalizeDeploymentBinding\(input\);/u,
  );
  assert.match(
    SOURCE.binding,
    /normalizeExternalServiceManifest\(\s*artifact\.manifest/u,
  );
});

test('catalog, compiler, and runtime reject alternate contract shapes', () => {
  assert.match(SOURCE.catalog, /normalizeExternalServiceManifest\(value\)/u);
  assert.doesNotMatch(
    SOURCE.catalog,
    /BINDABLE_MANIFEST_SCHEMA_VERSION|ARTIFACT_NOT_ANALYZABLE/u,
  );
  assert.doesNotMatch(
    `${SOURCE.compiler}\n${SOURCE.definitions}`,
    /buildLegacyActivated|legacyExpected|LEGACY_ELASTICITY/u,
  );
  assert.match(SOURCE.compiler, /normalizeStoredDeploymentBinding/u);
  assert.match(SOURCE.runtime, /normalizeDeploymentBinding/u);
  assert.match(SOURCE.runtime, /normalizeExternalServiceManifest/u);
});

test('architecture declares one current contract per surface', () => {
  assert.match(SOURCE.architecture, /sole Artifact contract is schema v3/u);
  assert.match(SOURCE.architecture, /sole Binding contract is schema v2/u);
  assert.doesNotMatch(
    SOURCE.architecture,
    /remain readable|replay-only decoder|compatibility surface|bytes remain replayable/u,
  );
});
