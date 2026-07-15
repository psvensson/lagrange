/**
 * Versioned structural contract for externally installable service manifests.
 *
 * This owner validates and normalizes manifest data only. Artifact resolution,
 * digest comparison, signature policy, persistence, and activation belong to
 * downstream owners.
 */

import Ajv from 'ajv';

import {RUNTIME_KIND} from '../constants/runtime.js';

const EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION = 1;

const EXTERNAL_SERVICE_MEDIA_TYPE = Object.freeze({
  OCI_CONTAINER: 'application/vnd.oci.image.manifest.v1+json',
  WASM_COMPONENT: 'application/wasm',
});

const EXTERNAL_SERVICE_MANIFEST_ERROR_CODE = Object.freeze({
  INVALID_FIELD: 'invalid_field',
  INVALID_ARTIFACT_REF: 'invalid_artifact_ref',
  INVALID_DIGEST: 'invalid_digest',
  MANIFEST_NOT_JSON: 'manifest_not_json',
  MANIFEST_NOT_OBJECT: 'manifest_not_object',
  REQUIRED_FIELD: 'required_field',
  RUNTIME_MEDIA_MISMATCH: 'runtime_media_mismatch',
  UNSUPPORTED_ARTIFACT_TYPE: 'unsupported_artifact_type',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  UNSUPPORTED_RUNTIME_KIND: 'unsupported_runtime_kind',
  UNSUPPORTED_SCHEMA_VERSION: 'unsupported_schema_version',
});

const EXTERNAL_SERVICE_MANIFEST_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

const JSON_SCHEMA_KEYWORD = Object.freeze({
  CONST: 'const',
  REQUIRED: 'required',
});

const EXTERNAL_SERVICE_MANIFEST_PATH = Object.freeze({
  ARTIFACT_DIGEST: '/artifact/digest',
  ARTIFACT_MEDIA_TYPE: '/artifact/media_type',
  ARTIFACT_REF: '/artifact/ref',
  ARTIFACT_TYPE: '/artifact/type',
  ROOT: '/',
  RUNTIME_KIND: '/runtime/kind',
  SCHEMA_VERSION: '/schema_version',
});

const EXTERNAL_SERVICE_MANIFEST_MESSAGE = Object.freeze({
  INVALID_SCHEMA_VALUE: 'is invalid',
  NOT_JSON_OBJECT: 'external service manifest must be a JSON object',
  NOT_NORMALIZED_JSON_OBJECT:
    'external service manifest must normalize to a JSON object',
  NOT_SERIALIZABLE_JSON:
    'external service manifest must contain serializable JSON data',
});

const EXPECTED_MEDIA_TYPE = Object.freeze({
  [RUNTIME_KIND.OCI_CONTAINER]: EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER,
  [RUNTIME_KIND.WASM_COMPONENT]: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
});

const STRING_ARRAY_SCHEMA = {
  type: 'array',
  items: {type: 'string', minLength: 1},
  uniqueItems: true,
};

const schema = {
  $id: 'lagrange.external-service-manifest.v1',
  type: 'object',
  required: ['schema_version', 'name', 'version', 'artifact', 'runtime'],
  additionalProperties: true,
  properties: {
    schema_version: {
      type: 'integer',
      const: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    },
    name: {
      type: 'string',
      pattern: '^[a-z][a-z0-9-]{0,127}$',
    },
    version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+' +
        '(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$',
    },
    display_name: {type: 'string', minLength: 1},
    publisher: {type: 'string', minLength: 1},
    description: {type: 'string'},
    artifact: {
      type: 'object',
      required: ['type', 'ref', 'digest', 'media_type'],
      additionalProperties: true,
      properties: {
        type: {const: 'oci'},
        ref: {type: 'string', pattern: '^\\S+$'},
        digest: {type: 'string', pattern: '^sha256:[0-9a-f]{64}$'},
        media_type: {
          enum: Object.values(EXTERNAL_SERVICE_MEDIA_TYPE),
        },
        size_bytes: {type: 'integer', minimum: 0},
        signature: {type: 'object'},
      },
    },
    runtime: {
      type: 'object',
      required: ['kind'],
      additionalProperties: true,
      properties: {
        kind: {enum: Object.keys(EXPECTED_MEDIA_TYPE)},
        entrypoint: {type: 'string', minLength: 1},
        runtime_options: {type: 'object'},
      },
    },
    replication: {
      type: 'object',
      additionalProperties: true,
      properties: {
        mode: {
          enum: ['replicated_service', 'singleton', 'sharded'],
        },
        replicas: {type: 'integer', minimum: 1},
        placement: {type: 'object'},
        failover_policy: {type: 'object'},
      },
    },
    capabilities: STRING_ARRAY_SCHEMA,
    compatibility: {
      type: 'object',
      additionalProperties: true,
      properties: {
        kernel_api: {type: 'string', minLength: 1},
        cluster_min_version: {type: 'string', minLength: 1},
        cluster_max_version: {type: 'string', minLength: 1},
        requires_features: STRING_ARRAY_SCHEMA,
        edition: {type: 'string', minLength: 1},
      },
    },
    config_schema: {
      type: 'object',
      required: ['schema_version', 'format', 'schema'],
      additionalProperties: true,
      properties: {
        schema_version: {type: 'integer', minimum: 1},
        format: {const: 'json-schema'},
        schema: {type: 'object'},
      },
    },
    upgrade: {
      type: 'object',
      additionalProperties: true,
      properties: {
        strategy: {enum: ['rolling', 'canary', 'all_at_once']},
        max_unavailable: {type: 'integer', minimum: 0},
        requires_drain: {type: 'boolean'},
        requires_data_migration: {type: 'boolean'},
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'name'],
        additionalProperties: true,
        properties: {
          type: {enum: ['service', 'kernel_feature']},
          name: {type: 'string', minLength: 1},
          version: {type: 'string', minLength: 1},
        },
      },
    },
    health: {
      type: 'object',
      additionalProperties: true,
      properties: {
        startup_probe: {type: 'object'},
        readiness_probe: {type: 'object'},
        liveness_probe: {type: 'object'},
      },
    },
  },
};

const schemaValidator = new Ajv({allErrors: true, strict: true}).compile(schema);
const EXTERNAL_SERVICE_MANIFEST_SCHEMA = deepFreeze(schema);

const TOP_LEVEL_OPTIONAL_FIELDS = Object.freeze([
  'display_name',
  'publisher',
  'description',
  'replication',
  'capabilities',
  'compatibility',
  'config_schema',
  'upgrade',
  'dependencies',
  'health',
]);

const ARTIFACT_OPTIONAL_FIELDS = Object.freeze(['size_bytes', 'signature']);
const RUNTIME_OPTIONAL_FIELDS = Object.freeze(['entrypoint', 'runtime_options']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]),
  );
}

function copyOptionalFields(target, source, fields) {
  for (const field of fields) {
    if (source[field] !== undefined) {
      target[field] = canonicalizeJson(source[field]);
    }
  }
}

function cloneJsonObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      code: EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.MANIFEST_NOT_OBJECT,
      message: EXTERNAL_SERVICE_MANIFEST_MESSAGE.NOT_JSON_OBJECT,
    };
  }
  try {
    const value = JSON.parse(JSON.stringify(input));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ok: false,
        code: EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.MANIFEST_NOT_OBJECT,
        message: EXTERNAL_SERVICE_MANIFEST_MESSAGE.NOT_NORMALIZED_JSON_OBJECT,
      };
    }
    return {ok: true, value};
  } catch (_error) {
    return {
      ok: false,
      code: EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.MANIFEST_NOT_JSON,
      message: EXTERNAL_SERVICE_MANIFEST_MESSAGE.NOT_SERIALIZABLE_JSON,
    };
  }
}

function pathForSchemaError(error) {
  if (error.keyword !== JSON_SCHEMA_KEYWORD.REQUIRED) {
    return error.instancePath || EXTERNAL_SERVICE_MANIFEST_PATH.ROOT;
  }
  const prefix = error.instancePath || '';
  return `${prefix}/${error.params.missingProperty}`;
}

function codeForSchemaError(error, path) {
  if (error.keyword === JSON_SCHEMA_KEYWORD.REQUIRED) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.REQUIRED_FIELD;
  }
  if (path === EXTERNAL_SERVICE_MANIFEST_PATH.SCHEMA_VERSION &&
      error.keyword === JSON_SCHEMA_KEYWORD.CONST) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_SCHEMA_VERSION;
  }
  if (path === EXTERNAL_SERVICE_MANIFEST_PATH.ARTIFACT_TYPE) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_ARTIFACT_TYPE;
  }
  if (path === EXTERNAL_SERVICE_MANIFEST_PATH.ARTIFACT_REF) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.INVALID_ARTIFACT_REF;
  }
  if (path === EXTERNAL_SERVICE_MANIFEST_PATH.ARTIFACT_DIGEST) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.INVALID_DIGEST;
  }
  if (path === EXTERNAL_SERVICE_MANIFEST_PATH.ARTIFACT_MEDIA_TYPE) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_MEDIA_TYPE;
  }
  if (path === EXTERNAL_SERVICE_MANIFEST_PATH.RUNTIME_KIND) {
    return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_RUNTIME_KIND;
  }
  return EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.INVALID_FIELD;
}

function schemaErrors() {
  return (schemaValidator.errors || []).map((error) => {
    const path = pathForSchemaError(error);
    return {
      code: codeForSchemaError(error, path),
      path,
      message: `${path} ${error.message ||
        EXTERNAL_SERVICE_MANIFEST_MESSAGE.INVALID_SCHEMA_VALUE}`,
    };
  });
}

function mismatchError(manifest) {
  const kind = manifest.runtime?.kind;
  const mediaType = manifest.artifact?.media_type;
  const expected = EXPECTED_MEDIA_TYPE[kind];
  if (!expected || !Object.values(EXTERNAL_SERVICE_MEDIA_TYPE).includes(mediaType) ||
      expected === mediaType) {
    return null;
  }
  return {
    code: EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.RUNTIME_MEDIA_MISMATCH,
    path: EXTERNAL_SERVICE_MANIFEST_PATH.ARTIFACT_MEDIA_TYPE,
    message: `${EXTERNAL_SERVICE_MANIFEST_PATH.ARTIFACT_MEDIA_TYPE} ` +
      `must be ${expected} for runtime ${kind}`,
  };
}

function rejectedResult(errors) {
  const sorted = errors.sort((left, right) =>
    `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`));
  return deepFreeze({
    status: EXTERNAL_SERVICE_MANIFEST_STATUS.REJECTED,
    errors: sorted,
  });
}

function normalizedManifest(manifest) {
  const normalized = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    version: manifest.version,
  };
  copyOptionalFields(normalized, manifest, TOP_LEVEL_OPTIONAL_FIELDS);
  normalized.artifact = {
    type: manifest.artifact.type,
    ref: manifest.artifact.ref,
    digest: manifest.artifact.digest,
    media_type: manifest.artifact.media_type,
  };
  copyOptionalFields(
    normalized.artifact,
    manifest.artifact,
    ARTIFACT_OPTIONAL_FIELDS,
  );
  normalized.runtime = {kind: manifest.runtime.kind};
  copyOptionalFields(normalized.runtime, manifest.runtime, RUNTIME_OPTIONAL_FIELDS);
  return deepFreeze(normalized);
}

function normalizeExternalServiceManifest(input) {
  const clone = cloneJsonObject(input);
  if (!clone.ok) {
    return rejectedResult([{
      code: clone.code,
      path: EXTERNAL_SERVICE_MANIFEST_PATH.ROOT,
      message: clone.message,
    }]);
  }

  const structurallyValid = schemaValidator(clone.value);
  const errors = structurallyValid ? [] : schemaErrors();
  const mismatch = mismatchError(clone.value);
  if (mismatch) errors.push(mismatch);
  if (errors.length > 0) return rejectedResult(errors);

  return deepFreeze({
    status: EXTERNAL_SERVICE_MANIFEST_STATUS.ACCEPTED,
    manifest: normalizedManifest(clone.value),
  });
}

function validateExternalServiceManifest(input) {
  const result = normalizeExternalServiceManifest(input);
  if (result.status === EXTERNAL_SERVICE_MANIFEST_STATUS.REJECTED) {
    return deepFreeze({valid: false, errors: result.errors});
  }
  return deepFreeze({valid: true, manifest: result.manifest});
}

export {
  EXTERNAL_SERVICE_MANIFEST_ERROR_CODE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
  normalizeExternalServiceManifest,
  validateExternalServiceManifest,
};
