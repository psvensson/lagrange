// Receipt: ready-and-apply-loop-order-derives-from-the-raft-rs-host-contract
//
// The derivation half. Every ordering constraint the loop obeys names lines of
// raft-rs 0.7. Those lines are vendored beside the binding, their digests are
// recorded, and this test reads the cited line and checks the quoted text is
// there. The expected value of each check is the crate's own bytes; nothing
// here compares the contract against a copy of itself.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  ORDER_CONTRADICTION,
  RAFT_RS_HOST_OBLIGATIONS,
  RAFT_RS_HOST_STEPS,
} from '../../../src/raft/raft-rs-host-contract.js';
import {
  fileDigest,
  raftRsBindingPaths,
  readArtifactDigest,
} from '../../../src/raft/raft-rs-core.js';

const LINE_SEPARATOR = '\n';
const TEXT_ENCODING = 'utf8';

function citedLine(crateRoot, citation) {
  const file = path.join(crateRoot, citation.file);
  const lines = fs.readFileSync(file, TEXT_ENCODING).split(LINE_SEPARATOR);
  return lines[citation.line - 1];
}

function everyCitation() {
  const citations = [];
  for (const step of RAFT_RS_HOST_STEPS) {
    citations.push(...step.sources.map((source) => [step.id, source]));
  }
  for (const obligation of RAFT_RS_HOST_OBLIGATIONS) {
    citations.push(...obligation.sources.map((source) =>
      [obligation.id, source]));
  }
  return citations;
}

test('the vendored raft-rs sources are the ones the digest records',
  async () => {
    const digest = readArtifactDigest();
    const {crateSource} = raftRsBindingPaths();
    const recorded = digest.citationSources.files;
    assert.ok(Object.keys(recorded).length > 0);
    for (const [relative, expected] of Object.entries(recorded)) {
      const actual = fileDigest(path.join(crateSource, relative));
      assert.equal(actual, expected,
        `${relative} is not the file whose digest is recorded, so a ` +
        'citation into it proves nothing');
    }
  });

test('every host-contract citation resolves in the raft-rs source',
  async () => {
    const {crateSource} = raftRsBindingPaths();
    const citations = everyCitation();
    assert.ok(citations.length >= RAFT_RS_HOST_STEPS.length);
    for (const [owner, citation] of citations) {
      const line = citedLine(crateSource, citation);
      assert.ok(typeof line === 'string',
        `${owner}: ${citation.file}:${citation.line} does not exist`);
      assert.ok(line.includes(citation.quote),
        `${owner}: ${citation.file}:${citation.line} does not say ` +
        `${JSON.stringify(citation.quote)}; it says ` +
        `${JSON.stringify(line)}`);
    }
  });

test('the crate contradiction is recorded with both sides cited', async () => {
  const {crateSource} = raftRsBindingPaths();
  const note = fs.readFileSync(
    path.join(crateSource, 'src', 'lib.rs'), TEXT_ENCODING);
  assert.ok(note.includes(
    'it doesn\'t guarentee commit index is persisted before being applied'),
  'the safety note must be in the crate this host cites');
  assert.ok(note.includes('persisting commit index with or before applying'));
  for (const side of [ORDER_CONTRADICTION.documentedOrder,
    ORDER_CONTRADICTION.safetyNote, ORDER_CONTRADICTION.resolution,
    ORDER_CONTRADICTION.refusalIfIgnored]) {
    assert.equal(typeof side, 'string');
    assert.ok(side.length > 0);
  }
  const example = fs.readFileSync(
    path.join(crateSource, 'examples', 'five_mem_node', 'main.rs'),
    TEXT_ENCODING).split(LINE_SEPARATOR);
  // The example really does apply before it appends and stores: that is the
  // side the safety note overrides, and this reads it rather than claiming it.
  const applyLine = example.findIndex((line) =>
    line.includes('handle_committed_entries(raft_group, ready.take_committed_entries());'));
  const appendLine = example.findIndex((line) =>
    line.includes('store.wl().append(ready.entries())'));
  const hardStateLine = example.findIndex((line) =>
    line.includes('store.wl().set_hardstate(hs.clone());'));
  assert.ok(applyLine > 0 && appendLine > applyLine &&
    hardStateLine > appendLine,
  'the example applies committed entries before it appends and stores the ' +
  'hard state; the contradiction the contract records is real');
});
