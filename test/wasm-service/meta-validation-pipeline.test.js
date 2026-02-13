import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  VALIDATION_STEP,
  VALIDATION_PIPELINE_ERROR_MSG,
  validateCapabilities,
  validateResolvedDependencies,
  buildPublishValidationChain,
  validatePublishPipeline,
} from '../../src/wasm-service/meta-validation-pipeline.js';

/**
 * Build a minimal valid manifest for testing.
 * @param {Object} [overrides] - Fields to override.
 * @return {Object} Valid manifest object.
 */
function buildValidManifest(overrides = {}) {
  return {
    namespace: 'test-ns',
    name: 'test-mod',
    version: '1.0.0',
    digest: 'sha256:' + 'a'.repeat(64),
    runExport: 'handle',
    exports: ['handle'],
    dependencies: [],
    capabilities: [],
    ...overrides,
  };
}

describe('meta-validation-pipeline', () => {
  describe('validatePublishPipeline', () => {
    it('passes for valid manifest with no capabilities', () => {
      const result = validatePublishPipeline({
        manifest: buildValidManifest(),
      });
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('fails for invalid manifest', () => {
      const result = validatePublishPipeline({
        manifest: {namespace: 'x'},
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.includes(
        VALIDATION_PIPELINE_ERROR_MSG.MANIFEST_INVALID,
      ));
    });

    it('fails when capabilities are denied by policy', () => {
      const manifest = buildValidManifest({
        capabilities: ['sql.read', 'kv.write'],
      });
      const mockPolicy = {};
      const result = validatePublishPipeline({
        manifest,
        capabilityPolicy: mockPolicy,
        tenantAllowlist: ['sql.read'],
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        VALIDATION_PIPELINE_ERROR_MSG.CAPABILITIES_DENIED,
      ));
    });

    it('passes when all capabilities are allowed', () => {
      const manifest = buildValidManifest({
        capabilities: ['sql.read'],
      });
      const mockPolicy = {};
      const result = validatePublishPipeline({
        manifest,
        capabilityPolicy: mockPolicy,
        tenantAllowlist: ['sql.read', 'kv.write'],
      });
      assert.equal(result.valid, true);
    });

    it('fails when resolved dependencies lack fields', () => {
      const result = validatePublishPipeline({
        manifest: buildValidManifest(),
        resolvedDependencies: [{moduleId: 'mod-a'}],
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        VALIDATION_PIPELINE_ERROR_MSG.DEPENDENCIES_INVALID,
      ));
    });

    it('passes with valid resolved dependencies', () => {
      const result = validatePublishPipeline({
        manifest: buildValidManifest(),
        resolvedDependencies: [
          {moduleId: 'mod-a', digest: 'sha256:' + 'b'.repeat(64)},
        ],
      });
      assert.equal(result.valid, true);
    });
  });

  describe('validateCapabilities', () => {
    it('passes when no capabilities declared', () => {
      const manifest = buildValidManifest({capabilities: []});
      const result = validateCapabilities(manifest, {}, []);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('passes when capabilityPolicy is null', () => {
      const manifest = buildValidManifest({
        capabilities: ['sql.read'],
      });
      const result = validateCapabilities(
        manifest, null, ['sql.read'],
      );
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('calls enforceCapabilityPolicy when capabilities exist',
      () => {
        const manifest = buildValidManifest({
          capabilities: ['sql.read', 'kv.write'],
        });
        const result = validateCapabilities(
          manifest, {}, ['sql.read'],
        );
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          VALIDATION_PIPELINE_ERROR_MSG.CAPABILITIES_DENIED,
        ));
      });

    it('passes when all capabilities are in allowlist', () => {
      const manifest = buildValidManifest({
        capabilities: ['sql.read'],
      });
      const result = validateCapabilities(
        manifest, {}, ['sql.read', 'kv.write'],
      );
      assert.equal(result.valid, true);
    });
  });

  describe('buildPublishValidationChain', () => {
    it('returns array of step descriptors', () => {
      const chain = buildPublishValidationChain();
      assert.ok(Array.isArray(chain));
      assert.equal(chain.length, 3);
    });

    it('each step has name and validate function', () => {
      const chain = buildPublishValidationChain();
      for (const step of chain) {
        assert.equal(typeof step.name, 'string');
        assert.equal(typeof step.validate, 'function');
      }
    });

    it('steps are in correct order', () => {
      const chain = buildPublishValidationChain();
      assert.equal(chain[0].name, VALIDATION_STEP.MANIFEST);
      assert.equal(chain[1].name, VALIDATION_STEP.CAPABILITIES);
      assert.equal(chain[2].name, VALIDATION_STEP.DEPENDENCIES);
    });

    it('manifest step delegates to validateModuleManifest',
      () => {
        const chain = buildPublishValidationChain();
        const manifestStep = chain[0];
        const validResult = manifestStep.validate({
          manifest: buildValidManifest(),
        });
        assert.equal(validResult.valid, true);

        const invalidResult = manifestStep.validate({
          manifest: {},
        });
        assert.equal(invalidResult.valid, false);
        assert.ok(invalidResult.errors.length > 0);
      });
  });

  describe('validateResolvedDependencies', () => {
    it('passes for null dependencies', () => {
      const result = validateResolvedDependencies(null);
      assert.equal(result.valid, true);
    });

    it('passes for empty array', () => {
      const result = validateResolvedDependencies([]);
      assert.equal(result.valid, true);
    });

    it('passes when all deps have moduleId and digest', () => {
      const result = validateResolvedDependencies([
        {moduleId: 'a', digest: 'sha256:' + 'c'.repeat(64)},
      ]);
      assert.equal(result.valid, true);
    });

    it('fails when dep is missing digest', () => {
      const result = validateResolvedDependencies([
        {moduleId: 'a'},
      ]);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        VALIDATION_PIPELINE_ERROR_MSG.DEPENDENCIES_INVALID,
      ));
    });

    it('fails when dep is missing moduleId', () => {
      const result = validateResolvedDependencies([
        {digest: 'sha256:' + 'd'.repeat(64)},
      ]);
      assert.equal(result.valid, false);
    });
  });

  describe('constants', () => {
    it('VALIDATION_STEP has expected values', () => {
      assert.equal(VALIDATION_STEP.MANIFEST, 'manifest');
      assert.equal(
        VALIDATION_STEP.CAPABILITIES, 'capabilities',
      );
      assert.equal(
        VALIDATION_STEP.DEPENDENCIES, 'dependencies',
      );
    });

    it('VALIDATION_STEP is frozen', () => {
      assert.ok(Object.isFrozen(VALIDATION_STEP));
    });

    it('VALIDATION_PIPELINE_ERROR_MSG is frozen', () => {
      assert.ok(Object.isFrozen(VALIDATION_PIPELINE_ERROR_MSG));
    });
  });
});
