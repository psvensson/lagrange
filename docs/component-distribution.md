# Component Distribution

Package identity, registry mapping, OCI source references,
and dependency lock semantics for WASM module distribution.

## Package Identity

Canonical format: `namespace:name@version`

```
acme:image-resize@1.0.0
myorg:auth-handler@2.1.0-beta.1
```

### Segments

| Segment | Rules | Max Length |
|-----------|---------------------------------------|-----------|
| namespace | Lowercase alpha start, then `[a-z0-9-]` | 128 chars |
| name | Lowercase alpha start, then `[a-z0-9-]` | 128 chars |
| version | Digit start, then `[0-9a-zA-Z.+-]` | 64 chars |

Separators: `:` between namespace and name,
`@` between name and version.

### Validation

`parsePackageReference(ref)` from
`src/wasm-service/package-reference.js` returns:

```javascript
// Success
{ valid: true, namespace: 'acme', name: 'resize', version: '1.0.0' }

// Failure
{ valid: false, errors: ['Namespace must not be empty'] }
```

`formatPackageReference({namespace, name, version})` produces
the canonical string. `validatePackageReference(ref)` checks
validity without returning parsed components.

### Constants

- `PACKAGE_ID_PATTERN` — full regex
  (`src/constants/wasm-meta.js`)
- `PACKAGE_ID_SEPARATOR` — `':'`
- `PACKAGE_VERSION_SEPARATOR` — `'@'`
- `PACKAGE_ID_MAX_LENGTH` — `{NAMESPACE: 128, NAME: 128,
  VERSION: 64}`
- `NAMESPACE_PATTERN`, `PACKAGE_NAME_PATTERN` — segment
  regexes (`src/wasm-service/wasm-meta-models-constants.js`)

## Registry Mapping

Maps a package namespace to a registry URL. Stored in the
`package_registry_mappings` table (keyed by `namespace`).

### Resolution Precedence

1. **Per-package override** — `package_registry_overrides`
   table, keyed by `(namespace, name)`
2. **Namespace mapping** — `package_registry_mappings` table,
   keyed by `namespace`
3. **Default mapping** — a configured fallback registry URL

First match wins. If nothing matches, resolution fails.

### Per-Package Overrides

Override a specific package's registry source independently
of its namespace mapping. Stored in
`package_registry_overrides` with columns `namespace`, `name`,
and `registry_url`.

Lookup key format: `namespace:name`
(built by `buildOverrideKey()` in
`src/wasm-service/registry-resolver.js`).

### Resolution API

`resolvePackageSource(namespace, name, overrides, mappings,
defaultMapping)` from `src/wasm-service/registry-resolver.js`:

```javascript
// Success
{
  resolved: true,
  registryUrl: 'https://registry.example.com',
  source: 'namespace',   // 'override' | 'namespace' | 'default'
  auditInfo: {
    namespace: 'acme',
    source: 'namespace',
    registryUrl: 'https://registry.example.com',
    ruleNamespace: 'acme',
  }
}

// Failure
{
  resolved: false,
  errors: [
    'No registry mapping found for namespace',
    'No default registry mapping configured',
  ]
}
```

Every resolution result includes `auditInfo` for traceability.

### Constants

- `RESOLUTION_SOURCE` — `{OVERRIDE, NAMESPACE, DEFAULT}`
  (`src/wasm-service/registry-resolver.js`)
- `REGISTRY_MAPPING_FIELD` / `REGISTRY_MAPPING_COL` — field
  and column name maps
  (`src/wasm-service/wasm-meta-models-constants.js`)
- `REGISTRY_OVERRIDE_FIELD` / `REGISTRY_OVERRIDE_COL` —
  override field and column name maps

## OCI Source References

OCI-compatible references identify module artifacts in
container registries.

### Supported Formats

```
registry.io/namespace/name:tag
registry.io/namespace/name@sha256:<64-hex-chars>
registry.io/namespace/name:tag@sha256:<64-hex-chars>
```

Components:

| Part | Description |
|------------|----------------------------------------------|
| registry | Host before the first `/` |
| repository | Path after the first `/` |
| tag | After `:` (alphanumeric, dots, hyphens, underscores, 1-128 chars) |
| digest | After `@`, must be `sha256:` + 64 hex chars |

Max reference length: 512 characters.

### Digest Pinning

Activation paths require an immutable digest pin. Tag-only
references are mutable and rejected for activation.

`validateDigestPin(ref)` from
`src/wasm-service/oci-reference.js`:

```javascript
// Pinned — accepted for activation
validateDigestPin(
  'reg.io/acme/resize:1.0@sha256:abcd...64hex'
)
// { valid: true, digest: 'sha256:abcd...64hex' }

// Tag-only — rejected for activation
validateDigestPin('reg.io/acme/resize:1.0')
// {
//   valid: false,
//   errors: [
//     'Activation requires an immutable digest pin',
//     'Tag-only references are mutable; digest pin is required'
//   ]
// }
```

### Parsing and Formatting

`parseOciReference(ref)` returns `{valid, registry,
repository, tag, digest, errors}`.

`formatOciReference({registry, repository, tag, digest})`
reconstructs the string.

### Constants

- `OCI_TAG_PATTERN` — valid tag regex
- `OCI_REFERENCE_MAX_LENGTH` — `512`
- `OCI_REFERENCE_ERROR` — all error message constants
- All from `src/wasm-service/oci-reference.js`
- `DIGEST_PREFIX` (`'sha256:'`), `DIGEST_HEX_LENGTH` (`64`)
  from `src/wasm-service/module-manifest-constants.js`

## Dependency Locking

Dependency locks capture the exact resolved digests for a
module's dependencies at a point in time. Stored in the
`module_dependency_locks` table.

### Lock Identity

Lock IDs are deterministic: a SHA-256 hash of the module's
`{namespace, name, version}` plus the sorted resolved
dependency list. Same inputs always produce the same lock ID.

Generated by `generateLockId()` in
`src/wasm-service/dependency-lock-service.js`.

### Lock Record Structure

```javascript
{
  lockId: '<deterministic-sha256-hex>',
  targetModuleNamespace: 'acme',
  targetModuleName: 'resize',
  targetModuleVersion: '1.0.0',
  targetServiceId: 'svc-123',  // optional
  resolvedDependencies: [
    { moduleId: 'acme:utils', digest: 'sha256:abc...' },
    { moduleId: 'acme:codec', digest: 'sha256:def...' },
  ]
}
```

### Creating Locks

`createDependencyLock(manifest, resolvedDependencies,
serviceId)` validates and returns a lock object:

```javascript
const {valid, lock, errors} = createDependencyLock(
  manifest, resolvedDeps, 'svc-123'
);
```

`buildInsertLockSQL(lock)` produces a SQL INSERT statement
with parameters for persistence via the SQL engine.

### Drift Detection

`validateLockConsistency(currentLock, newResolvedDeps)`
compares new resolution results against an existing lock:

- **Digest changed** — a dependency's digest differs from the
  locked value → `DEPENDENCY_VERSION_MUTABLE` error
- **New dependency** — a dependency appears that was not in
  the lock → `UNDECLARED_IMPORT` error

```javascript
const result = validateLockConsistency(existingLock, newDeps);
// {
//   valid: false,
//   errors: ['Dependency version changed...'],
//   driftedDependencies: [{
//     moduleId: 'acme:utils',
//     lockedDigest: 'sha256:old...',
//     newDigest: 'sha256:new...',
//     reason: 'changed',
//   }]
// }
```

### Explicit Rollout Bypass

`validateActivationLock(manifest, existingLock, resolvedDeps,
isExplicitRollout)` skips drift checks when
`isExplicitRollout` is `true`, allowing intentional lock
updates during rollouts.

### Lock Queries

- `buildSelectLockSQL(lockId)` — single lock by ID
- `buildSelectLocksByModuleSQL(ns, name, version)` — all
  locks for a module identity
- `buildSelectLocksByServiceSQL(serviceId)` — all locks tied
  to a service

All return `{sql, params}` for execution via the SQL engine.

### Dependency Resolution

Before locking, dependencies are resolved by
`resolveDependencies(manifest, availableModules)` from
`src/wasm-service/dependency-resolver.js`:

1. Each declared dependency must exist in `availableModules`
2. The resolved module's digest must match the pinned digest
   in the manifest
3. Undeclared imports (runtime imports not in the manifest's
   dependency list) are rejected by
   `detectUndeclaredImports()`

All resolution decisions are recorded in an audit log with
`RESOLUTION_DECISION` values (`RESOLVED` or `REJECTED`).
