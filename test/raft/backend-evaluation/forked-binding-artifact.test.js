// The fork itself: what it exposes, that the artifact tested is the artifact
// recorded, and how honestly its build is pinned.
//
// Integrity and reproducibility are kept apart on purpose. Integrity is a
// hard requirement - the `.wasm` loaded here must hash to the digest checked
// in beside it. Reproducibility is a measurement: the recipe is built twice
// and the result, identical or not, is recorded as found.

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {test} from 'node:test';

import {
  FORBIDDEN_CONVENIENCE,
  FORK,
  REQUIRED_PRIMITIVES,
  loadForkedCore,
} from './forked-core-harness.js';

const BUILD = Object.freeze({
  DIGEST_ALGORITHM: 'sha256',
  DIGEST_ENCODING: 'hex',
  UTF8: 'utf8',
  REQUIRED_PIN_KEYS: Object.freeze([
    'rustc', 'cargo', 'wasmPack', 'wasmBindgen', 'raftCrate',
    'raftCrateVersion', 'raftCrateChecksum', 'buildCommand', 'target',
  ]),
  REPRODUCIBILITY: 'reproducibility',
  REPRO_VALUES: Object.freeze(['identical', 'differs', 'not-attempted']),
  MIN_ATTEMPTS: 2,
});

function digestOf(file) {
  return createHash(BUILD.DIGEST_ALGORITHM)
    .update(fs.readFileSync(file)).digest(BUILD.DIGEST_ENCODING);
}

function readDigestRecord() {
  assert.ok(fs.existsSync(FORK.DIGEST),
    `the fork must carry ${FORK.DIGEST}`);
  return JSON.parse(fs.readFileSync(FORK.DIGEST, BUILD.UTF8));
}

test('the forked binding exposes raft primitives and no convenience ' +
  'membership methods', () => {
  const core = loadForkedCore();
  const exported = new Set(Object.keys(core));

  for (const primitive of REQUIRED_PRIMITIVES) {
    assert.ok(exported.has(primitive),
      `the fork must export the raft-rs primitive ${primitive}`);
    assert.equal(typeof core[primitive], 'function',
      `${primitive} must be callable`);
  }
  for (const convenience of FORBIDDEN_CONVENIENCE) {
    assert.ok(!exported.has(convenience),
      `${convenience} is membership policy and must not exist in the ` +
      'binding: policy stays in Lagrange');
  }
  // The Rust source must not grow one either, under any spelling the export
  // list would miss.
  const source = fs.readFileSync(FORK.LIB_RS, BUILD.UTF8);
  for (const convenience of FORBIDDEN_CONVENIENCE) {
    assert.ok(!new RegExp(`fn\\s+${convenience}\\b`, 'u').test(source),
      `the fork's source must define no ${convenience} function`);
  }
});

test('the forked binding artifact digest matches the recorded one', () => {
  const record = readDigestRecord();
  assert.equal(digestOf(FORK.WASM), record.wasmSha256,
    'the .wasm loaded by these scenarios must be the one recorded');
  assert.equal(digestOf(FORK.GLUE), record.glueSha256,
    'the JS glue loaded by these scenarios must be the one recorded');
});

test('the forked binding build is pinned and its reproducibility is ' +
  'reported honestly', () => {
  for (const required of [FORK.CARGO_TOML, FORK.CARGO_LOCK, FORK.TOOLCHAIN,
    FORK.BUILD_DOC, FORK.LIB_RS]) {
    assert.ok(fs.existsSync(required), `the fork must carry ${required}`);
  }
  const record = readDigestRecord();
  for (const key of BUILD.REQUIRED_PIN_KEYS) {
    assert.equal(typeof record[key], 'string',
      `the build record must pin ${key}`);
    assert.ok(record[key].length > 0, `${key} must not be empty`);
  }
  // The recipe in BUILD.md is the recipe that was run.
  const buildDoc = fs.readFileSync(FORK.BUILD_DOC, BUILD.UTF8);
  assert.ok(buildDoc.includes(record.buildCommand),
    'BUILD.md must contain the exact build command that was recorded');
  assert.ok(buildDoc.includes(record.rustc),
    'BUILD.md must name the exact rustc the artifact was built with');

  // Reproducibility is measured, not required.
  const reproducibility = record[BUILD.REPRODUCIBILITY];
  assert.ok(reproducibility,
    'the build record must report a reproducibility result');
  assert.ok(BUILD.REPRO_VALUES.includes(reproducibility.result),
    `reproducibility.result must be one of ${BUILD.REPRO_VALUES.join(', ')}`);
  assert.ok(reproducibility.attempts >= BUILD.MIN_ATTEMPTS,
    'the recipe must have been run at least twice');
  assert.equal(reproducibility.builds.length, reproducibility.attempts,
    'every attempt must have its digests recorded');
  for (const build of reproducibility.builds) {
    assert.match(build.wasmSha256, /^[0-9a-f]{64}$/u,
      `attempt ${build.attempt} must record a wasm digest`);
    assert.match(build.glueSha256, /^[0-9a-f]{64}$/u,
      `attempt ${build.attempt} must record a glue digest`);
  }
  // The verdict must be what the recorded digests actually say, and the
  // artifact checked in must be one of the attempts. Only the attempts that
  // built the SAME source are a reproducibility comparison; an attempt
  // marked with a note built different source and is excluded.
  const comparable = reproducibility.builds.filter((build) => !build.note);
  assert.ok(comparable.length >= BUILD.MIN_ATTEMPTS,
    'at least two builds of one source must be recorded');
  const wasmDigests = new Set(
    comparable.map((build) => build.wasmSha256));
  assert.equal(reproducibility.result === 'identical', wasmDigests.size === 1,
    'the reported reproducibility verdict must match the recorded digests');
  assert.equal(reproducibility.wasmIdentical, wasmDigests.size === 1,
    'wasmIdentical must match the recorded digests');
  const checkedIn = reproducibility.builds.find((build) =>
    build.attempt === reproducibility.checkedInArtifactIsAttempt);
  assert.ok(checkedIn, 'the checked-in attempt must be one of the attempts');
  assert.equal(checkedIn.wasmSha256, record.wasmSha256,
    'the checked-in artifact must be the attempt the record names');
});
