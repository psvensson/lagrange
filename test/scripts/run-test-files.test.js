import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {
  RETRY_FAILED_ONCE_ENABLED,
  RETRY_FAILED_ONCE_ENV,
  TEST_NODE_ARGS,
  analyzeTapOutput,
  readBoundedOutput,
  filterTestFiles,
  parseOptions,
  retryFailedOnce,
  runTestFiles,
} from '../../scripts/run-test-files.js';

const FIXTURE_DIRECTORY = 'test/scripts/__fixtures__/run-test-files';
const TAP_PASS_FIXTURE = `${FIXTURE_DIRECTORY}/tap-pass.fixture.mjs`;
const TAP_SKIP_FIXTURE = `${FIXTURE_DIRECTORY}/tap-skip.fixture.mjs`;
const NODE_TEST_PASS_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-pass.fixture.mjs`;
const NODE_TEST_SKIP_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-skip.fixture.mjs`;
const NODE_TEST_FAILURE_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-failure.fixture.mjs`;
const EMPTY_FIXTURE = `${FIXTURE_DIRECTORY}/empty.fixture.mjs`;
const GIT_ENVIRONMENT_FIXTURE = `${FIXTURE_DIRECTORY}/git-environment.fixture.mjs`;
const RUNAWAY_DIRECTIVE_FIXTURE =
  `${FIXTURE_DIRECTORY}/tap-runaway-directive.fixture.mjs`;

describe('run-test-files', () => {
  const temporaryDirectories = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true})));
  });

  async function runFixtures(files) {
    const resultsDirectory = await mkdtemp(path.join(tmpdir(), 'run-test-files-'));
    temporaryDirectories.push(resultsDirectory);
    return runTestFiles(files, {
      jobs: 2,
      print: false,
      resultsDirectory,
    });
  }

  it('a test process never inherits a git repository pointer', async () => {
    // As inside a pre-push hook run from a linked worktree, where git exports
    // an absolute GIT_DIR (2026-09-13).
    const saved = {};
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
      saved[name] = process.env[name];
      process.env[name] = `/nonexistent/${name}`;
    }
    try {
      const summary = await runFixtures([GIT_ENVIRONMENT_FIXTURE]);
      assert.equal(summary.ok, true, JSON.stringify(summary.results?.[0]?.reasons));
      assert.equal(summary.passed, 1);
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('parses explicit concurrency and timeout options', () => {
    assert.deepEqual(parseOptions([
      '--jobs=3',
      '--timeout-ms',
      '1200',
      TAP_PASS_FIXTURE,
    ]), {
      files: [TAP_PASS_FIXTURE],
      filter: null,
      jobs: 3,
      timeoutMs: 1200,
    });
  });

  it('parses --filter in both option styles and rejects an empty value', () => {
    assert.equal(parseOptions(['--filter', 'tap-pass', TAP_PASS_FIXTURE]).filter,
      'tap-pass');
    assert.equal(parseOptions(['--filter=node-test', TAP_PASS_FIXTURE]).filter,
      'node-test');
    assert.throws(() => parseOptions(['--filter']),
      /--filter requires a non-empty value/);
    assert.throws(() => parseOptions(['--filter=']),
      /--filter requires a non-empty value/);
  });

  it('filters test files by path substring', () => {
    const files = [TAP_PASS_FIXTURE, NODE_TEST_PASS_FIXTURE];
    assert.deepEqual(filterTestFiles(files, 'node-test'),
      [NODE_TEST_PASS_FIXTURE]);
    assert.deepEqual(filterTestFiles(files, null), files,
      'no filter keeps every file');
    assert.deepEqual(filterTestFiles(files, 'no-such-substring'), [],
      'a non-matching filter selects nothing (main fails closed on this)');
  });

  it('runs only the files selected by the filter', async () => {
    const summary = await runFixtures(
      filterTestFiles([TAP_PASS_FIXTURE, NODE_TEST_FAILURE_FIXTURE], 'tap-pass'));

    assert.equal(summary.ok, true);
    assert.equal(summary.total, 1);
    assert.equal(summary.results[0].file, TAP_PASS_FIXTURE);
  });

  it('runs Tap and node:test files with assertions and Tap plugins intact', async () => {
    const summary = await runFixtures([TAP_PASS_FIXTURE, NODE_TEST_PASS_FIXTURE]);

    assert.equal(summary.ok, true);
    assert.equal(summary.passed, 2);
    assert.equal(summary.failed, 0);
    assert.ok(summary.assertions >= 2);
    assert.ok(summary.results.every((result) => result.output.length > 0));
  });

  it('fails closed when a test file emits no assertions', async () => {
    const summary = await runFixtures([EMPTY_FIXTURE]);

    assert.equal(summary.ok, false);
    assert.match(summary.results[0].reasons.join(' '), /no assertions executed/);
  });

  it('fails closed when no test files are provided', async () => {
    const summary = await runTestFiles([]);

    assert.equal(summary.ok, false);
    assert.equal(summary.total, 0);
    assert.match(summary.reasons.join(' '), /no test files provided/);
  });

  it('fails closed on skipped Tap and node:test tests', async () => {
    const summary = await runFixtures([TAP_SKIP_FIXTURE, NODE_TEST_SKIP_FIXTURE]);

    assert.equal(summary.ok, false);
    assert.equal(summary.failed, 2);
    assert.ok(summary.results.every((result) =>
      /skipped assertion/.test(result.reasons.join(' '))));
  });

  it('preserves assertion failures', async () => {
    const summary = await runFixtures([NODE_TEST_FAILURE_FIXTURE]);

    assert.equal(summary.ok, false);
    assert.match(summary.results[0].reasons.join(' '), /TAP assertions failed/);
    assert.notEqual(summary.results[0].status, 0);
  });

  it('rejects an empty TAP stream structurally', () => {
    const analysis = analyzeTapOutput('');

    assert.equal(analysis.parserOk, true);
    assert.equal(analysis.assertions, 0);
    assert.match(analysis.reasons.join(' '), /no assertions executed/);
  });
});

// The lane-scoped retry-failed-once policy (owner decision 2026-08-23), held
// as a witness now that `solve land` runs under it as CI does: a rerun
// happens only under the declared environment and under the cap, every
// rerun is REPORTED, a standalone pass classifies an intermittent, a
// standalone failure stays red.
describe('retry-failed-once policy', () => {
  const FAILED = 'test/a-red.test.js';
  const GREEN = 'test/b-green.test.js';
  const RETRY_ENV = {[RETRY_FAILED_ONCE_ENV]: RETRY_FAILED_ONCE_ENABLED};
  const summaryWith = (failedFiles) => ({
    failed: failedFiles.length,
    ok: false,
    results: [
      {file: GREEN, ok: true},
      ...failedFiles.map((file) => ({file, ok: false})),
    ],
  });
  const harness = (rerunOk) => {
    const lines = [];
    const reruns = [];
    const runFile = (file) => {
      reruns.push(file);
      return Promise.resolve({file, ok: rerunOk});
    };
    return {lines, reruns, seams: {env: RETRY_ENV, runFile, write: (l) => lines.push(l)}};
  };

  it('does not rerun without the declared environment: a red stays red', async () => {
    const {reruns, seams} = harness(true);
    const exitCode = await retryFailedOnce(summaryWith([FAILED]), {},
      {...seams, env: {}});
    assert.equal(exitCode, 1);
    assert.deepEqual(reruns, [], 'nothing reran');
  });

  it('reruns each failed file once, reports it, and a standalone pass is green', async () => {
    const {lines, reruns, seams} = harness(true);
    const exitCode = await retryFailedOnce(summaryWith([FAILED]), {}, seams);
    assert.equal(exitCode, 0);
    assert.deepEqual(reruns, [FAILED], 'only the failed file reran, once');
    assert.match(lines[0], /^# retry-failed-once: rerunning 1 failed file/u,
      'the rerun is announced');
    assert.equal(lines[1], `# retried-once pass ${FAILED}\n`,
      'the outcome is reported, never hidden');
  });

  it('a standalone failure stays red and is reported as such', async () => {
    const {lines, seams} = harness(false);
    const exitCode = await retryFailedOnce(summaryWith([FAILED]), {}, seams);
    assert.equal(exitCode, 1);
    assert.equal(lines[1], `# retried-once fail ${FAILED}\n`);
  });

  it('is capped: a run with many failed files is breakage and never reruns', async () => {
    const {reruns, seams} = harness(true);
    const many = Array.from({length: 6}, (_, index) => `test/red-${index}.test.js`);
    const exitCode = await retryFailedOnce(summaryWith(many), {}, seams);
    assert.equal(exitCode, 1);
    assert.deepEqual(reruns, [], 'six failed files is over the cap of five');
  });
});

// Every test process pays the loaders at start-up, ~1700 times per corpus.
// Only the mock plugin serves anything; the typescript and processinfo
// loaders served no .ts file, no coverage and no reader (2026-09-17: 530 ms
// -> 207 ms idle start-up per process without them).
describe('test process loaders', () => {
  const loaders = TEST_NODE_ARGS.filter((argument) => argument.startsWith('--import='));

  it('loads the mock plugin and nothing that serves no file', () => {
    assert.equal(loaders.length, 1, 'exactly one loader');
    assert.match(loaders[0], /@tapjs\/mock\//u);
    for (const argument of TEST_NODE_ARGS) {
      assert.doesNotMatch(argument, /@tapjs\/(typescript|processinfo)\//u,
        `${argument}: a loader that serves nothing is not paid for`);
    }
  });

  it('keeps the V8 compilation cache off (3bac105f1) and the heap bound', () => {
    assert.ok(TEST_NODE_ARGS.includes('--no-compilation-cache'));
    assert.ok(TEST_NODE_ARGS.some((argument) => argument.startsWith('--max-old-space-size=')));
  });
});

// A test's own output is read in chunks and never held whole. One file of
// 608,651,868 bytes passed V8's string cap on 2026-09-17, so readFileSync
// threw ERR_STRING_TOO_LONG inside finalizeTestRun and killed the runner,
// taking 220 of 262 already-green exclusive files with it. Every byte still
// reaches the analysis; only the retained text is bounded - in BYTES, and
// per line prefix, because a whole-line accumulator is just another
// unbounded string (verifier round 1).
describe('bounded output reading', () => {
  const written = [];
  const EDGE_BYTES = 64 * 1024;
  const PREFIX_BYTES = 256;

  afterEach(async () => {
    while (written.length > 0) {
      await rm(written.pop(), {force: true, recursive: true});
    }
  });

  const write = async (name, contents) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'run-test-files-bound-'));
    written.push(directory);
    const file = path.join(directory, name);
    fs.writeFileSync(file, contents);
    return file;
  };

  it('returns a small output verbatim, with its byte count', async () => {
    const text = 'TAP version 13\n1..1\nok 1 - small\n# time=7ms\n';
    const read = readBoundedOutput(await write('small.tap', text));
    assert.equal(read.excerpt, text, 'nothing is elided from a small file');
    assert.equal(read.bytes, Buffer.byteLength(text));
    assert.equal(read.truncated, false);
  });

  // The join between head and tail is byte arithmetic, so it has to be exact
  // at every size around the threshold - and for multibyte text, where a
  // UTF-16 length is NOT a byte count (verifier round 1 found this duplicating
  // 14 characters of a real 95,285-byte artifact in this repository).
  it('returns any output within the two edges byte for byte', async () => {
    for (const bytes of [0, 1, EDGE_BYTES - 1, EDGE_BYTES, EDGE_BYTES + 1,
      2 * EDGE_BYTES - 1, 2 * EDGE_BYTES]) {
      const text = 'a'.repeat(bytes);
      const read = readBoundedOutput(await write(`ascii-${bytes}.tap`, text));
      assert.equal(read.bytes, bytes);
      assert.equal(read.truncated, false, `${bytes} bytes is within the edges`);
      assert.equal(read.excerpt, text, `${bytes} bytes must be verbatim`);
    }
    // Three bytes per character: a length-versus-bytes mix duplicates here.
    for (const characters of [1, 30000, 43690, 43691]) {
      const text = '\u00e5'.repeat(characters);
      const read = readBoundedOutput(
        await write(`utf8-${characters}.tap`, text));
      assert.equal(read.bytes, Buffer.byteLength(text));
      if (!read.truncated) {
        assert.equal(read.excerpt, text,
          `${characters} multibyte characters must be verbatim`);
      }
    }
  });

  it('offers a bounded prefix of every line, whatever the line length', async () => {
    const padded = `# ${'x'.repeat(2 * 1024 * 1024)}`;
    const file = await write('split.tap',
      `TAP version 13\n${padded}\nok 1 - after the long line\n# time=11ms\n`);
    const lines = [];
    const read = readBoundedOutput(file, {onLinePrefix: (line) => lines.push(line)});
    assert.equal(lines.at(0), 'TAP version 13');
    assert.equal(lines.at(1), padded.slice(0, PREFIX_BYTES),
      'a 2 MiB line is offered as its prefix, never accumulated whole');
    assert.equal(lines.at(-1), '# time=11ms',
      'the tail line is seen however far into the file it lies');
    assert.ok(read.truncated);
  });

  it('offers the last line when the file does not end in a newline', async () => {
    const lines = [];
    readBoundedOutput(await write('unterminated.tap',
      'TAP version 13\nok 1 - done\n# time=13ms'), {
      onLinePrefix: (line) => lines.push(line),
    });
    assert.equal(lines.at(-1), '# time=13ms',
      'the time tail is found even with no trailing newline');
  });

  it('ends a line at a carriage return, as the pattern it replaced did', async () => {
    const lines = [];
    readBoundedOutput(await write('cr.tap',
      'TAP version 13\nlogging\r# time=5ms\nmore\n'), {
      onLinePrefix: (line) => lines.push(line),
    });
    assert.ok(lines.includes('# time=5ms'),
      'a multiline ^ anchors after CR too, so this reader must as well');
  });

  it('feeds every byte to the consumer while keeping only the edges', async () => {
    const middle = `# ${'y'.repeat(300 * 1024)}\n`;
    // Under the repository, because the elision names the file and an excerpt
    // can end up inside a committed report: the name must not be this
    // machine's absolute path when the file is one of ours.
    const directory = fs.mkdtempSync(
      path.join(process.cwd(), 'test-output', 'run-test-files-bound-'));
    written.push(directory);
    const file = path.join(directory, 'edges.tap');
    fs.writeFileSync(file,
      `TAP version 13\n1..1\n${middle}ok 1 - kept\n# time=3ms\n`);
    let consumed = 0;
    const read = readBoundedOutput(file, {consume: (chunk) => {
      consumed += chunk.length;
    }});
    assert.equal(consumed, read.bytes, 'the consumer sees the whole file');
    assert.equal(read.truncated, true);
    assert.match(read.excerpt, /^TAP version 13\n1\.\.1\n/u, 'the head is kept');
    assert.match(read.excerpt, /# time=3ms\n$/u, 'and so is the tail');
    const elided = read.excerpt.match(/# \.\.\. (\d+) byte\(s\) elided; full output in (\S+)/u);
    assert.ok(elided, 'the elision names the file that holds the rest');
    assert.equal(Number(elided[1]), read.bytes - 2 * EDGE_BYTES,
      'and counts exactly the bytes it dropped');
    assert.equal(path.isAbsolute(elided[2]), false,
      'as a repository-relative path: an excerpt can end up inside a report');
  });

  it('hands the consumer raw bytes, so a character split across chunks survives', async () => {
    // The reader works a chunk at a time; a multibyte character that straddles
    // that seam must still reach the consumer whole, which is why chunks are
    // forwarded as bytes and never decoded on the way. Ordinary short lines,
    // so nothing meets the per-line cap.
    const line = `# ${'a'.repeat(97)}\n`;
    const filler = line.repeat(Math.floor((1024 * 1024 - 1) / line.length));
    const pad = 'b'.repeat(1024 * 1024 - 1 - filler.length);
    const file = await write('seam.tap', `${filler}${pad}\u00e5tail\n`);
    const chunks = [];
    const read = readBoundedOutput(file, {consume: (chunk) => {
      assert.ok(Buffer.isBuffer(chunk), 'chunks are bytes, never pre-decoded text');
      chunks.push(Buffer.from(chunk));
    }});
    assert.equal(read.dropped, 0, 'ordinary lines are never capped');
    const joined = Buffer.concat(chunks).toString('utf8');
    assert.equal(joined.endsWith('\u00e5tail\n'), true,
      'the character is whole once the consumer joins the bytes it was given');
  });

  it('analyses an output far past the string cap that readFileSync cannot hold', async () => {
    const file = path.join(
      await mkdtemp(path.join(tmpdir(), 'run-test-files-huge-')), 'huge.tap');
    written.push(path.dirname(file));
    const descriptor = fs.openSync(file, 'w');
    try {
      fs.writeSync(descriptor, 'TAP version 13\n1..1\nok 1 - one real assertion\n');
      const noise = `# ${'z'.repeat(1022)}\n`.repeat(1024);
      for (let megabyte = 0; megabyte < 520; megabyte += 1) {
        fs.writeSync(descriptor, noise);
      }
      fs.writeSync(descriptor, '# time=999ms\n');
    } finally {
      fs.closeSync(descriptor);
    }
    assert.throws(() => fs.readFileSync(file, 'utf8'), /ERR_STRING_TOO_LONG|longer than/u,
      'the old whole-file read is still impossible for this file');

    let consumed = 0;
    let sawTime = false;
    const read = readBoundedOutput(file, {
      consume: (chunk) => {
        consumed += chunk.length;
      },
      onLinePrefix: (line) => {
        if (line.startsWith('# time=')) sawTime = true;
      },
    });
    assert.ok(read.bytes > 512 * 1024 * 1024, 'the fixture really is over the cap');
    assert.equal(consumed, read.bytes);
    assert.equal(sawTime, true, 'the time tail is found beyond the cap');
    assert.ok(read.excerpt.length <= 2 * EDGE_BYTES + 512,
      'and memory stays bounded whatever the file size');
  });

  it('survives an output past the cap that has no newline at all', async () => {
    // The shape that defeated the first repair: one line, no terminator, so a
    // whole-line accumulator throws RangeError exactly where readFileSync did.
    const file = path.join(
      await mkdtemp(path.join(tmpdir(), 'run-test-files-oneline-')), 'oneline.tap');
    written.push(path.dirname(file));
    const descriptor = fs.openSync(file, 'w');
    try {
      const block = 'q'.repeat(1024 * 1024);
      for (let megabyte = 0; megabyte < 520; megabyte += 1) {
        fs.writeSync(descriptor, block);
      }
    } finally {
      fs.closeSync(descriptor);
    }
    const lines = [];
    let consumed = 0;
    const read = readBoundedOutput(file, {
      consume: (chunk) => {
        consumed += chunk.length;
      },
      onLinePrefix: (line) => lines.push(line),
    });
    assert.ok(read.bytes > 512 * 1024 * 1024);
    // The consumer is a TAP parser that buffers until a line ends, so ONE
    // line may never hand it more than the analysis cap: the head of the line
    // carries the TAP verdict, and the runaway tail is dropped and counted.
    assert.equal(consumed, 1024 * 1024, 'the parser sees this line capped');
    assert.equal(read.dropped, read.bytes - consumed,
      'and every dropped byte is counted, never silently discarded');
    assert.deepEqual(lines, ['q'.repeat(PREFIX_BYTES)],
      'one unterminated line is offered once, as a bounded prefix');
    assert.ok(read.excerpt.length <= 2 * EDGE_BYTES + 512);
  });

  it('caps one runaway line without touching the lines around it', async () => {
    const runaway = `# ${'r'.repeat(3 * 1024 * 1024)}`;
    const file = await write('runaway.tap',
      `TAP version 13\n1..1\n${runaway}\nok 1 - after the runaway\n# time=4ms\n`);
    const seen = [];
    const read = readBoundedOutput(file, {
      consume: (chunk) => seen.push(chunk.toString('utf8')),
    });
    const forwarded = seen.join('');
    assert.equal(read.dropped, 3 * 1024 * 1024 + 2 - 1024 * 1024,
      'only the runaway line is capped');
    assert.match(forwarded, /^TAP version 13\n1\.\.1\n/u,
      'the lines before it are whole');
    assert.match(forwarded, /\nok 1 - after the runaway\n# time=4ms\n/u,
      'and so are the lines after it: the cap is per line, not per file');
  });
});

// The analysis bound is per line, so a line the parser never saw whole can
// move the verdict: `ok 1 - <runaway> # SKIP reason` loses its skip and reads
// as a plain pass. A file whose output could not be analysed whole is failed
// by construction, whatever the cut removed (verifier round 2).
describe('an unanalysable output fails the file', () => {
  it('fails a file whose runaway line hid its directive', async () => {
    const outcome = await runTestFiles([RUNAWAY_DIRECTIVE_FIXTURE],
      {jobs: 1, print: false});
    const [result] = outcome.results;
    assert.equal(result.ok, false,
      'a verdict the runner cannot stand behind is never reported as a pass');
    assert.ok(result.outputDropped > 0, 'and it says how much went unanalysed');
    assert.equal(result.outputBytes > result.outputDropped, true);
    // The two numbers are the point of the reason, so pin them: dropped of
    // total, in that order, and the dropped count is what the cap withheld.
    assert.deepEqual(result.reasons, [
      `output line past the analysis bound: ${result.outputDropped} byte(s) ` +
      `of ${result.outputBytes} were not analysed`,
    ], 'the reason names how much of how much went unanalysed, in that order');
    assert.ok(result.outputDropped < result.outputBytes);
  });

  it('leaves an ordinary output unflagged', async () => {
    const outcome = await runTestFiles([TAP_PASS_FIXTURE], {jobs: 1, print: false});
    const [result] = outcome.results;
    assert.equal(result.ok, true);
    assert.equal(result.outputDropped, 0, 'nothing is dropped from a normal file');
  });
});
