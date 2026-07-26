# External Service Manifest

The sole external service manifest is schema version 3, implemented by
[`external-service-manifest.js`](../src/service/external-service-manifest.js).
The manifest carries immutable executable identity and typed exports. It does
not carry Cell replica shape or table-access authority.

## Required Shape

A manifest requires:

- `schema_version: 3`;
- canonical `name` and semantic `version`;
- `artifact`;
- `runtime`; and
- at least one `exports` entry.

The artifact has `type: "oci"`, a non-empty `ref`, a lowercase pinned
`sha256:` digest, and one supported media type:

| Runtime kind | Required artifact media type |
| --- | --- |
| `wasm_component` | `application/wasm` |
| `oci_container` | `application/vnd.oci.image.manifest.v1+json` |

`native_js` is kernel-internal and is rejected at external manifest ingress.
Runtime kind and media type must match.

Each export has exactly `name` and `interface`. Export names are unique and use
the manifest's lowercase identifier grammar. The closed interface vocabulary
is:

- `request_v1`
- `change_v1`
- `call_v1`
- `pushdown_v1`
- `time_v1`
- `once_v1`
- `boot_v1`

The manifest rejects a top-level `replication` field. Cell target, minimum,
maximum, topology, capacity, failover, and data affinity are system-policy
outputs. Table permissions are stored in the runtime access-policy owner rather
than inferred from capabilities or observed access.

## Optional Structural Fields

The current normalizer preserves these optional top-level fields in canonical
key order:

- `display_name`, `publisher`, and `description`;
- `capabilities`;
- `compatibility`;
- `config_schema`;
- `upgrade`;
- `dependencies`; and
- `health`.

The structural validator checks the supported shapes it declares, including
upgrade strategy names, dependency item shape, unique string arrays, and JSON
schema envelope fields. Downstream owners remain responsible for artifact
verification, signature policy, compatibility decisions, capability policy,
configuration evaluation, dependency satisfaction, persistence, and runtime
activation. Presence of an optional declaration is not proof that a downstream
platform API exists.

## Minimal WASM Example

```json
{
  "schema_version": 3,
  "name": "hello-component",
  "version": "1.0.0",
  "artifact": {
    "type": "oci",
    "ref": "oci-layout:/artifacts/hello-component",
    "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "media_type": "application/wasm"
  },
  "runtime": {
    "kind": "wasm_component"
  },
  "exports": [
    {
      "name": "serve",
      "interface": "request_v1"
    }
  ]
}
```

## Identity And Ownership

Validation and normalization return immutable accepted or rejected outcomes
with typed error codes. Normalization sorts object keys and export declarations
so equivalent input has stable bytes.

The install catalog stores the normalized manifest in `service_packages`.
Binding identity is the installed `package_id` plus the SHA-256 digest of those
exact normalized manifest bytes. The OCI payload digest alone is insufficient
because several installed declarations may intentionally reference the same
payload while exposing different contracts.

The relationship between package state, catalog revisions, installation state,
and runtime actuals is documented in
[`lagrange-service-registry.md`](lagrange-service-registry.md). The current
runtime capability matrix is
[Current Capabilities And Limitations](../docs/current-capabilities-and-limitations.md).
