// The removed-mechanism census of quest cdc-propagation-node-slot-removal: the
// node-wide CDC propagation slot and every mechanism that existed to share it
// are removed, not disabled. On the pattern of the retired-consensus
// zero-reference audit (scripts/checks/no-legacy-consensus-reference-audit.js):
// a fixed scope, the historical solve/ record its one exclusion, every file
// scanned by name and by content, case-insensitively, target zero. The
// retired names are assembled from fragments so this census never makes its
// own target non-zero, and the matcher is shown red on every retired name.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXED_SCAN_SCOPE = Object.freeze(['src', 'test', 'scripts', 'docs', 'architecture']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'test-output']);
const SCANNED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.txt']);

// Each entry is one family of retired names: the slot, the slice and its
// waiting-table queue, the turn wake, the contention marks and owners,
// the yield hold and busy retry, the admission states, and the lane's
// contention yield and hint.
const RETIRED_NAME_FRAGMENTS = Object.freeze([
  ['active', 'Durable', 'Propagation'],
  ['durable', '[-_ ]?', 'slice'],
  ['slice', '[-_ ]?', 'turn'],
  ['contended', '[-_ ]?', 'propagation'],
  ['register', '(?:lane)?', 'contention', 'owner'],
  ['(?:mark|is)', 'contended', '\\b'],
  ['contended', '_', '(?:table|slice)'],
  ['yield', '_', 'hold'],
  ['busy', '_', 'contended'],
  ['durable', '_', 'propagation', '_', 'admission'],
  ['yielded', '(?:on)?', '(?:contention|durable)'],
  ['step', 'contended'],
  ['consume', 'retry', 'hint'],
  ['compute', 'busy', 'retry'],
  ['decide', 'durable', 'propagation', 'admission'],
  ['wake', 'contended', 'lane'],
].map((fragments) => fragments.join('')));
const RETIRED_MECHANISM_REFERENCE = new RegExp(RETIRED_NAME_FRAGMENTS.join('|'), 'i');

function* scopeFiles(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* scopeFiles(full);
    } else if (entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

function censusFindings() {
  const findings = [];
  let scanned = 0;
  for (const scope of FIXED_SCAN_SCOPE) {
    const root = path.join(ROOT, scope);
    if (!fs.existsSync(root)) continue;
    for (const file of scopeFiles(root)) {
      scanned += 1;
      const relative = path.relative(ROOT, file);
      if (RETIRED_MECHANISM_REFERENCE.test(relative)) findings.push(`${relative}:0`);
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (RETIRED_MECHANISM_REFERENCE.test(line)) findings.push(`${relative}:${index + 1}`);
      });
    }
  }
  return {findings, scanned};
}

test('the census matcher is red on every retired name of the slot and its slicing ' +
  'machinery', () => {
  const retired = [
    ['active', 'Durable', 'Propagation'], ['durable', 'Slice', 'Table'],
    ['waiting', 'Durable', 'Slice', 'Tables'], ['credited', 'Waiting', 'Durable', 'Slice', 'Tables'],
    ['yielded', 'Durable', 'Slice', 'UntilMs'], ['release', 'Durable', 'Slice', 'Contender'],
    ['on', 'Slice', 'Turn', 'Ready'], ['slice', 'Turn', 'Ready'],
    ['register', 'Contention', 'Owner'], ['register', 'Lane', 'Contention', 'Owner'],
    ['release', 'Contended', 'Propagation', 'Owners'], ['mark', 'Contended'], ['is', 'Contended'],
    ['CONTENDED', '_TABLE_SLICE_WAVES'], ['CONTENDED', '_SLICE_YIELD', '_HOLD_MS'],
    ['BUSY', '_CONTENDED_RETRY_AFTER_MS'], ['MIN_', 'YIELD', '_HOLD_RETRY_AFTER_MS'],
    ['DURABLE', '_PROPAGATION', '_ADMISSION'], ['yielded', 'On', 'Contention'],
    ['step', 'Contended'], ['consume', 'Retry', 'Hint', 'Ms'],
    ['compute', 'Busy', 'Retry', 'AfterMs'], ['decide', 'Durable', 'Propagation', 'Admission'],
    ['wake', 'Contended', 'Lane', 'For', 'Slice', 'Turn'],
  ].map((parts) => parts.join(''));
  assert.deepEqual(retired.filter((name) => !RETIRED_MECHANISM_REFERENCE.test(name)), [],
    'every retired name is matched');
});

test('no name of the removed propagation slot or its slicing machinery survives under ' +
  `${FIXED_SCAN_SCOPE.join(', ')}`, () => {
  const {findings, scanned} = censusFindings();
  assert.ok(scanned > 0, 'the census scanned the fixed scope');
  assert.deepEqual(findings, [], 'removed-mechanism references (target zero)');
});
