// The CDC integration's local system-table lane decides a THROWN partition
// answer as it decides a returned one (quest reroute-carries-the-entry-id,
// verification round 1, B3): by the failureCode the answer carries, through
// the write kernel's predicate with carriesEntryId - an unknown outcome is
// sent on to the next local service only under the routed mutation's key -
// and never by the error's text. A thrown failure that carries no kernel code
// is not a partition answer; it is sent on only under the key (the re-send is
// then the same entryId, idempotent), never without one.
//
// The thrown errors are the kernel's own: its typed not-leader error, and the
// answer of a write released after it was proposed (the kernel's builder)
// thrown as its caller's error carries it. The texts that differ from the
// code are inputs chosen so that the text alone would decide the other way.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {sendLocalSystemTableWrite} from
  '../../src/cdc/cdc-local-system-table-write-lane.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ERRORS} from '../../src/constants/errors.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_WRITE_RELEASE_CAUSE,
  buildPartitionWriteNotLeaderError,
  buildReleasedPendingWriteAnswer,
} from '../../src/partition/partition-write-kernel.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from
  '../../src/partition/proposal-queue-constants.js';

const LOCAL_PARTITION = 'lane-local-p1';
const NEXT_PARTITION = 'lane-local-p2';
const WRITE_SQL =
  `INSERT INTO ${SYSTEM_TABLE_NAME.NODES} (node_id) VALUES (?)`;
const ROUTED_KEY = 'cdc-mutation-lane-witness';
// An error text no router lists: the code alone must decide.
const OPAQUE_TEXT = 'an answer text no router lists';

// A write released after it was proposed, as the kernel answers it, thrown
// with the text given (its own when none is).
function thrownUnknownOutcome(text) {
  const answer = buildReleasedPendingWriteAnswer({
    entryId: 'e-lane', proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
    logIndex: null}, LOCAL_PARTITION,
  {cause: PARTITION_WRITE_RELEASE_CAUSE.LEADERSHIP_LOST});
  return Object.assign(new Error(text ?? answer.error), answer);
}

function thrownNotLeader(text) {
  const error = buildPartitionWriteNotLeaderError(LOCAL_PARTITION);
  if (text !== undefined) {
    error.message = text;
  }
  return error;
}

// Send one write through the lane: the first local service throws, the next
// answers; which services were asked, and whether the lane rethrew.
async function sendThrough(thrown, idempotencyKey) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'lane-node'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  try {
    const asked = [];
    const services = [
      {partitionId: LOCAL_PARTITION, executeQuery: async () => {
        asked.push(LOCAL_PARTITION);
        throw thrown;
      }},
      {partitionId: NEXT_PARTITION, executeQuery: async () => {
        asked.push(NEXT_PARTITION);
        return {success: true, changes: 1};
      }},
    ];
    const cdc = new CDCIntegrationService({nodeId: 'lane-node'});
    try {
      const outcome = await sendLocalSystemTableWrite(cdc, services,
        {sql: WRITE_SQL, params: ['node-lane'], idempotencyKey});
      return {asked, sentOn: outcome.handled === true &&
        asked.includes(NEXT_PARTITION), rethrown: false};
    } catch (error) {
      return {asked, sentOn: false, rethrown: error === thrown};
    }
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

test('B3: the local lane decides a thrown partition answer by its code with ' +
  'carriesEntryId, never by its text', async () => {
  const shapes = {
    // An unknown outcome under the routed key: sent on under the same
    // entryId (idempotent), whatever its text says.
    thrown_unknownCodeOpaqueText_withKey:
      [thrownUnknownOutcome(OPAQUE_TEXT), ROUTED_KEY],
    // Without the key it may have committed here: never sent on - even when
    // its text reads like a not-leader refusal.
    thrown_unknownCodeNotLeaderText_withoutKey:
      [thrownUnknownOutcome(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE), null],
    thrown_unknownCode_withoutKey: [thrownUnknownOutcome(), null],
    // A typed not-leader refusal was never proposed here: sent on by its
    // code, whatever its text.
    thrown_typedNotLeader: [thrownNotLeader(), null],
    thrown_typedNotLeaderOpaqueText: [thrownNotLeader(OPAQUE_TEXT), null],
    // No kernel code: not a partition answer. Without the key the lane
    // cannot know the write was never proposed, so it is not sent on - even
    // when its text names a retryable answer.
    thrown_unknownText_withoutKey:
      [new Error(ERRORS.WRITE_OUTCOME_UNKNOWN), null],
  };
  const decided = {};
  for (const [name, [thrown, key]] of Object.entries(shapes)) {
    const {sentOn, rethrown} = await sendThrough(thrown, key);
    decided[name] = sentOn ? 'sent-on' : (rethrown ? 'rethrown' : 'answered');
  }
  assert.deepEqual(decided, {
    thrown_unknownCodeOpaqueText_withKey: 'sent-on',
    thrown_unknownCodeNotLeaderText_withoutKey: 'rethrown',
    thrown_unknownCode_withoutKey: 'rethrown',
    thrown_typedNotLeader: 'sent-on',
    thrown_typedNotLeaderOpaqueText: 'sent-on',
    thrown_unknownText_withoutKey: 'rethrown',
  }, 'each thrown answer is decided by its code and the routed key');
});

// Verification round 3, B4 (static): every carrier of a partition write's
// entryId sends the statement in the one rendering the engine path sends,
// never its caller's text, so the partition's statement binding sees one
// statement per logical mutation. The census reads src: the sites that
// derive an entryId (the coordinator's participant options and the lane's
// local options), the one caller of the lane's options, and the files that
// stamp or relay an entryId on a partition request. The coordinator's
// participants are rendered by the executor's one renderer; the lane sends
// what the rendering owner renders from its caller's statement; the relays
// carry the text they received. A new carrier fails the census until it is
// classified here.
const SRC_ROOT = new URL('../../src/', import.meta.url);

function sourceFiles(directory = SRC_ROOT) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)) :
      (entry.name.endsWith('.js') ? [new URL(entry.name, directory)] : []));
}

function codeOf(file) {
  return fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

function filesMatching(sources, pattern) {
  return sources.filter(({code}) => pattern.test(code))
    .map(({name}) => name).sort();
}

test('B4: no carrier of an entryId sends its caller\'s statement text',
  () => {
    const sources = sourceFiles().map((file) => ({code: codeOf(file),
      name: file.pathname.slice(SRC_ROOT.pathname.length)}));
    const code = (name) => sources.find((source) => source.name === name)
      ?.code ?? '';
    assert.deepEqual(filesMatching(sources,
      /(?<!function )deriveParticipantEntryId\(/u), [
      'cdc/cdc-routed-system-write-selection.js',
      'query/distributed/distributed-write-coordinator.js',
    ], 'the entryId is derived by the coordinator and the lane\'s options');
    assert.deepEqual(filesMatching(sources,
      /(?<!function )routedMutationLocalWriteOptions\(/u),
    ['cdc/cdc-local-system-table-write-lane.js'],
    'the lane is the one carrier of its options');
    assert.deepEqual(filesMatching(sources, /QUERY_(MESSAGE|PAYLOAD)_FIELD_ENTRY_ID|SPLIT_MIRROR_IDENTITY_FIELD\.ENTRY_ID/u), [
      'partition/partition-service-entry-apply-base.js',
      'partition/partition-service-shared.js',
      'partition/partition-split-routing.js',
      'query/query-executor-partition-request-builders.js',
      'query/query-executor-shared.js',
      'query/query-executor-write-retry-routing.js',
    ], 'the relays of an entryId: the request builder stamps it on the ' +
      'text it was given, the transport handler and the split mirror carry ' +
      'what they received');
    const rendering = code('query/query-executor-sql-command-rendering.js');
    for (const method of ['executeInsert', 'executeUpdate', 'executeDelete']) {
      const body = rendering.split(`async ${method}(`)[1]?.split('\n  },')[0];
      assert.match(body ?? '', /const sql = renderWriteStatementSql\(ast\);/u,
        `the coordinator's participant text is ${method}'s one rendering`);
    }
    assert.deepEqual(filesMatching(sources,
      /\.build(Insert|Update|Delete)SQL\(/u), [],
    'no path renders a write statement outside the one renderer');
    const lane = code('cdc/cdc-local-system-table-write-lane.js');
    assert.match(lane, /renderPartitionWriteStatement\(sql, params\)/u,
      'the lane renders its caller\'s statement through the rendering owner');
    assert.deepEqual([...lane.matchAll(/executeQuery\(([^,]+),/gu)]
      .map((match) => match[1]), ['statement.sql'],
    'the lane sends the rendered statement, never its caller\'s text');
  });
