// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The membership-publication-epoch census (quest
// critical-spread-overflow-budget-audit, receipt
// epoch-domain-inventory-is-complete-by-census).
//
// The existing E8 inventory in replica-operation-membership-epoch-binding.test.js
// gates on the three spellings of the replica_operations COLUMN, which is why
// the alias observedMembershipEpoch escaped it.
//
// This census scans for identifiers that SPELL the concept, extends that seed
// by same-line data flow to a fixed point, adds the carrier's own named
// values and reason codes, and follows ONE hop of renaming into names that do
// not spell epoch. What it proves is therefore bounded, and the test is named
// for that bound rather than for completeness: the scan and the inventory
// agree TO THE STATED BOUND, and the scan's four blind spots - a bare `epoch`
// property name, a computed key, flow that crosses a function boundary
// without a same-line binding, and any rename beyond the first hop - are
// stated in the inventory's limits.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARRIER_TOKENS,
  censusMembershipEpochDomain,
} from './membership-epoch-census.js';
import {
  EPOCH_INVENTORY_JSON,
  readJsonArtifact,
} from './overflow-budget-audit-support.js';

const REPOSITORY_ROOT = process.cwd();
const ROLES = Object.freeze(
  ['writer', 'reader', 'alias', 'projection', 'serialization']);
// Aliases the round-1 pattern missed, each of which must now be censused.
const REQUIRED_ALIASES = Object.freeze([
  'observedMembershipEpoch', 'publishedPlanningEpoch', 'membershipEpoch',
  'partitionMembershipEpoch', 'capturedPublicationEpoch',
  'membershipPublicationEpoch', 'publicationEpoch', 'publication_epoch',
  'membership_publication_epoch',
  // Found by the verifier's same-line binding probe, and by this census's
  // own data-flow step.
  'sourceTopologyEpoch', 'source_topology_epoch', 'currentEpoch',
  'latestEpoch', 'fallbackEpoch', 'observedEpoch', 'topologyEpoch',
  // The carrier's own tokens, which spell the concept in words.
  ...CARRIER_TOKENS,
]);
const UNKNOWN_OBSERVES = 'unknown_not_traced';
// Renames whose target name does not spell epoch. The verifier's probe found
// seven; the census must reach at least those.
const UNRESOLVED_GROUP = 'unresolved-version-like-value';
const REQUIRED_RENAME_TOKENS = Object.freeze(['stamp', 'publicationRevision',
  'desiredPublicationRevision', 'source_snapshot_version']);

// The owner's rule 7: the entries are grouped three ways and the domain is
// NOT closed. Every token is in exactly one declared group, the unresolved
// group IS the untraced set, and the document says so in its own words.
function assertGroupedAndNotClosed(inventory, accounting) {
  const closure = inventory.domainIsNotClosed;
  const groupIds = new Set(closure.groups.map((group) => group.id));
  const counted = {};
  for (const entry of inventory.tokens) {
    assert.ok(groupIds.has(entry.group),
      `every token is in a declared group: ${entry.token}`);
    counted[entry.group] = (counted[entry.group] || 0) + 1;
  }
  assert.deepEqual(closure.counts, counted,
    'the group counts are the measured ones');
  assert.equal(closure.counts[UNRESOLVED_GROUP],
    accounting.unknownNotTraced,
    'the unresolved group IS the untraced set: this attempt does not close ' +
      'it, and does not pretend to');
  assert.ok(closure.statement.includes('claims no completeness'));
}

function siteKey(site) {
  return `${site.file}:${site.line}:${site.token}`;
}

test('the membership-publication-epoch census matches the inventory exactly',
  () => {
    const inventory = readJsonArtifact(EPOCH_INVENTORY_JSON);
    const census = censusMembershipEpochDomain(REPOSITORY_ROOT);
    const measured = census.sites;
    assert.equal(measured.length, inventory.siteCount,
      'the inventory records the measured site count');
    const recordedKeys = new Set(inventory.sites.map(siteKey));
    const measuredKeys = new Set(measured.map(siteKey));
    assert.deepEqual([...measuredKeys].filter((key) => !recordedKeys.has(key)),
      [], 'every censused file:line:token occurrence is in the inventory');
    assert.deepEqual([...recordedKeys].filter((key) => !measuredKeys.has(key)),
      [], 'the inventory records no occurrence that no longer exists');
    // The census reached a fixed point, and the inventory records how it got
    // there: a seed, a number of data-flow rounds, and what they added.
    assert.equal(census.rounds, inventory.method.fixedPointRounds);
    assert.equal(census.seedTokens.length, inventory.method.seedTokenCount);
    assert.equal(census.tokens.length - census.seedTokens.length,
      inventory.method.discoveredAliasCount);
    assert.ok(inventory.method.discoveredAliasCount > 0,
      'the data-flow step found aliases the spelling pattern did not');
    const tokens = new Set(measured.map((site) => site.token));
    for (const alias of REQUIRED_ALIASES) {
      assert.ok(tokens.has(alias), `the census reaches the alias: ${alias}`);
    }
    // Every measured token has a classified inventory entry that answers
    // what it denotes and what it observes - explicitly unknown where it was
    // not traced, never a pointer at the site list.
    const entries = new Map(
      inventory.tokens.map((entry) => [entry.token, entry]));
    assert.equal(entries.size, inventory.tokenCount);
    for (const token of tokens) {
      const entry = entries.get(token);
      assert.ok(entry, `the inventory classifies the token: ${token}`);
      assert.ok(ROLES.includes(entry.role),
        `the token's role is one of the five: ${token}`);
      assert.ok(entry.denotes && entry.denotes.length > 0,
        `the token states what it denotes: ${token}`);
      assert.ok(entry.observes && entry.observes.length > 0,
        `the token states what it observes: ${token}`);
      assert.ok(['hand-read', 'rule-template', UNKNOWN_OBSERVES]
        .includes(entry.observesKind),
      `the token states which KIND of answer that is: ${token}`);
      assert.ok(['hand-read', 'rule'].includes(entry.classificationBasis),
        `the token states how it was classified: ${token}`);
      assert.equal(entry.label,
        entry.classificationBasis === 'hand-read' ? 'CODE' : 'INFERRED',
        `a rule-classified entry is labelled INFERRED: ${token}`);
      if (entry.classificationBasis === 'hand-read') {
        assert.notEqual(entry.observes, UNKNOWN_OBSERVES,
          `a hand-read entry answers what it observes: ${token}`);
      }
    }
    for (const entry of inventory.tokens) {
      assert.ok(tokens.has(entry.token),
        `the inventory names a measured token: ${entry.token}`);
      const files = new Set(measured
        .filter((site) => site.token === entry.token)
        .map((site) => site.file));
      assert.deepEqual([...entry.files].sort(), [...files].sort(),
        `the inventory records the token's files: ${entry.token}`);
      assert.equal(entry.siteCount,
        measured.filter((site) => site.token === entry.token).length,
        `the inventory records the token's site count: ${entry.token}`);
    }
    // The three roles the round-1 inventory got wrong are no longer aliases.
    for (const token of ['publicationEpochDelta', 'publicationEpochAvailable',
      'membershipPublicationEpochBinding']) {
      assert.equal(entries.get(token).role, 'projection',
        `a delta, a boolean and a binding record are not aliases: ${token}`);
    }
    // Exactly one allocator, and it is named.
    const writers = inventory.tokens.filter((entry) => entry.role === 'writer');
    assert.equal(writers.length, 1,
      'the inventory names exactly one allocating token');
    assert.ok(inventory.authoritativeWriter.allocator.includes(
      'membership-publication-candidate-derivation.js'));
    // One hop of renaming into a name that does not spell epoch is followed
    // and inventoried as SITES; the identifiers are not promoted to tokens.
    const renameKeys = new Set(
      census.renameSites.map((site) => `${site.file}:${site.line}`));
    assert.equal(census.renameSites.length, inventory.renameSiteCount,
      'the inventory records the measured rename-site count');
    assert.equal(
      new Set(census.renameSites.map((site) => site.token)).size,
      inventory.renameTokenCount,
      'and the measured rename-token count');
    assert.deepEqual(
      inventory.renameSites.map((site) => `${site.file}:${site.line}`)
        .filter((key) => !renameKeys.has(key)),
      [], 'the inventory records no rename site that no longer exists');
    const renameTokens = new Set(
      census.renameSites.map((site) => site.token));
    for (const required of REQUIRED_RENAME_TOKENS) {
      assert.ok(renameTokens.has(required),
        `the census follows the rename into: ${required}`);
    }
    for (const site of inventory.renameSites) {
      assert.ok(tokens.has(site.boundFrom),
        `a rename site names the concept token it came from: ${site.token}`);
      assert.equal(entries.has(site.token), false,
        'a renamed-into identifier is a site, not a promoted token: ' +
          site.token);
    }
    // The three kinds of "what it observes" answer are counted separately,
    // because a rule-template answer is a generic non-answer, not a trace.
    const accounting = inventory.observesAccounting;
    assert.equal(accounting.handRead,
      inventory.tokens.filter((entry) => entry.observesKind === 'hand-read')
        .length);
    assert.equal(accounting.ruleTemplate,
      inventory.tokens.filter((entry) =>
        entry.observesKind === 'rule-template').length);
    assert.equal(accounting.unknownNotTraced,
      inventory.tokens.filter((entry) =>
        entry.observesKind === UNKNOWN_OBSERVES).length);
    assert.equal(accounting.handRead + accounting.ruleTemplate +
      accounting.unknownNotTraced, inventory.tokenCount,
    'every token is accounted for in exactly one kind');
    assert.ok(accounting.ruleTemplate > 0 && accounting.unknownNotTraced > 0,
      'and both non-answer kinds are reported, not merged');
    assertGroupedAndNotClosed(inventory, accounting);
    // The scan's blind spots are disclosed, not merely known.
    const limits = inventory.limits.join(' ');
    assert.ok(limits.includes('bare `epoch`'),
      'the limits disclose the bare-epoch blind spot');
    assert.ok(limits.includes('computed'),
      'the limits disclose the computed-key blind spot');
    assert.ok(limits.includes('crosses a function boundary'),
      'the limits disclose the cross-function blind spot');
    assert.ok(limits.includes('rename site beyond the first hop'),
      'the limits disclose the rename blind spot');
    assert.ok(limits.includes('value is on the NEXT line'),
      'the limits disclose the multi-line binding blind spot, and name the ' +
        'two sites a separate probe measured');
    assert.ok(limits.includes('generic non-answer'),
      'the limits say plainly that a rule-template answer is a non-answer');
    assert.ok(limits.includes('sourceTopologyEpoch'),
      'the limits disclose that same-line binding can pull in a token whose ' +
        'meaning elsewhere is a different concept');
    // The six src files carrying the escaped alias are recorded, and the two
    // that predate the carry stage are named.
    const aliasFiles = new Set(measured
      .filter((site) => site.token === 'observedMembershipEpoch')
      .map((site) => site.file));
    assert.deepEqual([...aliasFiles].sort(),
      [...inventory.aliasEscapedTheExistingInventory.srcFilesCarryingIt].sort(),
      'the escaped alias\'s src files are the measured ones');
    assert.equal(
      inventory.aliasEscapedTheExistingInventory.predatingTheCarryStage.length,
      2);
  });
