/**
 * Property Tests: Module Manifest Serialization Round-Trips
 *
 * **Validates: Requirements 3.2, 5.2, 10.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  serializeModuleManifest,
  deserializeModuleManifest,
  validateModuleManifest,
  isValidDigest,
} from '../../src/wasm-service/module-manifest-models.js';
import {
  DIGEST_PREFIX,
  DIGEST_HEX_LENGTH,
} from '../../src/wasm-service/module-manifest-constants.js';

// --- Arbitraries ---

/** Generates a valid namespace/name string. */
const nsNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Generates a non-empty alphanumeric-ish identifier string. */
const identifierArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Generates a valid sha256 digest string. */
const digestArb = fc.hexaString({
  minLength: DIGEST_HEX_LENGTH,
  maxLength: DIGEST_HEX_LENGTH,
}).map((hex) => DIGEST_PREFIX + hex.toLowerCase());

/** Generates a semver-like version string. */
const versionArb = fc.tuple(
  fc.nat({max: 99}), fc.nat({max: 99}), fc.nat({max: 99})
).map(([a, b, c]) => `${a}.${b}.${c}`);

/** Generates a capability string like "sql.read". */
const capabilityArb = fc.tuple(identifierArb, identifierArb).map(
  ([ns, name]) => `${ns}.${name}`
);

/** Generates a valid dependency object. */
const dependencyArb = fc.record({
  moduleId: identifierArb,
  digest: digestArb,
});

/**
 * Generates a valid module manifest with composite key
 * (namespace, name, version).
 */
const moduleManifestArb = fc.record({
  runExport: identifierArb,
  extraExports: fc.array(identifierArb, {maxLength: 5}),
  namespace: nsNameArb,
  name: nsNameArb,
  version: versionArb,
  digest: digestArb,
  dependencies: fc.array(dependencyArb, {maxLength: 3}),
  capabilities: fc.array(capabilityArb, {maxLength: 4}),
  createdAt: fc.nat(),
  sourceReference: fc.option(
    fc.stringMatching(/^oci:\/\/[a-z0-9./-]{1,60}$/),
    {nil: null}
  ),
  artifactPointer: fc.option(
    identifierArb, {nil: null}
  ),
}).map((r) => ({
  namespace: r.namespace,
  name: r.name,
  version: r.version,
  digest: r.digest,
  runExport: r.runExport,
  exports: [r.runExport, ...r.extraExports],
  dependencies: r.dependencies,
  capabilities: r.capabilities,
  sourceReference: r.sourceReference,
  artifactPointer: r.artifactPointer,
  createdAt: r.createdAt,
}));

// --- Property Tests ---

test('ModuleManifest serialization round-trip', async (t) => {
  /**
   * *For any* valid ModuleManifest object, serializing to a table
   * row (with JSON-encoded arrays) and deserializing back SHALL
   * produce an equivalent manifest object.
   *
   * **Validates: Requirements 3.2, 10.4**
   */
  t.test('serialize then deserialize produces equivalent object',
    async () => {
      await fc.assert(
        fc.property(
          moduleManifestArb,
          (manifest) => {
            const row = serializeModuleManifest(manifest);
            const result = deserializeModuleManifest(row);

            if (result.namespace !== manifest.namespace) {
              return false;
            }
            if (result.name !== manifest.name) return false;
            if (result.version !== manifest.version) {
              return false;
            }
            if (result.digest !== manifest.digest) return false;
            if (result.runExport !== manifest.runExport) {
              return false;
            }
            if (result.createdAt !== manifest.createdAt) {
              return false;
            }
            if (result.sourceReference !==
                manifest.sourceReference) {
              return false;
            }
            if (result.artifactPointer !==
                manifest.artifactPointer) {
              return false;
            }

            const exportsMatch =
              JSON.stringify(result.exports) ===
              JSON.stringify(manifest.exports);
            if (!exportsMatch) return false;

            const depsMatch =
              JSON.stringify(result.dependencies) ===
              JSON.stringify(manifest.dependencies);
            if (!depsMatch) return false;

            const capsMatch =
              JSON.stringify(result.capabilities) ===
              JSON.stringify(manifest.capabilities);
            if (!capsMatch) return false;

            return true;
          },
        ),
        {numRuns: 10},
      );
    });
});

test('ModuleManifest validation accepts valid manifests',
  async (t) => {
    /**
     * *For any* manifest generated with valid structure, the
     * validator SHALL return valid=true with zero errors.
     *
     * **Validates: Requirements 3.2, 5.2**
     */
    t.test('valid manifests pass validation', async () => {
      await fc.assert(
        fc.property(
          moduleManifestArb,
          (manifest) => {
            const result = validateModuleManifest(manifest);
            return result.valid === true &&
              result.errors.length === 0;
          },
        ),
        {numRuns: 10},
      );
    });
  });

test('Digest validation', async (t) => {
  /**
   * *For any* valid hex string of length 64, prefixed with
   * "sha256:", isValidDigest SHALL return true.
   *
   * **Validates: Requirements 5.2, 10.4**
   */
  t.test('valid digests are accepted', async () => {
    await fc.assert(
      fc.property(
        digestArb,
        (digest) => isValidDigest(digest) === true,
      ),
      {numRuns: 10},
    );
  });
});
