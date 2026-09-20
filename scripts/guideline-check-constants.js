export const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

export const SCRIPT_TEXT = Object.freeze({
  ENCODING_UTF8: 'utf8',
  NEWLINE: '\n',
});

// A directory whose NAME appears here is not scanned. The vendored
// raft-rs-wasm binding is wasm-pack output no human maintains, which is the
// same class of material as node_modules and dist; the hand-written adapter
// beside it (src/raft/raft-rs-*.js) is ordinary source and is still scanned.
export const GUIDELINE_SKIP_PATH_PART = Object.freeze([
  'node_modules',
  'raft-rs-wasm',
  '.git',
  '.tap',
  'dist',
  'test-output',
  'data',
  'data2',
  'data3',
]);
