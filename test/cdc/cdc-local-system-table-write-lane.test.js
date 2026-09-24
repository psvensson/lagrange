// The CDC integration's local system-table lane decides a THROWN partition
// answer as it decides a returned one (quest reroute-carries-the-entry-id,
// verification round 1, B3): by the failureCode the answer carries, through
// the write kernel's predicate, and never by the error's text. Each local
// partition is sent the write under its own entryId, so only an answer that
// proves nothing was applied (a code the kernel routes again without the
// entryId) moves the write to the next local partition (verification round
// 4, B6). An answer that may have applied - an unknown outcome, or a thrown
// failure with no kernel code - goes to the routed engine path under the
// routed mutation's key (the same entryId for the partition that answered),
// and without the key it is rethrown.
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
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

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

async function onLaneNode(body) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'lane-node'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  try {
    return await body();
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

// Send one write through the lane: the first local service throws, the next
// answers. Where the write went: on to the next local partition, back to the
// routed engine path (not handled, the next partition never asked), or
// rethrown to the caller.
function sendThrough(thrown, idempotencyKey) {
  return onLaneNode(async () => {
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
      if (asked.includes(NEXT_PARTITION)) {
        return outcome.handled === true ? 'sent-on' : 'sent-on-unhandled';
      }
      return outcome.handled === false ? 'routed-path' : 'answered';
    } catch (error) {
      return error === thrown ? 'rethrown' : `threw: ${error.message}`;
    }
  });
}

test('B3/B6: the local lane decides a thrown partition answer by its code, ' +
  'never by its text, and moves on only an answer that applied nothing',
async () => {
  const shapes = {
    // An unknown outcome may have committed here: never sent on to the next
    // partition (another entryId). Under the routed key the routed engine
    // path sends it again under the same key, whatever its text says.
    thrown_unknownCodeOpaqueText_withKey:
      [thrownUnknownOutcome(OPAQUE_TEXT), ROUTED_KEY],
    // Without the key it is rethrown - even when its text reads like a
    // not-leader refusal.
    thrown_unknownCodeNotLeaderText_withoutKey:
      [thrownUnknownOutcome(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE), null],
    thrown_unknownCode_withoutKey: [thrownUnknownOutcome(), null],
    // A typed not-leader refusal was never proposed here: sent on by its
    // code, whatever its text, with or without the key.
    thrown_typedNotLeader: [thrownNotLeader(), null],
    thrown_typedNotLeaderOpaqueText: [thrownNotLeader(OPAQUE_TEXT), null],
    thrown_typedNotLeader_withKey: [thrownNotLeader(), ROUTED_KEY],
    // No kernel code: not a partition answer, so nothing says the write was
    // never proposed. Never sent on: the routed path under the key, and
    // rethrown without it - even when its text names a retryable answer.
    thrown_unknownText_withKey:
      [new Error(ERRORS.WRITE_OUTCOME_UNKNOWN), ROUTED_KEY],
    thrown_unknownText_withoutKey:
      [new Error(ERRORS.WRITE_OUTCOME_UNKNOWN), null],
  };
  const decided = {};
  for (const [name, [thrown, key]] of Object.entries(shapes)) {
    decided[name] = await sendThrough(thrown, key);
  }
  assert.deepEqual(decided, {
    thrown_unknownCodeOpaqueText_withKey: 'routed-path',
    thrown_unknownCodeNotLeaderText_withoutKey: 'rethrown',
    thrown_unknownCode_withoutKey: 'rethrown',
    thrown_typedNotLeader: 'sent-on',
    thrown_typedNotLeaderOpaqueText: 'sent-on',
    thrown_typedNotLeader_withKey: 'sent-on',
    thrown_unknownText_withKey: 'routed-path',
    thrown_unknownText_withoutKey: 'rethrown',
  }, 'each thrown answer is decided by its code and the routed key');
});

// Verification round 4, F29: the lane parses its caller's statement through
// the engine's parse cache - the one the engine's own parse of that
// statement uses - and keeps no parse cache of its own.
test('F29: the lane parses through the engine\'s parse cache', async () => {
  await onLaneNode(async () => {
    const engine = new SQLQueryEngine({});
    const cdc = new CDCIntegrationService({nodeId: 'lane-node',
      sqlQueryEngine: engine});
    assert.equal(engine.parseCache.get(WRITE_SQL), null,
      'setup: the engine has not parsed the statement');
    const outcome = await sendLocalSystemTableWrite(cdc, [{partitionId:
      LOCAL_PARTITION, executeQuery: async () => ({success: true,
      changes: 1})}], {sql: WRITE_SQL, params: ['node-lane'],
      idempotencyKey: ROUTED_KEY});
    assert.equal(outcome.handled, true, 'setup: the lane sent the write');
    assert.notEqual(engine.parseCache.get(WRITE_SQL), null,
      'the engine\'s parse cache holds the lane\'s parse');
  });
});

// Verification round 3, B4 (static): every carrier of a partition write's
// entryId sends the statement in the one rendering the engine path sends,
// never its caller's text, so the partition's statement binding sees one
// statement per logical mutation. The coordinator's participants are
// rendered by the executor's one renderer; the lane sends what the rendering
// owner renders from its caller's statement; the relays carry the text they
// received.
//
// The census reads src and counts, per file, every mention of a name that
// derives an entryId or stamps one on a partition request, and every
// entryId property a file writes (an object key, a shorthand, a member
// assignment): an aliased or namespace import, a second derivation or send
// inside an already-listed file, and a literal {entryId: ...} request all
// change a count, so a new carrier fails the census until it is classified
// here (verification round 4, F25).
const SRC_ROOT = new URL('../../src/', import.meta.url);
const ENTRY_ID_PROPERTY =
  /(?<![.\w'"])entryId\s*:|[{,]\s*entryId\s*(?=[,}])|\.entryId\s*=(?!=)|\[\s*['"]entryId['"]\s*\]/gu;

// A tracked name imported, exported or destructured under another name.
const ENTRY_ID_NAME_ALIAS = new RegExp('\\b(deriveParticipantEntryId|' +
  'routedMutationLocalWriteOptions|QUERY_(MESSAGE|PAYLOAD)_FIELD_ENTRY_ID|' +
  'SPLIT_MIRROR_IDENTITY_FIELD)\\s*(\\bas\\b|:)', 'gu');

function sourceFiles(directory = SRC_ROOT) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)) :
      (entry.name.endsWith('.js') ? [new URL(entry.name, directory)] : []));
}

function codeOf(file) {
  return fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

// The files mentioning a pattern, each with how many times it does.
function mentionsOf(sources, pattern) {
  return Object.fromEntries(sources
    .map(({code, name}) => [name, [...code.matchAll(pattern)].length])
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right)));
}

function mentionsOfName(sources, name) {
  return mentionsOf(sources, new RegExp(`\\b${name}\\b`, 'gu'));
}

test('B4/F25: no carrier of an entryId sends its caller\'s statement text',
  () => {
    const sources = sourceFiles().map((file) => ({code: codeOf(file),
      name: file.pathname.slice(SRC_ROOT.pathname.length)}));
    const code = (name) => sources.find((source) => source.name === name)
      ?.code ?? '';
    assert.deepEqual({
      deriveParticipantEntryId:
        mentionsOfName(sources, 'deriveParticipantEntryId'),
      routedMutationLocalWriteOptions:
        mentionsOfName(sources, 'routedMutationLocalWriteOptions'),
    }, {
      // The one derivation: the coordinator defines it, exports it and
      // derives its participants' ids; the lane's options import and call it.
      deriveParticipantEntryId: {
        'cdc/cdc-routed-system-write-selection.js': 2,
        'query/distributed/distributed-write-coordinator.js': 3,
      },
      // The lane's options: defined and exported, imported and sent once.
      routedMutationLocalWriteOptions: {
        'cdc/cdc-local-system-table-write-lane.js': 2,
        'cdc/cdc-routed-system-write-selection.js': 2,
      },
    }, 'the entryId is derived by the coordinator and the lane\'s options, ' +
      'and the lane is the one carrier of its options');
    assert.deepEqual(mentionsOf(sources, ENTRY_ID_NAME_ALIAS), {},
      'no file names the derivation, the lane\'s options or a request ' +
      'field of an entryId under another name');
    assert.deepEqual({
      QUERY_MESSAGE_FIELD_ENTRY_ID:
        mentionsOfName(sources, 'QUERY_MESSAGE_FIELD_ENTRY_ID'),
      QUERY_PAYLOAD_FIELD_ENTRY_ID:
        mentionsOfName(sources, 'QUERY_PAYLOAD_FIELD_ENTRY_ID'),
      SPLIT_MIRROR_IDENTITY_FIELD:
        mentionsOfName(sources, 'SPLIT_MIRROR_IDENTITY_FIELD'),
    }, {
      // The request builder stamps it on the text it was given, and the
      // delivery's redirect reads it back.
      QUERY_MESSAGE_FIELD_ENTRY_ID: {
        'query/query-executor-partition-request-builders.js': 2,
        'query/query-executor-shared.js': 2,
        'query/query-executor-write-retry-routing.js': 2,
      },
      // The transport handler carries what it received.
      QUERY_PAYLOAD_FIELD_ENTRY_ID: {
        'partition/partition-service-entry-apply-base.js': 2,
        'partition/partition-service-shared.js': 2,
      },
      // The split mirror carries the source entry's identity.
      SPLIT_MIRROR_IDENTITY_FIELD: {
        'partition/partition-split-routing.js': 7,
      },
    }, 'the relays of an entryId carry what they received');
    assert.deepEqual(mentionsOf(sources, ENTRY_ID_PROPERTY), {
      // A receipt's witness, read from an answer.
      'admin/admin-write-receipt.js': 1,
      // The lane's options: the derived entryId.
      'cdc/cdc-routed-system-write-selection.js': 1,
      // Answers of a settled or pending statement.
      'partition/partition-committed-statement-outcome.js': 2,
      // The transport handler relays the entryId it received.
      'partition/partition-service-entry-apply-base.js': 1,
      // Answers of a proposed write.
      'partition/partition-service-raft-write-commit.js': 3,
      // executeQuery relays its caller's entryId into the write it builds.
      'partition/partition-service-write-metrics-base.js': 1,
      // The kernel's entry (its last-resort mint for a direct caller) and
      // its answers.
      'partition/partition-write-kernel.js': 10,
      // A released pending write's answer.
      'partition/proposal-queue.js': 1,
      // The coordinator's participant options: the derived entryId.
      'query/distributed/distributed-write-coordinator.js': 1,
      // CDC replication messages: not a partition SQL write.
      'worker/message-group-worker-service-cdc-methods.js': 2,
    }, 'every entryId property a src file writes is classified');
    const rendering = code('query/query-executor-sql-command-rendering.js');
    for (const method of ['executeInsert', 'executeUpdate', 'executeDelete']) {
      const body = rendering.split(`async ${method}(`)[1]?.split('\n  },')[0];
      assert.match(body ?? '', /const sql = renderWriteStatementSql\(ast\);/u,
        `the coordinator's participant text is ${method}'s one rendering`);
    }
    assert.deepEqual(Object.keys(mentionsOf(sources,
      /\.build(Insert|Update|Delete)SQL\(/gu)), [],
    'no path renders a write statement outside the one renderer');
    const lane = code('cdc/cdc-local-system-table-write-lane.js');
    assert.match(lane, /renderPartitionWriteStatement\(sql, params,/u,
      'the lane renders its caller\'s statement through the rendering owner');
    assert.deepEqual([...lane.matchAll(/executeQuery\(([^,]+),/gu)]
      .map((match) => match[1]), ['statement.sql'],
    'the lane sends the rendered statement, never its caller\'s text');
    assert.deepEqual(mentionsOfName(sources, 'SqlParseCache'), {
      'query/sql-parse-cache.js': 2,
      'query/sql-query-engine-instance-initializer.js': 2,
      'query/sql-query-engine-shared.js': 2,
    }, 'one parse cache: the engine\'s (F29)');
  });
