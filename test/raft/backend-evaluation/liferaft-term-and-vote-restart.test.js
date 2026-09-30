// MEASURED (part A): what term and vote survive a restart on the ACTUAL
// production persistence path.
//
// A real `src/raft/liferaft.js` node whose log is the real `SQLiteLogAdapter`
// over a real SQLite file, the real `PartitionRaftStorage` over the same
// database, and the real `wirePartitionRaftLifecycleEvents`. A real vote
// request at a higher term is delivered and granted through liferaft's own
// vote path; then the database is closed and reopened the way
// `partition-service-raft-init-base.js` reopens it.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TERM_DRIVE, runTermAndVoteAcrossRestart} from './liferaft-scenarios.js';

test('liferaft term and vote across a restart on the production ' +
  'persistence path', async () => {
  const record = await runTermAndVoteAcrossRestart();

  // BEFORE THE CRASH: the node really did move term and really did vote.
  assert.equal(record.liveTerm, TERM_DRIVE.CANDIDATE_TERM,
    'the node must have adopted the candidate term');
  assert.equal(record.liveVotedFor, TERM_DRIVE.CANDIDATE_ADDRESS,
    'the node must have recorded which candidate it voted for');
  assert.equal(record.voteGranted, true,
    'the node must have replied that it granted the vote');

  // What production did with that: the term reached the storage object in
  // memory, the vote reached nothing, and nothing was written.
  assert.equal(record.storageTermInMemory, TERM_DRIVE.CANDIDATE_TERM,
    'the production wiring must have set the in-memory term');
  assert.equal(record.storageVotedForInMemory, null,
    'production must not have recorded the vote anywhere');
  assert.deepEqual(record.persistCallsOnStorage, [],
    'production must not have called any persist* method on the storage');
  assert.equal(record.adapterPersistedTerm, false,
    'liferaft must not have persisted the term through its log adapter');
  assert.equal(record.adapterPersistedVote, false,
    'liferaft must not have persisted the vote through its log adapter');
  assert.ok(!record.durableStateKeys.includes(record.durableTermKey),
    'no durable term row may exist after a real vote at a higher term');
  assert.ok(!record.durableStateKeys.includes(record.durableVoteKey),
    'no durable vote row may exist after a real granted vote');

  // THE RESTART.
  assert.equal(record.termAfterRestart, 0,
    'the restarted replica must come back at term 0, having lost term ' +
    `${TERM_DRIVE.CANDIDATE_TERM}`);
  assert.equal(record.votedForAfterRestart, null,
    'the restarted replica must have no record of the vote it granted, so ' +
    'it is free to vote again in the same term');
  assert.equal(record.termSurvived, false,
    'the term must be measured as lost, not assumed');
  assert.equal(record.voteSurvived, false,
    'the vote must be measured as lost, not assumed');
});
