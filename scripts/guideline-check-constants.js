export const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

export const SCRIPT_TEXT = Object.freeze({
  ENCODING_UTF8: 'utf8',
  NEWLINE: '\n',
});

export const GUIDELINE_SKIP_PATH_PART = Object.freeze([
  'node_modules',
  '.git',
  '.tap',
  'dist',
  'test-output',
  'data',
  'data2',
  'data3',
]);
