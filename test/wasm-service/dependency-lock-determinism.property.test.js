import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  generateLockId,
  createDependencyLock,
} from '../../src/wasm-service/dependency-lock-service.js';
import {
  serializeDependencyLock,
  deserializeDependencyLock,
} from '../../src/wasm-service/wasm-meta-models.js';
import {
  MODULE_MANIFEST_FIELD as MF,
  DIGEST_PREFIX,
  DIGEST_HEX_LENGTH,
} from '../../src/wasm-service/module-manifest-constants.js';
import {
  DEPENDENCY_LOCK_FIELD as DL,
} from '../../src/wasm-service/wasm-meta-models-constants.js';

const NUM_RUNS = 10;
const HEX_REGEX = /^[a-f0-9]{64}$/;

/**
 * Arbitrary for a valid sha256 digest string.
 */
const digestArb = fc.hexaString({
  minLength: DIGEST_HEX_LENGTH,
  maxLength: DIGEST_HEX_LENGTH,
}).map((hex) => `${DIGEST_PREFIX}${hex.toLowerCase()}`);

/**
 * Arbitrary for a non-empty lowercase alpha-start identifier
 * matching the namespace/name pattern used by the system.
 */
const identArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);

/**
 * Arbitrary for a semver-like version string.
 */
const versionArb = fc.tuple(
  fc.nat({max: 99}),
  fc.nat({max: 99}),
  fc.nat({max: 99}),
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * Arbitrary for a single resolved dependency object.
 */
const depArb = fc.record({
  moduleId: identArb,
  digest: digestArb,
});

/**
 * Arbitrary for an array of resolved dependencies with
 * unique moduleId values.
 */
const depsArb = fc.uniqueArray(depArb, {
  comparator: (a, b) => a.moduleId === b.moduleId,
  maxLength: 5,
});

describe('dependency lock determinism', () => {
  it('same inputs always produce the same lock ID', () => {
    fc.assert(
      fc.property(
        identArb, identArb, versionArb, depsArb,
        (ns, name, version, deps) => {
          const id1 = generateLockId(ns, name, version, deps);
          const id2 = generateLockId(ns, name, version, deps);
          assert.equal(id1, id2);
          assert.match(id1, HEX_REGEX);
        },
      ),
      {numRuns: NUM_RUNS},
    );
  });

  it('different inputs produce different lock IDs', () => {
    fc.assert(
      fc.property(
        identArb, identArb, versionArb, depsArb,
        identArb, identArb, versionArb, depsArb,
        (nsA, nameA, verA, depsA, nsB, nameB, verB, depsB) => {
          const keyA = `${nsA}|${nameA}|${verA}|` +
            JSON.stringify(depsA);
          const keyB = `${nsB}|${nameB}|${verB}|` +
            JSON.stringify(depsB);
          fc.pre(keyA !== keyB);
          const idA = generateLockId(nsA, nameA, verA, depsA);
          const idB = generateLockId(nsB, nameB, verB, depsB);
          assert.notEqual(idA, idB);
        },
      ),
      {numRuns: NUM_RUNS},
    );
  });

  it('lock ID is independent of dependency array order', () => {
    fc.assert(
      fc.property(
        identArb, identArb, versionArb, depsArb,
        (ns, name, version, deps) => {
          fc.pre(deps.length > 1);
          const reversed = [...deps].reverse();
          const id1 = generateLockId(
            ns, name, version, deps,
          );
          const id2 = generateLockId(
            ns, name, version, reversed,
          );
          assert.equal(id1, id2);
        },
      ),
      {numRuns: NUM_RUNS},
    );
  });

  it('serialize/deserialize round-trip preserves lock ID', () => {
    fc.assert(
      fc.property(
        identArb, identArb, versionArb, depsArb,
        (ns, name, version, deps) => {
          const manifest = {
            [MF.NAMESPACE]: ns,
            [MF.NAME]: name,
            [MF.VERSION]: version,
          };
          const result = createDependencyLock(
            manifest, deps,
          );
          assert.equal(result.valid, true);
          const lock = result.lock;
          const row = serializeDependencyLock(lock);
          const restored = deserializeDependencyLock(row);
          const regenerated = generateLockId(
            restored[DL.TARGET_MODULE_NAMESPACE],
            restored[DL.TARGET_MODULE_NAME],
            restored[DL.TARGET_MODULE_VERSION],
            restored[DL.RESOLVED_DEPENDENCIES],
          );
          assert.equal(
            lock[DL.LOCK_ID], regenerated,
          );
        },
      ),
      {numRuns: NUM_RUNS},
    );
  });
});
