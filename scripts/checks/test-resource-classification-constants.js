// Canonical literal owners for the resource classification surface.
// Domain scalars live here per system-guidelines.md §4; consumers import,
// never re-declare.
//
// Resource class is ORTHOGONAL to primary class: a test is independently
// "what kind of test it is" (unit/integration/bootstrap/...) and "what it
// costs to run" (ordinary/cpu-heavy/external-toolchain/exclusive). A wasm
// integration test is primary=integration AND resource=external-toolchain;
// neither dimension implies the other.

export const RESOURCE_CLASS_SCHEMA_VERSION = 1;

export const RESOURCE_CLASS_ORDINARY = 'ordinary';
export const RESOURCE_CLASS_CPU_HEAVY = 'cpu-heavy';
export const RESOURCE_CLASS_EXTERNAL_TOOLCHAIN = 'external-toolchain';
export const RESOURCE_CLASS_EXCLUSIVE = 'exclusive';

export const RESOURCE_CLASSES = Object.freeze([
  RESOURCE_CLASS_ORDINARY,
  RESOURCE_CLASS_CPU_HEAVY,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_EXCLUSIVE,
]);

// Concurrency each class may safely run at on the 2-vCPU hosted runner.
// external-toolchain is 1 because a single such test can itself consume
// ~3.7 cores (measured 2026-08-17: service-init-wasm-scaffold real 17.5s vs
// user 64s), so a nominal job count understates true CPU demand.
export const RESOURCE_CLASS_JOBS = Object.freeze({
  [RESOURCE_CLASS_ORDINARY]: 4,
  [RESOURCE_CLASS_CPU_HEAVY]: 2,
  [RESOURCE_CLASS_EXTERNAL_TOOLCHAIN]: 1,
  [RESOURCE_CLASS_EXCLUSIVE]: 1,
});

export const RESOURCE_CLASS_MANIFEST_ID = 'test-resource-classification';
export const RESOURCE_CLASS_MANIFEST_PATH = 'test/shards/resource-classes.json';

// One curated shard per non-default class; everything absent is ordinary.
export const RESOURCE_CLASS_SHARD_PATHS = Object.freeze({
  [RESOURCE_CLASS_CPU_HEAVY]: 'test/shards/resource-cpu-heavy.txt',
  [RESOURCE_CLASS_EXTERNAL_TOOLCHAIN]:
    'test/shards/resource-external-toolchain.txt',
  [RESOURCE_CLASS_EXCLUSIVE]: 'test/shards/resource-exclusive.txt',
});

export const RESOURCE_CLASS_SEPARATOR = ':';
export const RESOURCE_DIGEST_ALGORITHM_LABEL = 'fnv1a32';
export const RESOURCE_DIGEST_HEX_WIDTH = 8;
export const RESOURCE_FNV1A32_OFFSET_BASIS = 0x811c9dc5;
export const RESOURCE_FNV1A32_PRIME = 0x01000193;

export const RESOURCE_MANIFEST_NOT_OBJECT_PROBLEM =
  'resource manifest is not an object';
export const RESOURCE_CLASSES_NOT_OBJECT_PROBLEM =
  'resource manifest.classes is not an object';
export const RESOURCE_UNKNOWN_CLASS_PROBLEM = 'unknown resource class';
export const RESOURCE_UNKNOWN_PATH_PROBLEM =
  'curated shard names a path that is not in the live test census';
export const RESOURCE_DUPLICATE_PATH_PROBLEM =
  'path claimed by more than one curated resource shard';
export const RESOURCE_MISSING_PATH_PROBLEM =
  'live test census file missing from the resource manifest';
export const RESOURCE_EXTRA_PATH_PROBLEM =
  'resource manifest names a file absent from the live test census';
