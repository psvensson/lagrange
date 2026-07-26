import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

import {
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  listCheckpointGenerations,
  readCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STATE,
} from '../../src/raft/snapshot-install-constants.js';
import {
  gatherRetentionPins,
  RAFT_SNAPSHOT_RETAINED_GENERATION_COUNT,
  sweepCheckpointGenerations,
} from '../../src/raft/snapshot-retention.js';
import {
  RAFT_SNAPSHOT_TRANSFER_DIRNAME,
  RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE,
} from '../../src/raft/snapshot-transfer-constants.js';
import {createSealedSourceGeneration} from './snapshot-catchup-fixture.js';

// S5 retention sweep guards (quest raft-snapshot-retention-compaction):
// bounded generation count; pinned generations (install marker in an active
// state, transfer marker, in-process pin) survive; a REJECTED install marker
// does NOT pin; the newest complete generation ALWAYS survives even unpinned
// and over-count; descriptor-first deletion means a crash-interrupted removal
// reads as a typed partial that the next sweep garbage-collects EXCEPT while
// a transfer marker covers the index; non-generation directories are never
// candidates; and the opportunistic post-creation sweep engages with the
// default bounded constants.

const PARTITION_ID = 'sweep_rows-p1';
const STATE_TABLE = 'sweep_rows';
const TERM = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-sweep',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 2,
});
const GENERATION_COUNT = 4;
const NO_PINS = Object.freeze([]);

// Build one root holding `count` sealed generations at indexes 1..count.
// Every build call pins all previously-built generations so the store's
// opportunistic post-creation sweep (exercised on its own below) cannot
// thin the fixture while it is being assembled.
async function buildGenerationRoot(workDir, count) {
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generations = [];
  for (let entryCount = 1; entryCount <= count; entryCount += 1) {
    const sourceDir = path.join(workDir, `source-${entryCount}`);
    fs.mkdirSync(sourceDir, {recursive: true});
    const generation = await createSealedSourceGeneration({
      workDir: sourceDir,
      checkpointsRoot,
      partitionId: PARTITION_ID,
      stateTable: STATE_TABLE,
      term: TERM,
      identity: IDENTITY,
      entryCount,
      inProcessPins: [...generations],
    });
    generations.push(generation.boundaryIndex);
  }
  return {checkpointsRoot, generations};
}

function makeWorkDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raft-retention-'));
}

function writeInstallMarker(checkpointsRoot, state, generationIndex) {
  const installDir = path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME);
  fs.mkdirSync(installDir, {recursive: true});
  fs.writeFileSync(
    path.join(installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
    JSON.stringify({
      state,
      installId: 'sweep-install-id',
      generationIndex,
      rejectionReason: RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
    }));
}

function writeTransferMarker(checkpointsRoot, generationIndex) {
  const transferDir = path.join(
    checkpointsRoot, RAFT_SNAPSHOT_TRANSFER_DIRNAME, String(generationIndex));
  fs.mkdirSync(transferDir, {recursive: true});
  fs.writeFileSync(
    path.join(transferDir, RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE),
    JSON.stringify({
      transferId: 'sweep-transfer-id',
      generationIndex,
      descriptorDigest: 'sha256:sweep',
      verifiedChunkCount: 1,
      verifiedByteLength: 1,
      verifiedPrefixDigest: 'sha256:sweep',
    }));
}

function generationDir(checkpointsRoot, generationIndex) {
  return path.join(checkpointsRoot, String(generationIndex));
}

test('bounded count: the sweep keeps the newest N complete generations',
  async (t) => {
    const workDir = makeWorkDir();
    try {
      const {checkpointsRoot, generations} =
        await buildGenerationRoot(workDir, GENERATION_COUNT);
      t.same(generations, [1, 2, 3, 4],
        'anti-vacuous: four sealed generations exist before the sweep');
      t.same(listCheckpointGenerations(checkpointsRoot), [1, 2, 3, 4],
        'anti-vacuous: all four are listed under the root');
      const report = sweepCheckpointGenerations({
        checkpointsRoot,
        retainedGenerationCount: RAFT_SNAPSHOT_RETAINED_GENERATION_COUNT,
        pinnedGenerationIndexes: NO_PINS,
      });
      t.same(report.kept, [3, 4], 'the newest two generations are kept');
      t.same(report.removed, [1, 2], 'the older generations are removed');
      t.same(report.pinnedKept, [], 'nothing was kept because of a pin');
      t.equal(report.soleSourceKept, 4,
        'the report names the newest generation as the sole-source floor');
      t.same(report.garbageCollected, [],
        'no descriptor-less directory existed to garbage-collect');
      t.ok(Object.isFrozen(report) && Object.isFrozen(report.kept),
        'the report and its lists are frozen');
      t.same(listCheckpointGenerations(checkpointsRoot), [3, 4],
        'the root holds exactly the kept generations');
      for (const index of report.kept) {
        t.equal(
          readCheckpoint({
            checkpointDir: generationDir(checkpointsRoot, index),
          }).outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
          `kept generation ${index} still validates end to end`);
      }
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('an active install marker pins its generation through the sweep',
  async (t) => {
    const workDir = makeWorkDir();
    try {
      const {checkpointsRoot} =
        await buildGenerationRoot(workDir, GENERATION_COUNT);
      writeInstallMarker(
        checkpointsRoot, RAFT_SNAPSHOT_INSTALL_STATE.STAGED, 1);
      const pins = gatherRetentionPins({checkpointsRoot});
      t.same(pins, [1], 'the staged install marker yields the pin');
      const report = sweepCheckpointGenerations({
        checkpointsRoot,
        pinnedGenerationIndexes: pins,
      });
      t.same(report.kept, [1, 3, 4],
        'the pinned generation survives beside the bounded newest two');
      t.same(report.pinnedKept, [1],
        'the report attributes the survival to the pin');
      t.same(report.removed, [2], 'the unpinned older generation is removed');
      t.same(listCheckpointGenerations(checkpointsRoot), [1, 3, 4],
        'the root matches the report');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('a REJECTED install marker does not pin; the newest rule still holds',
  async (t) => {
    const workDir = makeWorkDir();
    try {
      const {checkpointsRoot} =
        await buildGenerationRoot(workDir, GENERATION_COUNT);
      writeInstallMarker(
        checkpointsRoot, RAFT_SNAPSHOT_INSTALL_STATE.REJECTED, 1);
      const pins = gatherRetentionPins({checkpointsRoot});
      t.same(pins, [], 'a rejected marker yields NO pin (recorded lifetime rule)');
      // Retained count zero: only the sole-source floor protects anything.
      const report = sweepCheckpointGenerations({
        checkpointsRoot,
        retainedGenerationCount: 0,
        pinnedGenerationIndexes: pins,
      });
      t.same(report.kept, [4],
        'the newest generation survives even at retained count zero');
      t.equal(report.soleSourceKept, 4,
        'the sole-source floor names the newest generation');
      t.same(report.removed, [1, 2, 3],
        'the rejected-marker generation is removed like any unpinned one');
      t.same(listCheckpointGenerations(checkpointsRoot), [4],
        'the newest complete generation is never removed');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('transfer markers and in-process pins protect their generations',
  async (t) => {
    const workDir = makeWorkDir();
    try {
      const {checkpointsRoot} =
        await buildGenerationRoot(workDir, GENERATION_COUNT);
      writeTransferMarker(checkpointsRoot, 2);
      const pins = gatherRetentionPins(
        {checkpointsRoot, inProcessPins: [1]});
      t.same(pins, [1, 2],
        'the pin set unions the transfer marker and the in-process pin');
      const report = sweepCheckpointGenerations({
        checkpointsRoot,
        retainedGenerationCount: 1,
        pinnedGenerationIndexes: pins,
      });
      t.same(report.kept, [1, 2, 4],
        'both pinned generations survive beside the newest');
      t.same(report.pinnedKept, [1, 2],
        'the report attributes both survivals to pins');
      t.same(report.removed, [3], 'only the unpinned non-newest one goes');
      t.same(listCheckpointGenerations(checkpointsRoot), [1, 2, 4],
        'the root matches the report');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('descriptor-first interruption: a partial dir reads partial, then GCs',
  async (t) => {
    const workDir = makeWorkDir();
    try {
      const {checkpointsRoot} = await buildGenerationRoot(workDir, 2);
      // Interrupt simulation: the sweep deletes checkpoint.json FIRST, so a
      // crash mid-removal leaves exactly this shape — payload without
      // descriptor. It must read as a typed partial, never a valid source.
      const interrupted = generationDir(checkpointsRoot, 1);
      fs.rmSync(
        path.join(interrupted, RAFT_CHECKPOINT_DESCRIPTOR_FILE),
        {force: true});
      t.ok(fs.existsSync(path.join(interrupted, RAFT_CHECKPOINT_PAYLOAD_FILE)),
        'anti-vacuous: the payload remains after the simulated interrupt');
      t.equal(readCheckpoint({checkpointDir: interrupted}).outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.PARTIAL,
        'the interrupted removal reads as a typed partial');

      // With a transfer marker covering the index (the receiver publish
      // instant), the descriptor-less dir is NOT garbage-collected.
      writeTransferMarker(checkpointsRoot, 1);
      const protectedReport = sweepCheckpointGenerations({
        checkpointsRoot,
        pinnedGenerationIndexes: gatherRetentionPins({checkpointsRoot}),
      });
      t.same(protectedReport.garbageCollected, [],
        'a transfer marker shields the descriptor-less dir from GC');
      t.ok(fs.existsSync(interrupted),
        'the shielded dir remains on disk');

      // Marker gone: the next sweep garbage-collects the remainder.
      fs.rmSync(
        path.join(checkpointsRoot, RAFT_SNAPSHOT_TRANSFER_DIRNAME),
        {recursive: true, force: true});
      const report = sweepCheckpointGenerations({
        checkpointsRoot,
        pinnedGenerationIndexes: NO_PINS,
      });
      t.same(report.garbageCollected, [1],
        'the descriptor-less dir is garbage-collected once unmarked');
      t.notOk(fs.existsSync(interrupted), 'the partial dir is gone');
      t.same(report.kept, [2], 'the complete generation is untouched');
      t.same(listCheckpointGenerations(checkpointsRoot), [2],
        'only the complete generation remains');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('non-generation directories are never sweep candidates', async (t) => {
  const workDir = makeWorkDir();
  try {
    const {checkpointsRoot} =
      await buildGenerationRoot(workDir, GENERATION_COUNT);
    const untouchable = [
      path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME),
      path.join(checkpointsRoot, RAFT_SNAPSHOT_TRANSFER_DIRNAME),
      path.join(checkpointsRoot, '.staging-deadbeef'),
      path.join(checkpointsRoot, 'not-a-generation'),
      // Leading zero: not a canonical bare-decimal generation name.
      path.join(checkpointsRoot, '007'),
    ];
    for (const dir of untouchable) {
      fs.mkdirSync(dir, {recursive: true});
    }
    const report = sweepCheckpointGenerations({
      checkpointsRoot,
      retainedGenerationCount: 1,
      pinnedGenerationIndexes: NO_PINS,
    });
    t.same(report.removed, [1, 2, 3], 'complete generations sweep normally');
    t.same(report.garbageCollected, [],
      'no non-generation entry is treated as garbage');
    for (const dir of untouchable) {
      t.ok(fs.existsSync(dir), `${path.basename(dir)} is untouched`);
    }
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});

test('the opportunistic post-creation sweep engages with default bounds',
  async (t) => {
    const workDir = makeWorkDir();
    try {
      const {checkpointsRoot} =
        await buildGenerationRoot(workDir, GENERATION_COUNT);
      t.same(listCheckpointGenerations(checkpointsRoot), [1, 2, 3, 4],
        'anti-vacuous: four generations exist before the fifth creation');
      // A fifth creation WITHOUT pins: the store-owned post-creation sweep
      // must bound the root to the default retained count on its own.
      const sourceDir = path.join(workDir, 'source-5');
      fs.mkdirSync(sourceDir, {recursive: true});
      const fifth = await createSealedSourceGeneration({
        workDir: sourceDir,
        checkpointsRoot,
        partitionId: PARTITION_ID,
        stateTable: STATE_TABLE,
        term: TERM,
        identity: IDENTITY,
        entryCount: 5,
      });
      t.equal(fifth.boundaryIndex, 5, 'the fifth generation seals at 5');
      t.same(listCheckpointGenerations(checkpointsRoot), [4, 5],
        'creation itself swept the older unpinned generations down to the ' +
        'default retained count');
      t.equal(
        readCheckpoint({
          checkpointDir: generationDir(checkpointsRoot, 5),
        }).outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'the just-created generation (the newest) always survives its own ' +
        'sweep');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });
