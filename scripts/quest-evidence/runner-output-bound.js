#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'runner-output-bound';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const RUNNER_TEST = 'test/scripts/run-test-files.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['past-the-string-cap', RUNNER_TEST,
    '^analyses an output far past the string cap that readFileSync cannot hold$',
    'a 520 MiB output, which readFileSync still cannot hold, is read whole ' +
    'into the analysis at bounded memory'],
  ['every-byte-reaches-the-analysis', RUNNER_TEST,
    '^feeds every byte to the consumer while keeping only the edges$',
    'the verdict is computed from the whole file while only the head, the ' +
    'tail and a named elision are kept'],
  ['lines-survive-chunk-boundaries', RUNNER_TEST,
    '^offers a bounded prefix of every line, whatever the line length$',
    'a line larger than the read buffer is offered as a bounded prefix, so ' +
    'the top-level time tail is never missed and nothing accumulates'],
  ['bytes-reach-the-consumer-raw', RUNNER_TEST,
    '^hands the consumer raw bytes, so a character split across chunks survives$',
    'chunks are forwarded as bytes, so a multibyte character on a read seam ' +
    'is never mangled'],
  ['newline-free-output-survives', RUNNER_TEST,
    '^survives an output past the cap that has no newline at all$',
    'the shape that defeats a whole-line accumulator and the tap parser ' +
    'alike: one line, no terminator, past the string cap'],
  ['runaway-line-capped-in-place', RUNNER_TEST,
    '^caps one runaway line without touching the lines around it$',
    'the cap is per line: the lines before and after a runaway one reach ' +
    'the parser whole'],
  ['excerpt-is-bytes-not-lengths', RUNNER_TEST,
    '^returns any output within the two edges byte for byte$',
    'ASCII and multibyte alike are verbatim within the edges, at every size ' +
    'around the threshold'],
  ['line-ends-at-carriage-return', RUNNER_TEST,
    '^ends a line at a carriage return, as the pattern it replaced did$',
    'the multiline anchor it replaced matched after CR too'],
  ['last-line-without-newline', RUNNER_TEST,
    '^offers the last line when the file does not end in a newline$',
    'the time tail is found with no trailing newline'],
  ['unanalysable-output-fails-the-file', RUNNER_TEST,
    '^fails a file whose runaway line hid its directive$',
    'a line the parser never saw whole can move the verdict, so the file is ' +
    'red by construction rather than reported as a pass'],
  ['ordinary-output-unflagged', RUNNER_TEST,
    '^leaves an ordinary output unflagged$',
    'and nothing is dropped or flagged for a normal file'],
  ['small-output-is-verbatim', RUNNER_TEST,
    '^returns a small output verbatim, with its byte count$',
    'an ordinary output is unchanged by the bound'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
