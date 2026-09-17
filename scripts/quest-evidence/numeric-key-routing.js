#!/usr/bin/env node
/**
 * Receipt harness for numeric-key-routing. Each claim is a named test in
 * test/partition/routing-key-comparator.test.js, plus the query-constants
 * vocabulary census in test/query/query-constants-vocabulary.test.js.
 *
 * The receipts separate: the routing bug itself (an integer key against the
 * text boundary the partitions table hands back), the single owner of
 * routing order across the three call sites, the typed refusal of a mixed
 * key space, and the dead vocabulary being gone from query-constants.js.
 */

import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'numeric-key-routing';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const ROUTING_TEST = 'test/partition/routing-key-comparator.test.js';
const VOCABULARY_TEST = 'test/query/query-constants-vocabulary.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['integer-key-routes-numerically-against-text-boundary', ROUTING_TEST,
    '^an integer key routes numerically against a text boundary$',
    'a JavaScript number key against the TEXT boundary the partitions table ' +
    'returns after a split routes by numeric order'],
  ['one-comparator-owns-routing-order', ROUTING_TEST,
    '^one comparator owns routing order for ranges, the resolver and live queries$',
    'KeyRange.compareKeys, PartitionResolver.compareValues and ' +
    'LiveQueryGroup.compareValues delegate to compareRoutingKeys'],
  ['mixed-key-space-refused', ROUTING_TEST,
    '^a mixed key space that is not a text-encoded number is refused, never coerced$',
    'the typed split-key mismatch outcome replaces String coercion'],
  ['dead-query-vocabulary-removed', VOCABULARY_TEST,
    '^every query-constants entry has a consumer$',
    'query-constants.js carries no entry that no importer references'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
