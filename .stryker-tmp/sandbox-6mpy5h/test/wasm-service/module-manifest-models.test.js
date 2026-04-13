// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDigest,
  validateModuleManifest,
  serializeModuleManifest,
  deserializeModuleManifest,
} from '../../src/wasm-service/module-manifest-models.js';
import {
  MODULE_MANIFEST_FIELD,
  MODULE_DEPENDENCY_FIELD,
  MODULE_MANIFEST_COL,
  DEBUG_ARTIFACT_FIELD,
  DEBUG_ARTIFACT_MODE,
  DIGEST_PREFIX,
  DIGEST_HEX_LENGTH,
  MODULE_MANIFEST_ERROR_MSG,
} from '../../src/wasm-service/module-manifest-constants.js';

const VALID_DIGEST =
  'sha256:' + 'a'.repeat(DIGEST_HEX_LENGTH);
const VALID_DEP_DIGEST =
  'sha256:' + 'b'.repeat(DIGEST_HEX_LENGTH);

function makeValidManifest(overrides = {}) {
  return {
    namespace: 'acme',
    name: 'fraud-policy',
    version: '3.2.0',
    digest: VALID_DIGEST,
    runExport: 'run_batch',
    exports: ['run_batch', 'init', 'teardown'],
    dependencies: [
      {moduleId: 'cap-sql', digest: VALID_DEP_DIGEST},
    ],
    capabilities: ['sql.read', 'sql.write'],
    ...overrides,
  };
}

describe('module-manifest-constants', () => {
  describe('MODULE_MANIFEST_FIELD', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(MODULE_MANIFEST_FIELD));
    });

    it('should have all manifest field names', () => {
      assert.equal(
        MODULE_MANIFEST_FIELD.NAMESPACE, 'namespace',
      );
      assert.equal(MODULE_MANIFEST_FIELD.NAME, 'name');
      assert.equal(MODULE_MANIFEST_FIELD.VERSION, 'version');
      assert.equal(MODULE_MANIFEST_FIELD.DIGEST, 'digest');
      assert.equal(
        MODULE_MANIFEST_FIELD.RUN_EXPORT, 'runExport',
      );
      assert.equal(
        MODULE_MANIFEST_FIELD.EXPORTS, 'exports',
      );
      assert.equal(
        MODULE_MANIFEST_FIELD.DEPENDENCIES, 'dependencies',
      );
      assert.equal(
        MODULE_MANIFEST_FIELD.CAPABILITIES, 'capabilities',
      );
      assert.equal(
        MODULE_MANIFEST_FIELD.DEBUG_ARTIFACT,
        'debugArtifact',
      );
      assert.equal(
        MODULE_MANIFEST_FIELD.SOURCE_REFERENCE,
        'sourceReference',
      );
      assert.equal(
        MODULE_MANIFEST_FIELD.ARTIFACT_POINTER,
        'artifactPointer',
      );
    });
  });

  describe('MODULE_DEPENDENCY_FIELD', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(MODULE_DEPENDENCY_FIELD));
    });

    it('should have module_id and digest', () => {
      assert.equal(
        MODULE_DEPENDENCY_FIELD.MODULE_ID, 'moduleId',
      );
      assert.equal(MODULE_DEPENDENCY_FIELD.DIGEST, 'digest');
    });
  });

  describe('DEBUG_ARTIFACT_FIELD', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(DEBUG_ARTIFACT_FIELD));
    });

    it('should expose debug artifact declaration keys', () => {
      assert.equal(DEBUG_ARTIFACT_FIELD.MODE, 'mode');
      assert.equal(
        DEBUG_ARTIFACT_FIELD.SIDECAR_URI,
        'sidecarUri',
      );
      assert.equal(
        DEBUG_ARTIFACT_FIELD.EMBEDDED_SECTION,
        'embeddedSection',
      );
    });
  });

  describe('DEBUG_ARTIFACT_MODE', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(DEBUG_ARTIFACT_MODE));
    });

    it('should expose valid debug artifact modes', () => {
      assert.equal(DEBUG_ARTIFACT_MODE.EMBEDDED, 'embedded');
      assert.equal(DEBUG_ARTIFACT_MODE.SIDECAR, 'sidecar');
    });
  });

  describe('MODULE_MANIFEST_COL', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(MODULE_MANIFEST_COL));
    });

    it('should have all column names in snake_case', () => {
      assert.equal(
        MODULE_MANIFEST_COL.NAMESPACE, 'namespace',
      );
      assert.equal(MODULE_MANIFEST_COL.NAME, 'name');
      assert.equal(MODULE_MANIFEST_COL.VERSION, 'version');
      assert.equal(MODULE_MANIFEST_COL.DIGEST, 'digest');
      assert.equal(
        MODULE_MANIFEST_COL.RUN_EXPORT, 'run_export',
      );
      assert.equal(MODULE_MANIFEST_COL.EXPORTS, 'exports');
      assert.equal(
        MODULE_MANIFEST_COL.DEPENDENCIES, 'dependencies',
      );
      assert.equal(
        MODULE_MANIFEST_COL.CAPABILITIES, 'capabilities',
      );
      assert.equal(
        MODULE_MANIFEST_COL.SOURCE_REFERENCE,
        'source_reference',
      );
      assert.equal(
        MODULE_MANIFEST_COL.ARTIFACT_POINTER,
        'artifact_pointer',
      );
      assert.equal(
        MODULE_MANIFEST_COL.CREATED_AT, 'created_at',
      );
    });
  });

  describe('MODULE_MANIFEST_ERROR_MSG', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(MODULE_MANIFEST_ERROR_MSG));
    });

    it('should have string values for all keys', () => {
      for (const [key, value] of
        Object.entries(MODULE_MANIFEST_ERROR_MSG)) {
        assert.equal(
          typeof value, 'string',
          `Error message ${key} should be a string`,
        );
      }
    });
  });

  describe('DIGEST_PREFIX', () => {
    it('should be sha256:', () => {
      assert.equal(DIGEST_PREFIX, 'sha256:');
    });
  });

  describe('DIGEST_HEX_LENGTH', () => {
    it('should be 64', () => {
      assert.equal(DIGEST_HEX_LENGTH, 64);
    });
  });
});

describe('isValidDigest', () => {
  it('should accept valid sha256 digest', () => {
    assert.ok(isValidDigest(VALID_DIGEST));
  });

  it('should reject non-string', () => {
    assert.equal(isValidDigest(123), false);
    assert.equal(isValidDigest(null), false);
  });

  it('should reject wrong prefix', () => {
    assert.equal(
      isValidDigest('md5:' + 'a'.repeat(DIGEST_HEX_LENGTH)),
      false,
    );
  });

  it('should reject wrong hex length', () => {
    assert.equal(isValidDigest('sha256:abc'), false);
  });

  it('should reject non-hex characters', () => {
    assert.equal(
      isValidDigest(
        'sha256:' + 'g'.repeat(DIGEST_HEX_LENGTH),
      ),
      false,
    );
  });
});

describe('validateModuleManifest', () => {
  it('should accept a valid manifest', () => {
    const result = validateModuleManifest(makeValidManifest());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject missing namespace', () => {
    const result = validateModuleManifest(
      makeValidManifest({namespace: ''}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.NAMESPACE_REQUIRED,
    ));
  });

  it('should reject missing name', () => {
    const result = validateModuleManifest(
      makeValidManifest({name: ''}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.NAME_REQUIRED,
    ));
  });

  it('should reject invalid namespace format', () => {
    const result = validateModuleManifest(
      makeValidManifest({namespace: '123-BAD'}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.NAMESPACE_INVALID_FORMAT,
    ));
  });

  it('should accept embedded debugArtifact declaration', () => {
    const result = validateModuleManifest(
      makeValidManifest({
        debugArtifact: {
          mode: 'embedded',
          embeddedSection: '.debug_info',
        },
      }),
    );
    assert.equal(result.valid, true);
  });

  it('should reject non-object debugArtifact', () => {
    const result = validateModuleManifest(
      makeValidManifest({
        debugArtifact: 'sidecar',
      }),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.DEBUG_ARTIFACT_INVALID,
    ));
  });

  it('should reject sidecar debugArtifact without sidecarUri',
    () => {
      const result = validateModuleManifest(
        makeValidManifest({
          debugArtifact: {mode: 'sidecar'},
          artifactPointer: '',
        }),
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        MODULE_MANIFEST_ERROR_MSG
          .DEBUG_ARTIFACT_SIDECAR_URI_REQUIRED,
      ));
    });

  it('should accept sidecar debugArtifact with artifactPointer fallback',
    () => {
      const result = validateModuleManifest(
        makeValidManifest({
          debugArtifact: {mode: 'sidecar'},
          artifactPointer: 'oci://debug/acme/mod@sha256:def',
        }),
      );
      assert.equal(result.valid, true);
    });

  it('should reject invalid name format', () => {
    const result = validateModuleManifest(
      makeValidManifest({name: '123-BAD'}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.NAME_INVALID_FORMAT,
    ));
  });

  it('should reject missing version', () => {
    const result = validateModuleManifest(
      makeValidManifest({version: ''}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.VERSION_REQUIRED,
    ));
  });

  it('should reject missing digest', () => {
    const result = validateModuleManifest(
      makeValidManifest({digest: ''}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.DIGEST_REQUIRED,
    ));
  });

  it('should reject invalid digest format', () => {
    const result = validateModuleManifest(
      makeValidManifest({digest: 'bad-digest'}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.DIGEST_INVALID_FORMAT,
    ));
  });

  it('should reject missing run_export', () => {
    const result = validateModuleManifest(
      makeValidManifest({runExport: ''}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.RUN_EXPORT_REQUIRED,
    ));
  });

  it('should reject run_export not in exports', () => {
    const result = validateModuleManifest(
      makeValidManifest({runExport: 'missing_fn'}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.RUN_EXPORT_NOT_IN_EXPORTS,
    ));
  });

  it('should reject empty exports array', () => {
    const result = validateModuleManifest(
      makeValidManifest({exports: []}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.EXPORTS_REQUIRED,
    ));
  });

  it('should reject non-array exports', () => {
    const result = validateModuleManifest(
      makeValidManifest({exports: 'not-array'}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.EXPORTS_REQUIRED,
    ));
  });

  it('should reject dependency without module_id', () => {
    const result = validateModuleManifest(
      makeValidManifest({
        dependencies: [
          {moduleId: '', digest: VALID_DEP_DIGEST},
        ],
      }),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.DEPENDENCY_MODULE_ID_REQUIRED,
    ));
  });

  it('should reject dependency without digest', () => {
    const result = validateModuleManifest(
      makeValidManifest({
        dependencies: [{moduleId: 'cap-sql', digest: ''}],
      }),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.DEPENDENCY_DIGEST_REQUIRED,
    ));
  });

  it('should reject dependency with invalid digest', () => {
    const result = validateModuleManifest(
      makeValidManifest({
        dependencies: [{moduleId: 'cap-sql', digest: 'bad'}],
      }),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG
        .DEPENDENCY_DIGEST_INVALID_FORMAT,
    ));
  });

  it('should reject non-array capabilities', () => {
    const result = validateModuleManifest(
      makeValidManifest({capabilities: 'not-array'}),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.CAPABILITIES_NOT_ARRAY,
    ));
  });

  it('should accept manifest with no dependencies', () => {
    const result = validateModuleManifest(
      makeValidManifest({dependencies: undefined}),
    );
    assert.equal(result.valid, true);
  });

  it('should accept manifest with no capabilities', () => {
    const result = validateModuleManifest(
      makeValidManifest({capabilities: undefined}),
    );
    assert.equal(result.valid, true);
  });
});

describe('serializeModuleManifest / deserializeModuleManifest',
  () => {
    it('should round-trip a full manifest', () => {
      const now = Date.now();
      const manifest = makeValidManifest({
        createdAt: now,
        sourceReference: 'oci://reg.io/acme/fraud@sha256:abc',
        artifactPointer: 'code-ref-123',
      });
      const row = serializeModuleManifest(manifest);
      const result = deserializeModuleManifest(row);
      assert.deepStrictEqual(result, manifest);
    });

    it('should produce snake_case keys in row', () => {
      const row = serializeModuleManifest(makeValidManifest());
      assert.ok(MODULE_MANIFEST_COL.NAMESPACE in row);
      assert.ok(MODULE_MANIFEST_COL.NAME in row);
      assert.ok(MODULE_MANIFEST_COL.VERSION in row);
      assert.ok(MODULE_MANIFEST_COL.DIGEST in row);
      assert.ok(MODULE_MANIFEST_COL.RUN_EXPORT in row);
      assert.ok(MODULE_MANIFEST_COL.EXPORTS in row);
      assert.ok(MODULE_MANIFEST_COL.DEPENDENCIES in row);
      assert.ok(MODULE_MANIFEST_COL.CAPABILITIES in row);
      assert.ok(MODULE_MANIFEST_COL.CREATED_AT in row);
    });

    it('should JSON-encode array fields in row', () => {
      const row = serializeModuleManifest(makeValidManifest());
      assert.equal(
        typeof row[MODULE_MANIFEST_COL.EXPORTS], 'string',
      );
      assert.equal(
        typeof row[MODULE_MANIFEST_COL.DEPENDENCIES],
        'string',
      );
      assert.equal(
        typeof row[MODULE_MANIFEST_COL.CAPABILITIES],
        'string',
      );
      assert.doesNotThrow(
        () => JSON.parse(row[MODULE_MANIFEST_COL.EXPORTS]),
      );
    });

    it('should default empty arrays for missing fields', () => {
      const row = serializeModuleManifest({
        namespace: 'acme',
        name: 'test',
        version: '1.0.0',
        digest: VALID_DIGEST,
        runExport: 'run',
      });
      const result = deserializeModuleManifest(row);
      assert.deepStrictEqual(result.exports, []);
      assert.deepStrictEqual(result.dependencies, []);
      assert.deepStrictEqual(result.capabilities, []);
    });

    it('should deserialize row with empty JSON arrays', () => {
      const row = {
        [MODULE_MANIFEST_COL.NAMESPACE]: 'acme',
        [MODULE_MANIFEST_COL.NAME]: 'test',
        [MODULE_MANIFEST_COL.VERSION]: '1.0.0',
        [MODULE_MANIFEST_COL.DIGEST]: VALID_DIGEST,
        [MODULE_MANIFEST_COL.RUN_EXPORT]: 'run',
        [MODULE_MANIFEST_COL.EXPORTS]: '[]',
        [MODULE_MANIFEST_COL.DEPENDENCIES]: '[]',
        [MODULE_MANIFEST_COL.CAPABILITIES]: '[]',
        [MODULE_MANIFEST_COL.SOURCE_REFERENCE]: null,
        [MODULE_MANIFEST_COL.ARTIFACT_POINTER]: null,
        [MODULE_MANIFEST_COL.CREATED_AT]: 1000,
      };
      const result = deserializeModuleManifest(row);
      assert.equal(result.namespace, 'acme');
      assert.equal(result.name, 'test');
      assert.deepStrictEqual(result.exports, []);
    });
  });
