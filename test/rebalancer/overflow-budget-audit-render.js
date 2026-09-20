// The ONE renderer of the overflow-budget audit's markdown. The repository
// artifacts under solve/epics/formation-seed-decoupling/ are written from
// this module, and the matrix validator re-renders from the same JSON and
// compares, so the markdown can never drift from the JSON it states (R05:
// derived material never competes with its producer).
import {
  observeExternalArtifact,
  observeFindingResolution,
} from './overflow-budget-audit-observation.js';

const NL = '\n';
const BULLET = '- ';
const STILL_UNCLASSIFIED = 'still-unclassified';
const AUTHORITY_REQUIRED = 'explicit-authority-required';
const NONE_IDENTIFIED = 'none_identified';
const GATE_STATUS = Object.freeze({
  DEMONSTRATED: 'demonstrated',
  NOT_YET: 'not-yet',
  BLOCKED: 'blocked-on-owner-decision',
});
// The row that mints today. Every other authority-required row must carry a
// repair GROUP naming the semantic cause its repair quest is grouped under.
const MINTS_TODAY = 'five-minted-spread-cure-add';

// The gate's CONTRACT. It lives HERE, beside the derivation, and never in the
// artifact: what an item selects, how much of it must be present, what it
// requires, which findings block it and which external artifacts it waits on.
// The status is therefore MONOTONIC against every edit to the JSON - removing
// a row, a finding, a test or a requirement can only lose an item's evidence,
// never supply it - and the validator recomputes each status from this table.
const GATE_CONTRACT = Object.freeze([
  {item: 1, rowSelection: {kind: 'all'}, minimumRowCount: 27,
    minimumTestCount: 3, requires: ['noSupportingRowUnclassified'],
    blockingFindings: [], requiredExternalArtifacts: [], ownerDecisions: []},
  {item: 2, rowSelection: {kind: 'guardReachable'}, minimumRowCount: 20,
    minimumTestCount: 2,
    requires: ['noSupportingRowUnclassified', 'everySupportingRowHasAnOwner'],
    blockingFindings: ['spread-recovery-decision-has-two-owners'],
    requiredExternalArtifacts: [], ownerDecisions: []},
  {item: 3,
    rowSelection: {kind: 'byDisposition', values: [AUTHORITY_REQUIRED]},
    minimumRowCount: 1, minimumTestCount: 2,
    requires: ['everyAuthorityRequiredRowMintsOrHasARepairGroup'],
    blockingFindings: ['spread-recovery-decision-has-two-owners',
      'cross-partition-coupling-is-legacy'],
    requiredExternalArtifacts: [],
    ownerDecisions: [
      'whether to establish ONE spread-recovery decision owner that both ' +
        'the ADD and the REPLACE mechanism consume, and where the ' +
        'distinct-node condition is decided',
      'whether to widen the mint to the expand condition',
      'what the mint states as its membership identity, which decides ' +
        'whether the ESTABLISHING window can ever mint',
      'whether an undeclared partition row should withhold the plan rather ' +
        'than only the mint']},
  {item: 4, rowSelection: {kind: 'byOperationTypeOnly', values: ['REPLACE']},
    minimumRowCount: 6, minimumTestCount: 2,
    requires: ['noSupportingRowUnclassified'],
    blockingFindings: ['chained-relocation-is-a-serialization-defect',
      'spread-recovery-decision-has-two-owners'],
    requiredExternalArtifacts: [], ownerDecisions: []},
  {item: 5, rowSelection: {kind: 'byRepairGroup',
    values: ['close-topology-publication-version-identity',
      'establishing-publication-semantics']},
  minimumRowCount: 2, minimumTestCount: 2,
  requires: ['noSupportingRowUnclassified', 'namedFindingsResolved'],
  blockingFindings: ['epoch-readers-diverge-and-the-domain-is-not-closed'],
  requiredExternalArtifacts: [],
  ownerDecisions: [
    'which canonical membership-publication identity the authorization ' +
      'carries, and which single owner resolves it for both the mint and ' +
      'the validation']},
  {item: 6, rowSelection: {kind: 'none'}, minimumRowCount: 0,
    minimumTestCount: 1, requires: ['namedFindingsResolved'],
    blockingFindings: ['membership-ceiling-may-undercount-the-union'],
    requiredExternalArtifacts: [], ownerDecisions: []},
  {item: 7, rowSelection: {kind: 'none'}, minimumRowCount: 0,
    minimumTestCount: 2, requires: ['namedFindingsResolved'],
    blockingFindings: ['row-type-is-not-part-of-authority-identity',
      'partition-identity-is-not-on-the-record',
      'membership-ceiling-may-undercount-the-union'],
    requiredExternalArtifacts: [], ownerDecisions: []},
  {item: 8, rowSelection: {kind: 'none'}, minimumRowCount: 0,
    minimumTestCount: 1,
    requires: ['namedFindingsResolved', 'requiredExternalArtifactsExist'],
    blockingFindings: ['honoured-does-not-include-the-bound'],
    requiredExternalArtifacts: ['authorization-identity-and-evaluation-quest'],
    ownerDecisions: []},
  {item: 9, rowSelection: {kind: 'byId',
    values: ['five-minted-authorization-stale-at-promotion']},
  minimumRowCount: 1, minimumTestCount: 1,
  requires: ['noSupportingRowUnclassified', 'namedFindingsResolved'],
  blockingFindings: ['future-epoch-is-honoured',
    'invalid-supplied-epoch-is-not-evaluated',
    'intent-unknown-is-unreachable-from-a-row',
    'honoured-does-not-include-the-bound'],
  requiredExternalArtifacts: [], ownerDecisions: []},
]);

const ROW_SELECTORS = Object.freeze({
  all: () => true,
  byId: (row, values) => values.includes(row.id),
  byDisposition: (row, values) =>
    values.includes(row.enforcementDisposition),
  byOperationTypeOnly: (row, values) => {
    const types = row.producerOperationTypes || [];
    return types.length === values.length &&
      types.every((type) => values.includes(type));
  },
  byRepairGroup: (row, values) => values.includes(row.repairGroup),
  guardReachable: (row) => row.guardReachable.value === 'yes',
  none: () => false,
});

function gateContractFor(item) {
  return GATE_CONTRACT.find((entry) => entry.item === item);
}

/**
 * How an item selects its rows, rendered from the CONTRACT. It was a stored
 * string until round 1 found item 3's copy still saying "at least 3" over a
 * single selected row; a derived document never restates a contract.
 * @param {number} item the gate item number
 * @return {string} the selector and its minimum
 */
function renderRowSelection(item) {
  const contract = gateContractFor(item);
  if (!contract) {
    return 'none (no contract for this item)';
  }
  const selection = contract.rowSelection;
  const values = (selection.values || []).join(', ');
  return `${selection.kind}${values.length > 0 ? `: ${values}` : ''} ` +
    `(at least ${contract.minimumRowCount} row(s))`;
}

// The rows an item rests on are SELECTED from the matrix by a declarative
// rule, never listed by hand, so a row cannot be dropped from an item's
// support without being dropped from the matrix.
function selectGateRows(matrix, item) {
  const contract = gateContractFor(item);
  if (!contract) {
    return [];
  }
  const selection = contract.rowSelection;
  return matrix.rows.filter((row) =>
    ROW_SELECTORS[selection.kind](row, selection.values || []));
}

// Which findings can gate anything at all is the CONTRACT's own business: a
// finding blocks an item iff that item's contract names it. Everything else
// is a recorded result and gates nothing, so it is never "open".
function findingIsGateBlocking(id) {
  return GATE_CONTRACT.some((entry) => entry.blockingFindings.includes(id));
}

// A finding is resolved only by a resolution ARTIFACT that names it. A
// finding missing from the matrix is never resolved, so deleting one can
// unblock nothing.
function findingIsResolved(matrix, id, root) {
  const finding = matrix.findings.find((entry) => entry.id === id);
  return Boolean(finding) && observeFindingResolution(finding, root).resolved;
}

/**
 * Whether one finding is OPEN, derived: it gates something and no resolution
 * artifact resolves it. Nothing in the matrix declares this.
 * @param {Object} matrix the whole decision matrix
 * @param {string} id the finding id
 * @param {string} [root] the repository root to observe
 * @return {boolean} true when the finding is open
 */
function findingDerivedOpen(matrix, id, root) {
  return findingIsGateBlocking(id) && !findingIsResolved(matrix, id, root);
}

const GATE_REQUIREMENTS = Object.freeze({
  noSupportingRowUnclassified: (ctx) => ctx.rows.every((row) =>
    row.enforcementDisposition !== STILL_UNCLASSIFIED),
  everySupportingRowHasAnOwner: (ctx) => ctx.rows.every((row) =>
    row.semanticOwner !== NONE_IDENTIFIED),
  everyAuthorityRequiredRowMintsOrHasARepairGroup: (ctx) =>
    ctx.rows.every((row) =>
      row.enforcementDisposition !== AUTHORITY_REQUIRED ||
      row.id === MINTS_TODAY || Boolean(row.repairGroup)),
  namedFindingsResolved: (ctx) => ctx.contract.blockingFindings
    .every((id) => findingIsResolved(ctx.matrix, id, ctx.root)),
  requiredExternalArtifactsExist: (ctx) =>
    ctx.contract.requiredExternalArtifacts.every((id) => {
      const declared = (ctx.entry.requiredExternalArtifacts || [])
        .find((artifact) => artifact.id === id);
      return Boolean(declared) &&
        observeExternalArtifact(declared, ctx.root).satisfied;
    }),
  enoughRowsSelected: (ctx) =>
    ctx.rows.length >= ctx.contract.minimumRowCount,
  enoughTestsCited: (ctx) =>
    (ctx.entry.tests || []).length >= ctx.contract.minimumTestCount,
});

function gateRequirementNames(contract) {
  return ['enoughRowsSelected', 'enoughTestsCited', ...contract.requires];
}

/**
 * The requirements one gate item does NOT meet, in contract order. It is what
 * the rendered document prints as "what is missing", so the missing evidence
 * is always the same list the status was derived from.
 * @param {Object} matrix the whole decision matrix
 * @param {Object} entry one gate item's prose inputs
 * @param {string} [root] the repository root the observations read
 * @return {Array<string>} the names of the failing requirements
 */
function unmetGateRequirements(matrix, entry, root) {
  const contract = gateContractFor(entry.item);
  if (!contract) {
    return ['noContractForThisItem'];
  }
  const ctx = {matrix, entry, contract, root,
    rows: selectGateRows(matrix, entry.item)};
  return gateRequirementNames(contract)
    .filter((name) => !GATE_REQUIREMENTS[name](ctx));
}

/**
 * Derive one gate item's status from the CONTRACT above and the matrix it is
 * given. It is never written by hand: the generator and the validator both
 * call this, so a status that does not follow from the evidence cannot be
 * recorded, and no edit to the artifact can promote an item.
 * @param {Object} matrix the whole decision matrix
 * @param {Object} entry one gate item's prose inputs
 * @param {string} [root] the repository root the observations read
 * @return {string} one of the three statuses
 */
function deriveGateStatus(matrix, entry, root) {
  const contract = gateContractFor(entry.item);
  if (!contract) {
    return GATE_STATUS.NOT_YET;
  }
  if (contract.ownerDecisions.length > 0) {
    return GATE_STATUS.BLOCKED;
  }
  return unmetGateRequirements(matrix, entry, root).length === 0 ?
    GATE_STATUS.DEMONSTRATED :
    GATE_STATUS.NOT_YET;
}

/**
 * The open findings that block one gate item, derived from the findings' own
 * gateItems declaration. A finding that is MISSING from the matrix counts as
 * open: deleting it never unblocks anything.
 * @param {Object} matrix the whole decision matrix
 * @param {number} item the gate item number
 * @param {string} [root] the repository root the observations read
 * @return {Array<string>} the blocking findings still open
 */
function openGateFindings(matrix, item, root) {
  const contract = gateContractFor(item);
  return (contract ? contract.blockingFindings : [])
    .filter((id) => !findingIsResolved(matrix, id, root));
}

function heading(level, text) {
  return `${'#'.repeat(level)} ${text}`;
}

function bullets(items) {
  return items.map((item) => `${BULLET}${item}`);
}

function labelledEvidence(evidence) {
  return bullets(evidence.map((item) => `**${item.label}** - ${item.text}`));
}

// A rendered value may never be a placeholder. Round 2 found eleven lines
// reading "at undefined" because the renderer read a field that had been
// renamed; the renderer now refuses rather than printing the hole.
const PLACEHOLDERS = Object.freeze(['undefined', 'null', 'NaN',
  '[object Object]']);

function renderedValue(value, where) {
  const rendered = Number.isNaN(value) ? 'NaN' : String(value);
  if (PLACEHOLDERS.includes(rendered)) {
    throw new Error(`a rendered value is a placeholder: ${where} = ${rendered}`);
  }
  return rendered;
}

function field(name, value) {
  return `${BULLET}**${name}**: ${renderedValue(value, name)}`;
}

function optionalField(name, value) {
  return value === null || value === undefined ? [] : [field(name, value)];
}

// Total by construction: a domain that is not the structured object the
// validator requires is rendered as whatever it is, so the VALIDATOR is what
// reports it rather than the renderer throwing on the way past.
function domainLines(domain) {
  if (!domain) {
    return [];
  }
  if (typeof domain !== 'object' || !Array.isArray(domain.partitionIds)) {
    return [field('proved-unreachable domain', String(domain))];
  }
  return [
    field('proved-unreachable domain', domain.statement),
    `  - grid: ${domain.test}, ${domain.statesPerPartition} states per ` +
      `partition over ${domain.partitionIds.length} partition(s)`,
    `  - ranges: ${Object.entries(domain.ranges)
      .map(([name, values]) => `${name}=[${values.join(', ')}]`).join('; ')}`,
    `  - code argument: ${domain.codeArgument}`,
  ];
}

// The D3 correction's carrier. A proved-unreachable row says WHAT is
// unreachable and what stays reachable, as structure rather than as prose to
// be read charitably.
function qualificationLines(row) {
  const qualification = row.domainQualification;
  return [
    ...(row.unreachableSubject === undefined ?
      [] :
      [field('unreachable subject', `**${row.unreachableSubject}**`)]),
    ...(qualification ? [
      `  - unreachable: ${qualification.unreachable}`,
      `  - remains reachable: ${qualification.remainsReachable.join(', ')}`,
      `  - state slice: ${qualification.sliceId}`,
      `  - statement: ${qualification.statement}`,
      `  - code argument: ${qualification.codeArgument}`,
    ] : []),
    ...(row.ledgerAuthorityResult === undefined ?
      [] :
      [field('ledger result', row.ledgerAuthorityResult)]),
  ];
}

function receiptLines(row) {
  return (row.receipts || []).length === 0 ?
    [] :
    [field('bound receipts', row.receipts.join(', '))];
}

function sixAnswerLines(answers) {
  if (!answers) {
    return [];
  }
  return [
    field('six answers', ''),
    `  1. can an over-target promotion or replacement reach the guard: ${
      answers.overTargetPromotionReachesTheGuard}`,
    `  1b. is it granted today: ${answers.overTargetPromotionIsGrantedToday}`,
    `  2. under what semantic condition is it legitimate: ${
      answers.legitimacyCondition}`,
    `  3. which component owns that condition: ${answers.owningComponent}`,
    `  4. is it really the spread-cure semantic: ${
      answers.isSpreadCureSemantic}`,
    `  5. production-shaped witness constructed: ${
      answers.productionShapedWitnessConstructed}`,
    `  6. does removing the budget change the decision: ${
      answers.budgetRemovalChangesTheDecision}`,
  ];
}

function reachabilityLines(row) {
  return [
    field('guard-reachable', `**${row.guardReachable.value}** - witness: ${
      row.guardReachable.witness}`),
    field('producer-reachable', `**${row.producerReachable.value}** - ` +
      `witness: ${row.producerReachable.witness}`),
  ];
}

// The receipt the dependency claim rests on. `does_not_depend` prints the
// complete-domain differential; `depends` prints the one state in which only
// the budget changes; the other three print why no differential exists.
function dependencyReceiptLines(row) {
  const witness = row.budgetDifferentialWitness;
  const independence = row.budgetIndependenceMeasurement;
  return [
    ...(witness ? [field('budget-only differential',
      `${witness.state} (${witness.test})`)] : []),
    ...(independence ? [field('budget-independence differential',
      `${independence.statesInWhichItHolds} (${independence.test})`)] : []),
    ...optionalField('census-movement condition', row.censusMovementCondition),
    ...optionalField('dependency unknown because', row.dependencyUnknownBecause),
  ];
}

function formationLines(row) {
  const formation = row.formationEvidence;
  return [
    field('formation evidence (never upgrades a disposition)', formation.text),
    `  ${BULLET}producer attributed: ${formation.producerAttributed}` +
      `; attribution form: ${formation.attributionForm || 'none'}`,
    ...(formation.attributionArgument ?
      [`  ${BULLET}attribution argument: ${formation.attributionArgument}`] :
      []),
  ];
}

function rowSection(row) {
  return [
    heading(3, row.id),
    '',
    field('path', row.path),
    field('partition class', row.partitionClass.join(', ')),
    field('producers', row.producers.join(', ')),
    field('triggering state', row.triggeringState),
    field('current guard reason', row.currentGuardReason),
    field('current budget dependency', `**${row.currentBudgetDependency}**`),
    ...dependencyReceiptLines(row),
    ...reachabilityLines(row),
    field('admission classes',
      row.admissionClasses.length > 0 ?
        row.admissionClasses.join(', ') :
        'none (no budget-admitted case)'),
    field('semantic owner', row.semanticOwner),
    field('semantic owner reason', row.semanticOwnerReason),
    field('proposed authorization kind', row.proposedAuthorizationKind),
    ...optionalField('proposed kind note', row.proposedAuthorizationKindNote),
    field('minting evidence available', row.mintingEvidenceAvailable),
    field('validation evidence available', row.validationEvidenceAvailable),
    field('enforcement disposition', `**${row.enforcementDisposition}**`),
    ...qualificationLines(row),
    ...domainLines(row.provedUnreachableDomain),
    ...receiptLines(row),
    ...optionalField('policy cure condition', row.policyCureCondition),
    ...optionalField('producer operation types',
      (row.producerOperationTypes || []).join('/')),
    ...optionalField('still-unclassified because', row.stillUnclassifiedBecause),
    ...optionalField('what would classify it', row.requirementToClassify),
    ...optionalField('repair group (nothing started)', row.repairGroup),
    ...optionalField('grouping criterion', row.groupingCriterion),
    ...sixAnswerLines(row.sixAnswers),
    ...formationLines(row),
    field('evidence', ''),
    ...labelledEvidence(row.evidence).map((line) => `  ${line}`),
    '',
  ];
}

function matrixHeader(matrix) {
  return [
    heading(1, 'Overflow-budget decision matrix'),
    '',
    'Generated from `overflow-budget-decision-matrix.json` by ' +
      '`test/rebalancer/overflow-budget-audit-render.js`. Do not edit by ' +
      'hand: the matrix validator re-renders and compares.',
    '',
    field('quest', matrix.quest),
    field('epic', matrix.epic),
    field('measured at head', matrix.measuredAtHead),
    field('purpose', matrix.purpose),
    '',
    heading(2, 'Method'),
    '',
    field('what the budget is', matrix.method.budgetDefinition),
    field('correction', matrix.method.budgetDefinitionCorrection),
    field('grid', `${matrix.method.grid.rowCount} rows, ` +
      `${matrix.method.grid.rowsWithBudget} with a non-zero budget, ` +
      `${matrix.method.grid.admittedRowCount} budget-admitted`),
    field('grid domain', matrix.method.grid.domain),
    field('completeness argument', matrix.method.grid.completenessArgument),
    field('the even-voter gate', matrix.method.grid.evenVoterGateFinding),
    field('the partition domain', matrix.method.partitionDomainFinding),
    field('row identity', matrix.method.rowIdentityNote),
    '',
    heading(2, 'Limits of this method'),
    '',
    ...bullets(matrix.limits),
    '',
  ];
}

function partitionSetLines(matrix) {
  const sets = matrix.partitionSets;
  return [
    heading(2, 'The measured partition sets'),
    '',
    field('bootstrap-critical', `${sets.counts.critical} partitions`),
    field('mintable', `${sets.counts.mintable}: ${sets.mintable.join(', ')}`),
    field('budget-evaluated',
      `${sets.counts.budgetEvaluated}: ${sets.budgetEvaluated.join(', ')}`),
    field('critical without a mint', `${sets.counts.criticalWithoutMint}`),
    field('the owner\'s seven', sets.ownerNamedSeven.join(', ')),
    field('the remainder', `${sets.counts.remainder}: ${
      sets.remainder.join(', ')}`),
    '',
    heading(2, 'Admission classes'),
    '',
    ...bullets(matrix.admissionClasses.map((entry) =>
      `\`${entry.id}\` (over by ${entry.overBy}) - ${entry.meaning}`)),
    '',
  ];
}

function producerLines(matrix) {
  return [
    heading(2, 'Add-like operation producers'),
    '',
    ...matrix.producers.flatMap((producer) => [
      `${BULLET}\`${producer.id}\` - ${producer.file}:${producer.entryPoint}`,
      `  - sink: ${producer.sink}; types: ${producer.addLikeTypes.join('/')}` +
        `; mints: ${producer.mintsAuthorization}`,
      `  - partition scope (${producer.partitionScope.kind}): ${
        producer.partitionScope.predicate}`,
    ]),
    '',
  ];
}

function replaceLines(matrix) {
  const classification = matrix.replaceClassification;
  return [
    heading(2, 'The priority-recovery relocation REPLACE, classified ' +
      'independently'),
    '',
    field('question', classification.question),
    field('correction to round 1', classification.correctionToRound1),
    field('correction to round 2', classification.correctionToRound2),
    field('the condition, named truthfully',
      classification.conditionNamedTruthfully),
    field('is it a spread cure', classification.isItASpreadCure),
    field('hand-off over-replication',
      `**${classification.handoffOverReplication}** - ` +
        classification.handoffOverReplicationReason),
    field('chained over-replication',
      `**${classification.chainedReplacementOverReplication}** - ` +
        classification.chainedReplacementOverReplicationReason),
    field('authorization never legalizes inconsistency',
      classification.authorizationNeverLegalizesInconsistency),
    field('reliance on the budget',
      `**${classification.budgetReliance}** - ` +
        classification.budgetRelianceReason),
    field('the guard never infers legitimacy from topology',
      classification.guardInfersFromTopologyNote),
    field('owner of the relocation decision', classification.owners.relocation),
    field('owner of the paired relocation',
      classification.owners.pairedRelocation),
    field('cure typing owner', classification.owners.cureTyping),
    field('the three censuses', ''),
    ...classification.threeCensuses.map((census) =>
      `  ${BULLET}${census.name}: \`${census.expression}\` at ${census.site} ` +
      `- in the promotion window it reads ${census.countsInThePromotionWindow}`),
    field('scope of the census disagreement',
      classification.censusDisagreementScope),
    field('lab attribution',
      `**${classification.labAttribution.label}** (${
        classification.labAttribution.settleMechanism}) - ` +
        classification.labAttribution.text),
    field('paired relocation', classification.pairedRelocationNote),
    field('the remove-dispatch phase', classification.removeDispatchPhaseNote),
    field('the owner\'s own words', ''),
    ...classification.quotedOwnerWords.map((quote) => `  ${BULLET}${quote}`),
    '',
  ];
}

function grantRuleLines(matrix) {
  const target = matrix.grantRuleTarget;
  return [
    heading(2, 'The grant rule: the interim pin and what it inherits'),
    '',
    ...bullets([
      `interim pin: \`${target.interimPin}\` - ${target.interimPinScope}`,
      `interim rule, as the test names it: ${target.interimRule}`,
      `TARGET rule: \`${target.targetRule}\``,
      target.todaysHonouredIsNotComplete,
      `inherited requirement, verbatim: "${target.inheritedRequirement}"`,
      `inherited by: ${target.inheritedBy}`,
      `the one case that IS honoured and within bound: ${
        target.honouredCase}`,
      `carrier changed by this quest: ${target.carrierChangedByThisQuest}`,
      `pinned by: ${target.test}`,
    ]),
    '',
    'Cases that must NOT be honoured once the bound is inside the outcome:',
    '',
    ...bullets(target.notHonouredCases),
    '',
  ];
}

function membershipCeilingLines(matrix) {
  const ceiling = matrix.membershipCeiling;
  return [
    heading(2, 'The membership ceiling (no formula is chosen here)'),
    '',
    ...bullets([
      `status: **${ceiling.status}**`,
      ceiling.whatMustBeEstablished,
      ceiling.measuredCounterexample,
      ceiling.nameIsAHypothesisOnly,
      `measured by: ${ceiling.test}`,
    ]),
    '',
    'The later membership-ceiling work tests the identities as SETS over ' +
      'these cases:',
    '',
    ...bullets(ceiling.setIdentityCasesForTheLaterQuest),
    '',
  ];
}

function repairQuestLines(matrix) {
  return [
    heading(2, 'Proposed repair quests, grouped by semantic cause'),
    '',
    'Nothing here is started, and no ledger-authority quest is proposed: ' +
      'the ordinary +1 is covered by the replacement allowance and the ' +
      'extra overlap is the view-disagreement condition.',
    '',
    ...matrix.repairQuests.flatMap((quest) => [
      `${BULLET}**${quest.group}** (not started: ${quest.notStarted})`,
      `  - cause: ${quest.cause}`,
      `  - proposal: ${quest.proposal}`,
      `  - rows: ${matrix.rows.filter((row) => row.repairGroup === quest.group)
        .map((row) => row.id).join(', ') || 'none (finding-level)'}`,
    ]),
    '',
  ];
}

function architecturalResultLines(matrix) {
  return [
    heading(2, 'Architectural results (recorded, not encoded into the matrix)'),
    '',
    'Each of these is a proof that something asked for cannot be ' +
      'established from the state available. It is recorded here and NOT ' +
      'turned into a matrix distinction.',
    '',
    ...matrix.architecturalResults.flatMap((result) => [
      `${BULLET}**${result.id}** - ${result.result}`,
      `  - consequence: ${result.consequence}`,
      `  - evidence: ${result.evidence.join('; ')}`,
    ]),
    '',
  ];
}

function carriedForwardLines(matrix) {
  const findings = matrix.carriedForwardFindings;
  return [
    heading(2, 'The carried-forward details, settled as findings'),
    '',
    heading(3, 'The partition-row read\'s timing'),
    '',
    ...bullets([
      findings.partitionRowReadTiming.question,
      `read at mint: ${findings.partitionRowReadTiming.whenItIsRead}`,
      `read again: ${findings.partitionRowReadTiming.whenItIsReadAgain}`,
      `failure direction: **${findings.partitionRowReadTiming.failureDirection}**`,
      findings.partitionRowReadTiming.movingTheReadArgument,
      `**finding**: ${findings.partitionRowReadTiming.finding}`,
    ]),
    '',
    heading(3, 'Is the row type part of authority identity?'),
    '',
    ...bullets([
      findings.rowTypeIdentity.question,
      `checked today: ${findings.rowTypeIdentity.typeIsCheckedToday}`,
      findings.rowTypeIdentity.evidence,
      findings.rowTypeIdentity.whyItIsHarmlessToday,
      findings.rowTypeIdentity.reCreatedOperations,
      `**recommendation**: ${findings.rowTypeIdentity.recommendation} - ` +
        findings.rowTypeIdentity.recommendationReason,
    ]),
    '',
    heading(3, 'What the authorized count bounds'),
    '',
    ...bullets([
      findings.authorizedCount.expression,
      `why the voter term: ${findings.authorizedCount.whyActiveVoterCount}`,
      `why the status term: ${findings.authorizedCount.whyActiveCount}`,
      findings.authorizedCount.statesWhereTheyDiffer,
      `**bounded quantity**: ${findings.authorizedCount.boundedQuantity} - ` +
        findings.authorizedCount.boundedQuantityArgument,
      `membership identity: ${
        findings.authorizedCount.membershipIdentityDisagreement.statement}`,
      `the max undercounts the union by: ${
        findings.authorizedCount.membershipIdentityDisagreement
          .maxUndercountsTheUnionBy}`,
      `name (LABELLED HYPOTHESIS, not a proposal of record): \`${
        findings.authorizedCount.nameHypothesis}\``,
      findings.authorizedCount.notRenamed,
    ]),
    '',
  ];
}

function futureTransitionLines(matrix) {
  return [
    heading(2, 'The future transition and its falsifiers'),
    '',
    '| case | outcome | reason | the landed evaluation refuses it |',
    '| --- | --- | --- | --- |',
    ...matrix.futureTransition.map((entry) =>
      `| ${entry.id} | ${entry.outcome} | ${entry.reason} | ${
        entry.landedEvaluationRefuses} |`),
    '',
    ...matrix.futureTransition
      .filter((entry) => entry.note)
      .map((entry) => `${BULLET}**${entry.id}** - ${entry.note}`),
    '',
  ];
}

function findingLines(matrix, root) {
  return [
    heading(2, 'Findings'),
    '',
    ...matrix.findings.flatMap((finding) => [
      `${BULLET}**${finding.id}** (${finding.label}, ${
        findingDerivedOpen(matrix, finding.id, root) ? 'OPEN' : 'settled'}) - ${
        finding.text}`,
      `  - bears on gate item(s): ${finding.gateItems.join(', ') || 'none'}`,
      ...(finding.contradicts ?
        [`  - contradicts ${finding.contradicts}`] :
        []),
      ...(finding.resolution ?
        [`  - resolved only by ${renderedValue(finding.resolution.kind,
          'resolution kind')} at ${renderedValue(finding.resolution.path,
          'resolution path')}`] :
        []),
      ...(finding.justification ?
        [`  - justification: ${finding.justification}`] :
        []),
      ...(finding.doesNotImply ?
        [`  - does NOT imply: ${finding.doesNotImply}`] :
        []),
    ]),
    '',
  ];
}

// The one correction the superseded audit's CONTENT needed, and the single
// derived consequence it carries with it.
function correctionLines(matrix) {
  const correction = matrix.correctionToRound3;
  if (!correction) {
    return [];
  }
  return [
    heading(2, 'The correction to round 3'),
    '',
    ...bullets([
      correction.statement,
      `rows corrected: ${correction.rows.join(', ')}`,
      `from: ${correction.fromDisposition} to: ${correction.toDisposition}`,
      `what is unreachable: ${correction.unreachable}`,
      `what remains reachable: ${correction.remainsReachable.join(', ')}`,
      `gate item that follows: ${correction.gateItem}`,
      `its selection minimum: ${correction.selectionMinimumBefore} -> ${
        correction.selectionMinimumAfter}`,
      correction.addsNothingNew,
      `decision: ${correction.decision}`,
      correction.ledgerResult,
    ]),
    '',
    heading(3, 'Declared witness discrepancies'),
    '',
    'A discrepancy is a statement that a round-3 witness pointer did NOT ' +
      'measure what it was cited for. It is declared only where that is ' +
      'true; the pointer itself is pinned, not edited.',
    '',
    ...(correction.witnessDiscrepancies || []).flatMap((entry) => [
      `${BULLET}**${entry.row}**`,
      `  - pinned witness (${entry.pinnedWitnessDimension}): ${
        entry.pinnedWitness}`,
      `  - it drove: ${entry.pinnedWitnessDrivenPartition}`,
      `  - this row covers: ${entry.rowPartitionClass.join(', ')}`,
      `  - what does measure it: ${entry.measuredBy}`,
      `  - ${entry.because}`,
    ]),
    '',
    heading(3, 'Inherited weaknesses, recorded and NOT repaired'),
    '',
    ...(correction.inheritedWeaknesses || []).flatMap((entry) => [
      `${BULLET}**${entry.id}**`,
      ...(entry.rows ? [`  - rows: ${entry.rows.join(', ')}`] : []),
      `  - ${entry.observation}`,
      `  - measured by: ${entry.measuredBy}`,
      `  - ${entry.status}`,
    ]),
    '',
  ];
}

// The state slices, as structure: a prose-blind reader needs the predicate,
// not the sentence.
function sliceLines(slices) {
  return [
    heading(2, 'The state slices evidence is measured over'),
    '',
    ...slices.flatMap((slice) => [
      `${BULLET}**${slice.id}** - ${slice.statement}`,
      `  - voter census: ${slice.predicate.voterCensus}` +
        `; owned add-like operation: ${slice.predicate.ownedAddLikeOperation}` +
        `; operation type: ${slice.predicate.operationType}`,
      `  - created by: ${slice.createdBy === null ?
        'no producer requirement' : slice.createdBy}`,
    ]),
    '',
  ];
}

function renderDecisionMatrixMarkdown(matrix, root, slices) {
  return [
    ...matrixHeader(matrix),
    ...partitionSetLines(matrix),
    ...producerLines(matrix),
    heading(2, 'The rows'),
    '',
    ...matrix.rows.flatMap(rowSection),
    ...replaceLines(matrix),
    ...carriedForwardLines(matrix),
    ...membershipCeilingLines(matrix),
    ...futureTransitionLines(matrix),
    ...grantRuleLines(matrix),
    ...sliceLines(slices || []),
    ...correctionLines(matrix),
    ...findingLines(matrix, root),
    ...repairQuestLines(matrix),
    ...architecturalResultLines(matrix),
  ].join(NL) + NL;
}

function renderEpochInventoryMarkdown(inventory) {
  return [
    heading(1, 'Membership-publication-epoch domain inventory'),
    '',
    'Generated from `membership-epoch-domain-inventory.json` by ' +
      '`test/rebalancer/overflow-budget-audit-render.js`. Do not edit by ' +
      'hand.',
    '',
    field('quest', inventory.quest),
    field('measured at head', inventory.measuredAtHead),
    field('concept', inventory.concept),
    field('tokens', inventory.tokenCount),
    field('sites', inventory.siteCount),
    '',
    heading(2, 'Method'),
    '',
    ...bullets([inventory.method.pattern, inventory.method.granularity,
      inventory.method.classification]),
    '',
    heading(2, 'Limits'),
    '',
    ...bullets(inventory.limits),
    '',
    heading(2, 'The canonical meaning'),
    '',
    ...bullets([inventory.canonicalMeaning.statement,
      inventory.canonicalMeaning.consequence]),
    '',
    heading(2, 'The authoritative writer'),
    '',
    ...bullets([
      `allocator: ${inventory.authoritativeWriter.allocator}`,
      `durable write funnel: ${inventory.authoritativeWriter.durableWriteFunnel}`,
      `second durable writer: ${inventory.authoritativeWriter.secondDurableWriter}`,
      `the operation column: ${inventory.authoritativeWriter.operationColumnWriter}`,
    ]),
    '',
    heading(2, 'Do the readers observe the same object?'),
    '',
    `**${inventory.readersObserveTheSameObject.answer}**`,
    '',
    ...bullets(inventory.readersObserveTheSameObject.differences),
    '',
    heading(2, 'Can one reader legitimately lag another?'),
    '',
    ...bullets([
      `**${inventory.legitimateLag.answer}**`,
      `planner behind partition: ${inventory.legitimateLag.plannerBehindPartition}`,
      `partition ahead of planner: ${inventory.legitimateLag.partitionAheadOfPlanner}`,
      `temporal lag: ${inventory.legitimateLag.temporalLag}`,
    ]),
    '',
    heading(2, 'Reader divergence, measured on real owners'),
    '',
    '| row set | planner | partition | verdict |',
    '| --- | --- | --- | --- |',
    ...inventory.readerDivergence.map((entry) =>
      `| ${entry.name} | ${entry.plannerEpoch} | ${entry.partitionEpoch} | ${
        entry.verdict} |`),
    '',
    ...inventory.readerDivergence
      .filter((entry) => entry.note)
      .map((entry) => `${BULLET}**${entry.name}** - ${entry.note}`),
    '',
    heading(2, 'What makes an authorization stale'),
    '',
    ...bullets([
      `today: ${inventory.whatMakesAnAuthorizationStale.today}`,
      `in the evaluation: ${inventory.whatMakesAnAuthorizationStale.inTheEvaluation}`,
      inventory.whatMakesAnAuthorizationStale.whatItOughtToMean,
    ]),
    '',
    heading(2, 'Candidate canonical models (none chosen)'),
    '',
    ...inventory.candidateCanonicalModels.flatMap((model) => [
      `${BULLET}**${model.id}** - ${model.statement}`,
      `  - preserves "the guard reads no epoch tables": ${
        model.preservesGuardReadsNoEpochTables}`,
      `  - preserves "the evaluation has one reader": ${
        model.preservesSingleReader}`,
      `  - ${model.note}`,
    ]),
    '',
    heading(2, 'The alias that escaped the existing inventory'),
    '',
    ...bullets([
      `alias: \`${inventory.aliasEscapedTheExistingInventory.alias}\``,
      inventory.aliasEscapedTheExistingInventory.existingPattern,
      `src files: ${
        inventory.aliasEscapedTheExistingInventory.srcFilesCarryingIt.join(', ')}`,
      `predating the carry stage: ${
        inventory.aliasEscapedTheExistingInventory.predatingTheCarryStage
          .join(', ')}`,
      `**finding**: ${inventory.aliasEscapedTheExistingInventory.finding}`,
    ]),
    '',
    heading(2, 'The domain is NOT closed'),
    '',
    ...bullets([inventory.domainIsNotClosed.statement,
      ...inventory.domainIsNotClosed.groups.map((group) =>
        `\`${group.id}\` (${
          inventory.domainIsNotClosed.counts[group.id] || 0}): ${
          group.meaning}`),
      `what would close it: ${inventory.domainIsNotClosed.whatWouldCloseIt}`]),
    '',
    heading(2, 'The tokens'),
    '',
    '| token | group | role | sites | basis | denotes |',
    '| --- | --- | --- | --- | --- | --- |',
    ...inventory.tokens.map((entry) =>
      `| \`${entry.token}\` | ${entry.group} | ${entry.role} | ${
        entry.siteCount} | ${entry.classificationBasis} | ${entry.denotes} |`),
    '',
    'The per-site file:line census lives in the JSON; it is too long to ' +
      'render and the census test is its consumer.',
    '',
  ].join(NL) + NL;
}

function gateItemLines(entry, root) {
  return [
    heading(3, `${entry.item}. ${entry.text}`),
    '',
    field('status', `**${entry.status}**`),
    ...(entry.ownerDecisions || []).map((decision) =>
      `  ${BULLET}blocking owner decision: ${decision}`),
    ...(entry.notedOwnerDecisions || []).map((decision) =>
      `  ${BULLET}noted owner decision: ${decision}`),
    ...(entry.openFindings || []).map((finding) =>
      `  ${BULLET}open finding: ${finding}`),
    ...(gateContractFor(entry.item) &&
      (entry.openFindings || []).length > 0 &&
      !gateContractFor(entry.item).requires.includes('namedFindingsResolved') ?
      [`  ${BULLET}RECORDED WEAKNESS: this item lists blocking findings but ` +
        'does not require them resolved, so they do not gate its status ' +
        '(correctionToRound3.inheritedWeaknesses: ' +
        'blocking-findings-are-listed-but-not-required)'] :
      []),
    ...(entry.requiredExternalArtifacts || []).map((artifact) =>
      `  ${BULLET}required external artifact (${artifact.kind} at ${
        artifact.path}; observed satisfied: ${
        observeExternalArtifact(artifact, root).satisfied}): ` +
      `${artifact.id} - ${artifact.statement}`),
    field('row selection', renderRowSelection(entry.item)),
    field('matrix rows',
      entry.rows.length > 0 ? entry.rows.join(', ') : 'none (owner-level)'),
    field('requirements', entry.requires.join(', ') || 'none'),
    field('what is missing',
      entry.whatIsMissing.join(', ') || 'nothing: every requirement is met'),
    field('tests', entry.tests.join(', ')),
    field('note', entry.note),
    '',
  ];
}

function renderEnforcementGateMarkdown(matrix, root) {
  return [
    heading(1, 'Enforcement entry gate'),
    '',
    'Generated from `overflow-budget-decision-matrix.json` by ' +
      '`test/rebalancer/overflow-budget-audit-render.js`. Do not edit by ' +
      'hand.',
    '',
    'The owner\'s nine items, each with a status and the matrix rows and ' +
      'tests that support it. The enforce quest is authored from this ' +
      'document, not from the existing guard.',
    '',
    field('measured at head', matrix.measuredAtHead),
    field('demonstrated',
      matrix.gate.filter((entry) => entry.status === 'demonstrated').length),
    field('not yet',
      matrix.gate.filter((entry) => entry.status === 'not-yet').length),
    field('blocked on an owner decision',
      matrix.gate.filter((entry) =>
        entry.status === 'blocked-on-owner-decision').length),
    '',
    heading(2, 'The items'),
    '',
    ...matrix.gate.flatMap((entry) => gateItemLines(entry, root)),
  ].join(NL) + NL;
}

export {
  deriveGateStatus,
  renderRowSelection,
  findingDerivedOpen,
  findingIsGateBlocking,
  gateContractFor,
  openGateFindings,
  renderDecisionMatrixMarkdown,
  renderEnforcementGateMarkdown,
  renderEpochInventoryMarkdown,
  selectGateRows,
  unmetGateRequirements,
};
