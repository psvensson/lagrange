/**
 * Decoded readers keep HEAD's answers on partial rows (quest
 * system-table-row-decoders, round-4 ruling 2026-11-09): for every decoded
 * reader of nodes, services and replica_operations rows and every non-key
 * column of the table's schema, this tree's reader on the cache's marked
 * partial row gives exactly the answer HEAD 730225bf1 gave on the raw
 * partial row (frozen in the fixture), or the same refusal code; no named
 * state leaks into an answer. Anchor: the real message-group membership
 * branch selection CAS on SQLite, through the real CDC change extraction,
 * into a real cache, read by rowToOperation.
 *
 * Behaviour cases (rounds 4b and 5): an upper-case service_type, a stored
 * '' replica_id, known values stored in another case, unknown closed-domain
 * values, wrongly-typed values and stored NULLs read exactly as HEAD read
 * them, by every reader, the single-row decodes inside loops, filter
 * predicates and maps of replica_operations included (the replace-owner
 * wake loop, the membership recovery hint predicate, every multi-row
 * rowToOperation read): the decoders read like HEAD (round 5), so nothing
 * HEAD accepted is refused and no named state reaches an answer.
 *
 * The cases and the regeneration recipe: decoded-reader-differential-cases.js.
 * `--write-head-fixture <HEAD tree>` rewrites the fixture from that tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {
  MEMBERSHIP_BRANCH_SELECTION_SQL,
  answerBehaviourCases,
  answerEveryCase,
  loadTreeModules,
  membershipBranchSelectionAnswer,
} from './decoded-reader-differential-cases.js';

const TREE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = path.join(TREE_ROOT,
  'test/fixtures/decoded-reader-differential/head-730225bf1.json');
const MEMBERSHIP_AUTHORIZATION_SOURCE = path.join(TREE_ROOT,
  'src/rebalancer/replica-operation-message-group-membership-authorization.js');
const WRITE_FLAG = '--write-head-fixture';
const ANCHOR_CASE = 'anchor:membership-branch-selection-cas';

const writeIndex = process.argv.indexOf(WRITE_FLAG);
if (writeIndex >= 0) {
  const headRoot = path.resolve(process.argv[writeIndex + 1]);
  const mods = await loadTreeModules(headRoot);
  const fixture = {
    head: '730225bf1',
    cases: answerEveryCase(mods, null),
    [ANCHOR_CASE]: membershipBranchSelectionAnswer(mods, Database),
    behaviour: await answerBehaviourCases(mods, null),
  };
  fs.mkdirSync(path.dirname(FIXTURE_PATH), {recursive: true});
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 1)}\n`);
} else {
  const {test} = await import('../../src/test-helpers/tap.js');
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const mods = await loadTreeModules(TREE_ROOT);
  const servicesDecoder = await import('../../src/control-plane/services-row-decoder.js');
  const projectedReplica = await import('../../src/rebalancer/projected-replica.js');
  const current = {...servicesDecoder, ...projectedReplica};
  const answers = answerEveryCase(mods, current);
  const behaviour = await answerBehaviourCases(mods, current);

  test('every decoded reader keeps HEAD\'s answer for every dropped column', (t) => {
    t.same(Object.keys(answers).sort(), Object.keys(fixture.cases).sort(),
      'the same readers as the frozen HEAD answers');
    for (const [reader, byColumn] of Object.entries(fixture.cases)) {
      for (const [column, headAnswer] of Object.entries(byColumn)) {
        t.same(answers[reader]?.[column], headAnswer, `${reader} without ${column}`);
      }
    }
    t.notOk(JSON.stringify(answers).includes('"SYMBOL"'), 'no named state in any answer');
    t.end();
  });

  test('the dropped columns are exactly each table\'s non-key schema columns', async (t) => {
    const {NODES_SCHEMA, SERVICES_SCHEMA, REPLICA_OPERATIONS_SCHEMA} =
      await import('../../src/bootstrap/system-table-schemas-constants.js');
    const expected = {
      nodes: NODES_SCHEMA, services: SERVICES_SCHEMA,
      replica_operations: REPLICA_OPERATIONS_SCHEMA,
    };
    for (const [reader, byColumn] of Object.entries(answers)) {
      const schema = expected[reader.split(':')[0]];
      t.same(Object.keys(byColumn).sort(), ['(none)', ...schema.columns
        .map((column) => column.name)
        .filter((column) => !schema.primaryKey?.includes(column) &&
          column !== schema.columns.find((entry) => entry.primaryKey)?.name)].sort(),
      `${reader} covers the schema`);
    }
    t.end();
  });

  test('behaviour cases: every reader keeps HEAD\'s answer on every stored value', (t) => {
    t.same(Object.keys(behaviour).sort(), Object.keys(fixture.behaviour).sort(),
      'the same behaviour cases as the frozen HEAD answers');
    for (const [name, byReader] of Object.entries(fixture.behaviour)) {
      t.same(Object.keys(behaviour[name]).sort(), Object.keys(byReader).sort(),
        `${name}: the same readers`);
      for (const [reader, headAnswer] of Object.entries(byReader)) {
        t.same(behaviour[name][reader], headAnswer, `${name} ${reader}`);
      }
    }
    t.notOk(JSON.stringify(behaviour).includes('"SYMBOL"'), 'no named state in any answer');
    t.end();
  });

  test('the loop witnesses reach their decode on every row', (t) => {
    // Discrimination: each loop site's HEAD answer names the rows a refusal
    // would lose (an aborted loop, a rejected sweep).
    const unknown = fixture.behaviour['replica_operations:unknown-status'];
    t.same(unknown['replica_operations:replace-owner-wake-loop'].ok.map(([id]) => id),
      ['op-1', 'op-2'], 'HEAD woke both REPLACE owners, the unknown-status one included');
    t.ok(unknown['replica_operations:membership-recovery-hint-predicate'].ok,
      'HEAD\'s hint sweep and wakes answered over the unknown-status row');
    t.equal(unknown['replica_operations:operations-by-entity'].ok.length, 3,
      'HEAD read all three operations');
    t.end();
  });

  test('membership branch selection CAS: rowToOperation returns HEAD\'s operation', (t) => {
    t.ok(fs.readFileSync(MEMBERSHIP_AUTHORIZATION_SOURCE, 'utf8').includes(
      MEMBERSHIP_BRANCH_SELECTION_SQL.replace('completed_at IS NULL', '${settlement.sql}')),
    'the witness runs the production statement');
    const anchor = membershipBranchSelectionAnswer(mods, Database);
    t.equal(anchor.changes, 1, 'the CAS applied');
    t.notOk(anchor.payloadColumns.includes('steps_history'),
      'the read-back missed: the change lacks steps_history');
    t.ok(anchor.operation.ok, 'rowToOperation returns an operation');
    t.same(anchor, fixture[ANCHOR_CASE], 'HEAD\'s operation, field by field');
    t.end();
  });
}
