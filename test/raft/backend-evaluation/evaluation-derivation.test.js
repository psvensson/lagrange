// Three checks on the evaluation itself rather than on the core:
//
//  - no membership scenario declares the membership it then checks;
//  - the earlier spike in this tree is accounted for, against a census of
//    what that spike actually drove;
//  - the three conclusions and the deletion forecast follow from the recorded
//    scenario results by derivation, and the generated document is in sync.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

import {buildArtifact, renderMarkdown} from './build-evaluation-document.js';
import {
  ARTIFACT,
  MEASUREMENT_KEYS,
  loadEvaluationArtifact,
  loadEvaluationMarkdown,
  redactMeasurements,
} from './evaluation-artifact.js';
import {
  MEMBERSHIP_REFUSAL,
  ORIGIN,
  assertMembershipEqual,
  auditAgainstLedger,
  auditMembershipProvenance,
  changedNodeIds,
  confChangeV2,
  createDeterministicCluster,
  derivedMembership,
  membershipArray,
} from './forked-core-harness.js';
import {
  CENSUS,
  evidenceAccessorImportCensus,
  membershipAssertionCensus,
  rawMembershipAssertions,
} from './membership-assertion-census.js';
import {spikeCheckNames, spikeMembershipSites} from './spike-surface-census.js';
import {loadEvaluationArtifact as loadArtifact} from './evaluation-artifact.js';
import {
  CEILING,
  CONSENSUS_INPUTS,
  REQUIRED_WASM_GAPS,
  SEVERITY,
  VERDICT,
  WASM_INPUTS,
  consensusVerdict,
  wasmVerdict,
} from './verdict-derivation.js';

const DERIVATION = Object.freeze({
  // The scenario files whose subject is membership; the identity and cost
  // files legitimately name the ids they hand to the core.
  MEMBERSHIP_SCENARIO_PATTERN:
    /^(core-scenarios\.js|core-(membership|restart)-.*\.test\.js)$/u,
  SCENARIO_MODULE: 'core-scenarios.js',
  PEER_TABLE: 'PEER',
  ASSERTIONS: Object.freeze(['deepEqual', 'notDeepEqual', 'equal']),
  CORE_READERS: Object.freeze(['confStates(', 'conf_state(', 'statuses(']),
  UTF8: 'utf8',
  SCENARIOS: 'scenarios',
  SPIKE_SECTION: 'earlierSpike',
  VERDICTS: 'verdicts',
  FORECAST: 'deletionForecast',
  FORECAST_LABEL: 'forecast',
  MEMBERSHIP_LOCAL: 'MEMBERSHIP-LOCAL DELETE CANDIDATE',
  MIGRATION_VERDICTS: Object.freeze([
    'measured-favourable', 'measured-unfavourable', 'not-measurable-here']),
  DRIVEN: 'driven',
});

const here = path.dirname(new URL(import.meta.url).pathname);

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visit);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

// `[PEER.A, PEER.C].sort()` and `[PEER.A, PEER.C]` are the same declaration
// wearing different clothes, so chained calls are unwrapped first.
function arrayBase(node) {
  let current = node;
  while (current?.type === 'CallExpression' &&
      current.callee?.type === 'MemberExpression') {
    current = current.callee.object;
  }
  return current?.type === 'ArrayExpression' ? current : null;
}

function isAssertionCall(node) {
  return node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    DERIVATION.ASSERTIONS.includes(node.callee.property?.name);
}

function isDeclaredMembershipLiteral(node) {
  const array = arrayBase(node);
  if (!array || array.elements.length === 0) {
    return false;
  }
  return array.elements.every((element) =>
    (element?.type === 'MemberExpression' &&
      element.object?.name === DERIVATION.PEER_TABLE) ||
    (element?.type === 'Literal' && typeof element.value === 'string'));
}

function checkAssertion(node, name) {
  if (!isAssertionCall(node)) {
    return;
  }
  assert.ok(!isDeclaredMembershipLiteral(node.arguments?.[1]),
    `${name}:${node.loc.start.line} declares the membership it then ` +
    'checks; read it from the core or derive it from what the core ' +
    'reported before the change');
}

test('membership in every scenario is reported by the core, not declared',
  () => {
    // --- the RUNTIME half: what the scenarios actually did ---------------
    // Every core scenario carries the harness's own witness: how many
    // membership values it read out of the core, per peer, and how many
    // values it refused because they had not come from a read. A scenario
    // that read nothing cannot have checked membership from the core, and a
    // scenario that did not run cannot be cited at all.
    const artifact = loadArtifact();
    const witnessed = artifact.scenarios.filter((scenario) =>
      Object.hasOwn(scenario, 'witness'));
    assert.ok(witnessed.length > 0,
      'the artifact must carry scenarios with a membership witness');
    for (const scenario of witnessed) {
      assert.equal(scenario.driven, true,
        `${scenario.id} carries a witness but was not driven`);
      assert.ok(scenario.witness.total > 0,
        `${scenario.id} asserted on membership without reading it from the ` +
        'core');
      assert.equal(scenario.witness.refusals, 0,
        `${scenario.id} used ${scenario.witness.refusals} membership values ` +
        'that did not come from a core read');
      const peersRead = Object.keys(scenario.witness.byPeer);
      assert.ok(peersRead.length > 1,
        `${scenario.id} read membership from only ${peersRead.length} peer;` +
        ' a membership claim is about every peer');
    }

    // --- the STATIC half: how the scenarios are written ------------------
    const files = fs.readdirSync(here)
      .filter((name) => DERIVATION.MEMBERSHIP_SCENARIO_PATTERN.test(name));
    assert.ok(files.length > 0,
      'there must be membership scenario files to check');

    for (const name of files) {
      const source = fs.readFileSync(path.join(here, name), DERIVATION.UTF8);
      // A file either reads membership out of the core itself, or consumes
      // the records of the module that does. Nothing may state a membership
      // on its own authority.
      const readsFromCore =
        DERIVATION.CORE_READERS.some((reader) => source.includes(reader));
      const consumesScenarioRecords =
        source.includes(`./${DERIVATION.SCENARIO_MODULE}`);
      assert.ok(readsFromCore || consumesScenarioRecords,
        `${name} neither reads membership from the core nor consumes the ` +
        'records of the module that does');

      const tree = parse(source, {ecmaVersion: 'latest', sourceType: 'module',
        loc: true});
      walk(tree, (node) => checkAssertion(node, name));
    }

    // --- the STRUCTURAL half: the four bypasses round 1 left open --------
    assertNoRawMembershipAssertion();
    assertTheFourBypassesAreRefused(artifact);
  });

// (i), (ii), (iii): no membership value may appear in a raw assertion at
// all - not through a const, not through deepStrictEqual, not as a .length
// or a .join(). One rule closes all three, because none of those shapes can
// produce a branded expectation.
function assertNoRawMembershipAssertion() {
  // The subject files may not import anything that mints a membership value
  // of its own: what they assert on is a record the harness built and the
  // ledger audited.
  const accessors = evidenceAccessorImportCensus();
  assert.deepEqual(accessors.imported, [],
    'a membership test file imports an evidence-minting accessor: ' +
    JSON.stringify(accessors.imported));
  assert.equal(accessors.importsNoEvidenceMintingAccessor, true,
    'the subject files must import no evidence-minting accessor');
  assert.ok(accessors.knownSyntacticBypasses.length >= 6,
    'the census must record the syntactic shapes it does NOT see, rather ' +
    'than imply it sees everything');

  const census = membershipAssertionCensus();
  assert.ok(census.files.length > 0,
    'the census must have membership test files to read');
  assert.deepEqual(census.refused, [],
    'a membership value appears in a raw assertion: ' +
    JSON.stringify(census.refused));
}

// Each bypass, driven, with the refusal it must produce. A negative test
// that does not name the refusal proves nothing.
const BYPASS = Object.freeze([
  {
    name: 'a literal routed through a const',
    source: 'import assert from \'node:assert/strict\';\n' +
      'const EXPECTED = [PEER.A, PEER.B, PEER.C];\n' +
      'assert.deepEqual(record.confStateByPeer.a.voters, EXPECTED);\n',
  },
  {
    name: 'deepStrictEqual instead of deepEqual',
    source: 'import assert from \'node:assert/strict\';\n' +
      'assert.deepStrictEqual(state.voters, [\'1\', \'2\', \'3\']);\n',
  },
  {
    name: 'a .length or .join() comparison, through an alias',
    source: 'import assert from \'node:assert/strict\';\n' +
      'const seen = state.voters;\n' +
      'assert.equal(seen.length, 3);\n' +
      'assert.equal(state.learners.join(), \'4\');\n',
  },
]);

function assertTheFourBypassesAreRefused(artifact) {
  for (const bypass of BYPASS) {
    const refused = rawMembershipAssertions(bypass.source, bypass.name);
    assert.ok(refused.length > 0,
      `${bypass.name} must be refused by the census`);
    for (const entry of refused) {
      assert.equal(entry.refusal, CENSUS.REFUSAL,
        `${bypass.name} must be refused with the census's own reason`);
    }
  }
  assertEveryLaunderingIsRefused();

  // The same three, at RUNTIME, against a genuine core read: the helper
  // refuses a declared expectation even when the actual is measured.
  const cluster = createDeterministicCluster({voters: ['1']});
  let measured = null;
  try {
    measured = membershipArray(cluster.confStates().get('1'), 'voters');
  } finally {
    cluster.free();
  }
  assert.deepEqual([...measured], ['1'],
    'the core read must be the configuration the core reported');
  assert.throws(() => assertMembershipEqual(measured, ['1'], 'x'),
    new RegExp(MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION, 'u'),
    'a declared expectation must be refused however it is spelled');
  assert.throws(() => assertMembershipEqual(['1'], measured, 'x'),
    new RegExp(MEMBERSHIP_REFUSAL.UNBRANDED_ACTUAL, 'u'),
    'a declared ACTUAL must be refused too');

  // (iv) a scenario record whose configuration is a declared object. The
  // gate is the brand: `membershipArray` cannot read an object the harness
  // did not make, and the artifact builder refuses a record holding one.
  assert.throws(() => membershipArray({voters: ['1', '2']}, 'voters'),
    new RegExp(MEMBERSHIP_REFUSAL.UNBRANDED_SOURCE, 'u'),
    'a declared configuration state must not be readable as a membership');
  const declared = auditMembershipProvenance(
    [{id: 'fabricated', after: {voters: ['1', '2', '3']}}]);
  assert.equal(declared.violations.length, 1,
    'the artifact builder must refuse a declared membership in a record');
  assert.match(declared.violations[0], /^\/0\/after\/voters:/u,
    'the refusal must name the path it refused');

  // And the audit really ran over this artifact's own records, with a
  // meaningful number of fields, all of them from the core.
  const audit = artifact.scenarios
    .find((scenario) => scenario.id === 'membership-provenance-audit');
  assert.ok(audit, 'the artifact must carry the provenance audit');
  assert.deepEqual(audit.violations, [],
    'the artifact was built out of a membership the harness did not make');
  assert.ok(audit.membershipFieldsChecked > 100,
    `the audit inspected only ${audit.membershipFieldsChecked} membership ` +
    'fields, which is too few for the artifact it claims to cover');
  assert.ok(Object.keys(audit.byOrigin).every((origin) =>
    Object.values(ORIGIN).includes(origin)),
  `the audit saw an origin outside the closed set: ${
    Object.keys(audit.byOrigin)}`);
  // The evidence is BOUNDED by the ledger: every cited proposal was one the
  // core was actually given, and there are citations to bound.
  assert.equal(audit.everyCitedProposalWasProposed, true,
    'the artifact cites a configuration change the core was never given');
  assert.ok(audit.citedProposalOperations > 0,
    'no evidence in the artifact cites a proposal, so the bound is vacuous');
}

test('the earlier raft-logic spike findings are accounted for', () => {
  const checks = spikeCheckNames();
  assert.ok(checks.length > 0,
    'the census must find the checks the spike drove');

  // The measured form of "the spike never changed membership".
  const membershipSites = spikeMembershipSites();

  const artifact = loadEvaluationArtifact();
  const section = artifact[DERIVATION.SPIKE_SECTION];
  assert.ok(section, `the artifact must carry an ${DERIVATION.SPIKE_SECTION}` +
    ' section');
  const accounted = new Map(
    (section.checks || []).map((entry) => [entry.check, entry]));
  for (const check of checks) {
    const entry = accounted.get(check);
    assert.ok(entry, `the spike check ${check} is not accounted for`);
    assert.equal(typeof entry.finding, 'string',
      `${check} must record what the spike established`);
    assert.equal(typeof entry.bearing, 'string',
      `${check} must record what it bears on this evaluation`);
  }
  assert.deepEqual(section.membershipSites || [], membershipSites,
    'the artifact must record exactly the configuration-change sites the ' +
    'spike census finds in the spike sources');
});

// stablePeerIdentity is deliberately NOT an input of the consensus verdict:
// the core enforces nothing about peer ids (it re-adds a removed one), so
// identity is a host obligation and the boundary owes only that a u64
// crosses intact. The input tables themselves live in verdict-derivation.js,
// which is the function the values come from.
function assertConsensusVerdict(core) {
  for (const input of Object.keys(CONSENSUS_INPUTS)) {
    assert.ok(Object.hasOwn(core.inputs, input),
      `the consensus verdict must record the input ${input}`);
  }
  // Distinctness must be reported BOTH ways, honestly.
  const distinctness = core.boundaryDistinctness;
  assert.ok(distinctness, 'the verdict must record boundary distinctness');
  assert.ok(distinctness.distinctByHostState,
    'distinctness over the whole host state must be recorded');
  assert.ok(distinctness.distinctByFiveFieldDurableState,
    'distinctness over the five durable fields must be recorded');
  assert.ok(distinctness.distinctByFullDurableState,
    'distinctness over full durable state must be recorded');
  assert.ok(distinctness.batchShapeLimitations,
    'boundaries a batch shape cannot separate must be recorded');
  for (const [role, entry] of
    Object.entries(distinctness.distinctByFullDurableState)) {
    assert.equal(typeof entry.distinct, 'number',
      `${role}: the durable distinct count must be recorded`);
    assert.ok(Array.isArray(entry.collisions),
      `${role}: the durable equivalence classes must be named`);
  }
  // Every durable collision must be an explicitly claimed exemption with
  // raft-rs citations, and its members must restore identically.
  for (const claim of distinctness.intentionallyIndistinguishable) {
    assert.ok(claim.because.length > 0,
      'an exemption must say why the boundaries are the same durable state');
    assert.ok(claim.raftRsCitations.length > 0,
      'an exemption must cite the raft-rs contract');
  }
  assert.deepEqual(distinctness.unexplainedCollisions, [],
    'every durable collision must be an explicitly claimed exemption');
  for (const check of distinctness.identicalRestoreByClass) {
    assert.equal(check.identical, true,
      `${check.role}: [${check.boundaries}] share one durable state but ` +
      `restore differently (${check.differing}), so something non-durable ` +
      'leaked into the restore');
  }
  if (core.value !== 'viable') {
    return;
  }
  assert.equal(core.boundariesDistinct, true,
    'a viable consensus verdict requires every boundary to be a distinct ' +
    'host state');
  assert.equal(distinctness.everyCollisionExplained, true,
    'a viable consensus verdict requires every durable collision explained');
  assert.equal(distinctness.everyClassRestoresIdentically, true,
    'a viable consensus verdict requires identical restores within a class');
  assert.equal(core.mutantsKilled, true,
    'a viable consensus verdict requires every host-order mutant killed');
}

function assertWasmVerdict(wasm) {
  for (const input of Object.keys(WASM_INPUTS)) {
    assert.ok(Object.hasOwn(wasm.inputs, input),
      `the WASM verdict must record the input ${input}`);
  }
  assert.equal(wasm.hostConsensusSurface.decidesNothingLocally, true,
    'no consensus decision may be made in JavaScript');
}

function assertMigrationVerdict(migration) {
  assert.equal(migration.value, 'undetermined-needs-integration-stage',
    'the migration verdict may not be inflated by this quest');
  for (const [name, input] of Object.entries(migration.inputs)) {
    assert.ok(DERIVATION.MIGRATION_VERDICTS.includes(input.verdict),
      `${name} must carry one of the three sub-verdicts`);
    assert.equal(typeof input.finding, 'string',
      `${name} must record what was found`);
  }
  assert.ok(!JSON.stringify(migration.from).includes('liferaft'),
    'part A defects are reasons to replace the current backend, not ' +
    'evidence that an integration will succeed, and may not be inputs here');
}

function assertHostContract(hostContract) {
  assert.ok(hostContract, 'the artifact must carry the host contract');
  assert.ok(hostContract.steps.length > 0, 'the contract must have steps');
  for (const step of hostContract.steps) {
    assert.match(step.source, /^(examples|src)\/.+:\d+/u,
      `the step "${step.step}" must cite the raft-rs source it came from`);
  }
  for (const obligation of hostContract.hostMustGuarantee) {
    assert.match(obligation.source, /^(examples|src)\/.+/u,
      'every host obligation must cite its source');
  }
  assert.ok(hostContract.raftRsGuarantees.length > 0,
    'what raft-rs guarantees must be stated apart from what the host must');
}

test('the three verdicts and the deletion forecast follow by derivation and ' +
  'the document is in sync', async () => {
  const artifact = loadEvaluationArtifact();
  const scenarios = artifact[DERIVATION.SCENARIOS];
  assert.ok(Array.isArray(scenarios) && scenarios.length > 0,
    'the artifact must record scenario results');

  // Undriven is unanswered: a scenario that was not driven carries a reason
  // and may never be cited as support.
  const supporting = new Set();
  for (const scenario of scenarios) {
    assert.equal(typeof scenario.id, 'string', 'every scenario has an id');
    assert.equal(typeof scenario[DERIVATION.DRIVEN], 'boolean',
      `${scenario.id} must say whether it was driven`);
    if (scenario[DERIVATION.DRIVEN]) {
      supporting.add(scenario.id);
    } else {
      assert.equal(typeof scenario.reason, 'string',
        `${scenario.id} was not driven and must record why`);
    }
  }

  const verdicts = artifact[DERIVATION.VERDICTS];
  assert.ok(verdicts, 'the artifact must carry three verdicts');
  for (const key of ARTIFACT.VERDICT_KEYS) {
    const verdict = verdicts[key];
    assert.ok(verdict, `the ${key} verdict must exist`);
    assert.ok(ARTIFACT.VERDICT_VALUES.includes(verdict.value),
      `the ${key} verdict must be one of ` +
      `${ARTIFACT.VERDICT_VALUES.join(', ')}`);
    assert.ok(Array.isArray(verdict.from) && verdict.from.length > 0,
      `the ${key} verdict must name the scenarios it follows from`);
    for (const scenarioId of verdict.from) {
      assert.ok(supporting.has(scenarioId),
        `the ${key} verdict cites ${scenarioId}, which was not driven`);
    }
  }
  // Each verdict rests on its own evidence, so a failure is attributable.
  const cited = ARTIFACT.VERDICT_KEYS.map((key) => verdicts[key].from);
  assert.equal(new Set(cited.map((from) => [...from].sort().join())).size,
    ARTIFACT.VERDICT_KEYS.length,
    'the three verdicts must not rest on one undifferentiated pile');

  assertConsensusVerdict(verdicts.consensusCore);
  assertWasmVerdict(verdicts.wasmBoundary);
  assertMigrationVerdict(verdicts.lagrangeMigration);
  assertHostContract(artifact.hostContract);

  // The forecast is a forecast and says so.
  const forecast = artifact[DERIVATION.FORECAST];
  assert.ok(Array.isArray(forecast?.candidates) &&
    forecast.candidates.length > 0,
  'the deletion forecast must list candidates');
  assert.equal(forecast.label, DERIVATION.FORECAST_LABEL,
    'the deletion forecast must be labelled a forecast');
  assert.equal(forecast.countsOnly, DERIVATION.MEMBERSHIP_LOCAL,
    'the deletion forecast may count only the membership-local category');
  assert.deepEqual(forecast.countedNames,
    artifact.minimumBackendContract[DERIVATION.MEMBERSHIP_LOCAL].names,
    'the names it counts must be exactly that category\'s names');

  // The document is generated from the artifact, so every verdict value and
  // every forecast candidate must appear in it.
  const markdown = loadEvaluationMarkdown();
  for (const key of ARTIFACT.VERDICT_KEYS) {
    assert.ok(markdown.includes(verdicts[key].value),
      `the document must render the ${key} verdict`);
  }
  for (const candidate of forecast.candidates) {
    assert.ok(markdown.includes(candidate),
      `the document must render the forecast candidate ${candidate}`);
  }

  // --- SUBSTANCE, not shape -------------------------------------------------
  // Round 1's version of this receipt read the committed JSON and checked its
  // shape. The verifier set every consensus and WASM input to false in a copy,
  // falsified a scenario, left `value: viable` and the receipt stayed green.
  // The three checks below are what close that.
  assertDocumentIsTheRenderingOfTheArtifact(artifact, markdown);
  assertTheDocumentCarriesWhatItMust(artifact, markdown);
  await assertArtifactIsWhatTheScenariosRebuild(artifact);
  assertFalsifyingAnyInputMovesTheVerdict(verdicts);
});

// (1) The .md is EXACTLY the rendering of the committed .json - not "contains
// the verdict values". Rendering the committed artifact and comparing byte
// for byte cannot be satisfied by a document that says something else.
function assertDocumentIsTheRenderingOfTheArtifact(artifact, markdown) {
  assert.equal(renderMarkdown(artifact), markdown,
    'the committed .md is not the rendering of the committed .json: the ' +
    'document has drifted from the record it is generated from');
}

// Verification round 1 found the .md omitting the preliminary Multi-Raft
// statement, the narrowed re-application sentence and any sequential-against-
// joint section, and saying "nine DISTINCT host states" without the durable
// figure. The document is the thing a reader reads; what it must carry is a
// receipt, not a hope.
const RECOMMENDING = /\b(we recommend|Lagrange should use|should adopt|the better (style|choice)|is preferable)\b/iu;

function assertTheDocumentCarriesWhatItMust(artifact, markdown) {
  const required = [
    ['the PRELIMINARY Multi-Raft statement', 'Multi-Raft cost: PRELIMINARY'],
    ['the no-extrapolation sentence', 'do NOT extrapolate'],
    ['the narrowed re-application sentence',
      artifact.reApplicationFinding.statement],
    ['a sequential section', 'The sequential replacement, on its own terms'],
    ['a joint section', 'The joint replacement, on its own terms'],
    ['the distinctness figures', 'Boundary distinctness, all three figures'],
    ['what raft-rs guarantees', 'What raft-rs guarantees'],
    ['what the host must guarantee', 'What the host must guarantee'],
    ['the core-does-not list', 'The core does not do this for you'],
    ['the backend obligations',
      'What a Lagrange raft-rs backend must do'],
    ['the four-category census',
      'The minimum backend contract, in four categories'],
    ['the runtime-recovery measurement', 'Runtime trap recovery, measured'],
    ['the ingress-validation table', 'Ingress validation, measured'],
    ['the cost-figures disclaimer', 'No cost figure feeds any verdict input'],
  ];
  for (const heading of artifact.backendObligations
    .map((entry) => entry.heading)) {
    required.push([`the obligation "${heading}"`, heading]);
  }
  for (const [what, text] of required) {
    assert.ok(markdown.includes(text),
      `the document must carry ${what}`);
  }
  // All three distinctness figures, by name.
  for (const figure of ['Distinct by host state',
    'Distinct by the five durable fields',
    'Distinct by full durable state']) {
    assert.ok(markdown.includes(figure),
      `the document must give the figure "${figure}", not only the ` +
      'strongest one');
  }
  // Every named gap, with its attribution, in the document.
  const attributions = new Set(['raft-rs', 'wasm-binding', 'hosting-model',
    'host-obligation']);
  for (const gap of artifact.namedGaps) {
    assert.ok(attributions.has(gap.attribution),
      `the gap ${gap.id} must be attributed to one of ` +
      `[${[...attributions]}], not ${gap.attribution}`);
    assert.ok(markdown.includes(gap.id),
      `the document must carry the gap ${gap.id}`);
    assert.ok(markdown.includes(`attribution: **${gap.attribution}**`),
      `the document must carry the attribution of ${gap.id}`);
  }
  // Every host obligation and guarantee must cite its source in the document.
  for (const entry of artifact.hostContract.coreDoesNotDoThisForYou) {
    assert.ok(markdown.includes(entry.source),
      `the core-does-not entry "${entry.assumption}" must cite its source ` +
      'in the document');
  }
  // And no recommendation: which style Lagrange uses is not this quest's.
  const recommending = markdown.split('\n')
    .filter((line) => RECOMMENDING.test(line));
  assert.deepEqual(recommending, [],
    'the document recommends a replacement style, which this quest may not ' +
    `do: ${JSON.stringify(recommending)}`);
}

// Verification round 2 laundered the brand five ways and owner attack 11
// then succeeded with every receipt green. A brand is a mark and marks can
// be moved; the ledger is a RECORD, and each of these fails the comparison
// against it rather than a shape check.
function assertEveryLaunderingIsRefused() {
  const cluster = createDeterministicCluster({voters: ['1', '2', '3']});
  try {
    cluster.core.campaign(cluster.handleOf('1'));
    cluster.settle(400);
    const state = cluster.coreConfStateOf('1');
    const measured = membershipArray(state, 'voters');
    assert.equal(Object.isFrozen(measured), true,
      'a membership value must be frozen, or it can be emptied and refilled');
    assert.equal(Object.isFrozen(state), true,
      'a core-read ConfState must be frozen, or it can be mutated in place ' +
      'and read again');

    // 1. mutate after the fact
    assert.throws(() => {
      const forged = membershipArray(state, 'voters');
      forged.length = 0;
      forged.push('7', '8', '9');
    }, /read only|not extensible/u,
    'a membership value must not be mutable after it is produced');

    // 2. push an id into an expectation
    assert.throws(() => membershipArray(state, 'voters').push('9'),
      /not extensible/u, 'an expectation must not be extendable');

    // 3. a spread clone as an expectation
    assert.throws(() => assertMembershipEqual(measured, [...measured], 'x'),
      new RegExp(MEMBERSHIP_REFUSAL.DECLARED_EXPECTATION, 'u'),
      'a clone carries no evidence and must be refused');

    // 4 and 5. a declared literal laundered through a change nobody proposed
    const invented = confChangeV2([
      {type: 0, nodeId: '7'}, {type: 0, nodeId: '8'}]);
    assert.throws(() => changedNodeIds(invented),
      new RegExp(MEMBERSHIP_REFUSAL.NOT_PROPOSED, 'u'),
      'a change the core was never given is a declared literal');
    assert.throws(() => derivedMembership(measured,
      {adding: changedNodeIds(invented), removing: measured}, 'invented'),
    new RegExp(MEMBERSHIP_REFUSAL.NOT_PROPOSED, 'u'),
    'a derivation over an invented change must be refused');

    // 6. mutate the core-read ConfState in place, then read it again
    assert.throws(() => {
      state.voters = ['4', '5', '6'];
    }, /read only/u,
    'a core-read ConfState must not be mutable in place');

    // Owner attack 11, through the ledger: a declared set put where a core
    // read belongs is not what the ledger recorded, so the audit refuses it
    // and the artifact cannot be built out of it.
    const laundered = auditAgainstLedger(
      [{id: 'attack-11', confStateByPeer: {1: {voters: ['1', '2', '9']}}}]);
    assert.ok(laundered.violations.length > 0,
      'a declared set standing in for a core read must fail the ledger audit');
    assert.equal(laundered.everyCitedProposalWasProposed, true,
      'the audit must bound cited proposals by the ledger');
  } finally {
    cluster.free();
  }
}

// (2) The committed .json is EXACTLY what re-running the scenarios produces,
// except for the wall-clock and linear-memory measurements, which are
// redacted by name and then checked to be present and of the same type on
// both sides. Nothing else may differ: not a verdict, not an input, not a
// boundary fact, not a signature, not a named gap.
async function assertArtifactIsWhatTheScenariosRebuild(committed) {
  const rebuilt = await buildArtifact();
  const left = redactMeasurements(committed);
  const right = redactMeasurements(rebuilt);
  assert.deepEqual(right.redacted, left.redacted,
    'the committed artifact is not what the scenarios produce now: ' +
    'regenerate it, or the document records something no test measured');
  assert.equal(right.found.length, left.found.length,
    'the rebuilt artifact holds a different number of measurements');
  const byPath = new Map(left.found.map((entry) => [entry.at, entry]));
  for (const entry of right.found) {
    const before = byPath.get(entry.at);
    assert.ok(before, `${entry.at} is a measurement the committed artifact ` +
      'does not have');
    assert.equal(entry.type, MEASUREMENT_KEYS[entry.key],
      `${entry.at} must still be a ${MEASUREMENT_KEYS[entry.key]}`);
    assert.equal(before.type, MEASUREMENT_KEYS[entry.key],
      `${entry.at} in the committed artifact must be a ` +
      `${MEASUREMENT_KEYS[entry.key]}`);
  }
}

// (3) The verdict VALUES come from a pure function over named inputs. Feeding
// it each input false in turn must move the value: a decisive input to
// `not-viable`, a named-gap input to `viable-with-named-gaps`. If any input
// can be false while the verdict stays `viable`, the verdict is decorative.
function assertOneFalsification(table, verdictOf, inputs, name) {
  const falsified = {...inputs, [name]: false};
  const expected = table[name].severity === SEVERITY.DECISIVE ?
    VERDICT.NOT_VIABLE : VERDICT.WITH_GAPS;
  assert.equal(verdictOf(falsified).value, expected,
    `with ${name} false the verdict must be ${expected} (${name} is ` +
    `${table[name].severity}: ${table[name].because})`);
  const removed = {...inputs};
  delete removed[name];
  assert.equal(verdictOf(removed).value, VERDICT.NOT_VIABLE,
    `an unrecorded ${name} must not be treated as satisfied`);
}

function assertFalsifyingAnyInputMovesTheVerdict(verdicts) {
  const consensus = verdicts.consensusCore.inputs;
  const wasm = verdicts.wasmBoundary.inputs;
  // The recorded values must be the ones the pure function produces from the
  // recorded inputs, or the JSON could simply have been edited.
  assert.equal(consensusVerdict(consensus).value,
    verdicts.consensusCore.value,
    'the recorded consensus verdict is not what its own inputs derive');
  assert.equal(
    wasmVerdict(wasm, verdicts.wasmBoundary.openBindingGaps).value,
    verdicts.wasmBoundary.value,
    'the recorded WASM verdict is not what its own inputs derive');

  for (const name of Object.keys(CONSENSUS_INPUTS)) {
    assert.ok(Object.hasOwn(consensus, name),
      `the consensus verdict must record the input ${name}`);
    assertOneFalsification(CONSENSUS_INPUTS,
      (inputs) => consensusVerdict(inputs), consensus, name);
  }
  // CEILINGS: two verifiers measured the substance, and the derivation may
  // not claim more than they found however the inputs come out.
  const allTrue = Object.fromEntries(
    Object.keys(WASM_INPUTS).map((name) => [name, true]));
  assert.equal(wasmVerdict(allTrue, REQUIRED_WASM_GAPS).value,
    VERDICT.WITH_GAPS,
    'the WASM boundary may never be more than viable-with-named-gaps');
  assert.equal(wasmVerdict(allTrue, []).value, VERDICT.NOT_VIABLE,
    'a boundary verdict that does not carry the required named gaps is not ' +
    'the verdict this evaluation measured');
  assert.equal(CEILING.consensusCore, VERDICT.VIABLE,
    'the consensus core may never be more than viable');
  assert.equal(CEILING.lagrangeMigration, VERDICT.UNDETERMINED,
    'the migration verdict is exactly undetermined-needs-integration-stage');
  for (const gap of REQUIRED_WASM_GAPS) {
    assert.ok(verdicts.wasmBoundary.openBindingGaps.includes(gap),
      `the WASM verdict must carry the named gap ${gap}`);
  }

  for (const name of Object.keys(WASM_INPUTS)) {
    assert.ok(Object.hasOwn(wasm, name),
      `the WASM verdict must record the input ${name}`);
    assertOneFalsification(WASM_INPUTS,
      (inputs) => wasmVerdict(inputs, REQUIRED_WASM_GAPS), wasm, name);
  }
  // An open binding gap alone is enough to keep the boundary qualified,
  // and the required gaps must be carried whatever else is.
  assert.equal(
    wasmVerdict(wasm, [...REQUIRED_WASM_GAPS, 'some-open-gap']).value,
    VERDICT.WITH_GAPS,
    'an open gap attributed to the binding must qualify the verdict');
}
