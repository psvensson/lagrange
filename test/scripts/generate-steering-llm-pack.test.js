import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  applyRuleAliases,
  applySourceRoles,
  buildManifest,
  buildSourceManifest,
  classifyAphoristicText,
  countMarkdownRules,
  dedupeCandidates,
  formatRuleCitation,
  isAphoristicText,
  locateRuleBySourceRef,
  parseMarkdownCandidates,
  renderPackMarkdown,
  renderReadme,
  selectOutputRules,
  validateCompleteOutputConfig,
  validateCompleteOutputCoverage,
  validateCompleteRules,
  validateRulesHaveTriggerAndCitation,
  validateSourceRoles,
} from '../../scripts/generate-steering-llm-pack.js';

const TEST_SOURCE_FILE = 'system guidelines.md';
const SYSTEM_GUIDELINES_URL =
  new URL('../../docs/steering/system-guidelines.md', import.meta.url);
const RUNTIME_CONTRACTS_URL =
  new URL('../../docs/steering/runtime-contracts.md', import.meta.url);
const PROOF_LADDERS_URL =
  new URL('../../docs/steering/testing-guidelines/proof-ladders.md', import.meta.url);
const STATE_ENCODING_URL =
  new URL('../../docs/steering/doctrine/state-encoding.md', import.meta.url);
const DECISION_EXPERIMENTS_URL =
  new URL('../../docs/steering/doctrine/decision-experiments.md', import.meta.url);
const ROADMAP_URL =
  new URL('../../docs/steering/roadmap.md', import.meta.url);
const TEST_DOMAIN = 'architecture';
const TEST_PRIORITY = 140;
const TEST_PARENT_RULE_TEXT =
  'When multiple signals determine one outcome, the code must:';
const TEST_FIRST_CHILD_RULE_TEXT = 'collect evidence';
const TEST_SECOND_CHILD_RULE_TEXT = 'normalize one snapshot';
const TEST_THIRD_CHILD_RULE_TEXT = 'emit one canonical outcome and reasons';
const TEST_UNRELATED_RULE_TEXT = 'Do not create a second owner.';
const TEST_CONTEXT_ANTECEDENT_TEXT =
  'docs/ is reserved for end-user or operator-facing documentation.';
const TEST_CONTEXT_DEPENDENT_RULE_TEXT =
  'Internal planning, work-package execution, and sprint tracking must not live there.';
const TEST_ORDERED_PARENT_RULE_TEXT =
  'Semantic decision boundaries must not be implemented as bags of if statements. ' +
  TEST_PARENT_RULE_TEXT;
const TEST_MARKDOWN_WITH_CHILD_RULES = [
  '# Rules',
  '',
  TEST_PARENT_RULE_TEXT,
  '- ' + TEST_FIRST_CHILD_RULE_TEXT,
  '- ' + TEST_SECOND_CHILD_RULE_TEXT,
  '- ' + TEST_THIRD_CHILD_RULE_TEXT,
  '',
  TEST_UNRELATED_RULE_TEXT,
  '',
].join('\n');
const TEST_ORDERED_MARKDOWN_WITH_CHILD_RULES = [
  '# Rules',
  '',
  '1. ' + TEST_ORDERED_PARENT_RULE_TEXT,
  '   - ' + TEST_FIRST_CHILD_RULE_TEXT,
  '   - ' + TEST_SECOND_CHILD_RULE_TEXT,
  '2. Small local guards are allowed.',
  '',
].join('\n');
const TEST_INCOMPLETE_MARKDOWN = [
  '# Rules',
  '',
  'Required workflow:',
  '',
].join('\n');
const TEST_CONTEXT_DEPENDENT_MARKDOWN = [
  '# Rules',
  '',
  TEST_CONTEXT_ANTECEDENT_TEXT + ' ' + TEST_CONTEXT_DEPENDENT_RULE_TEXT,
  '',
].join('\n');
const TEST_CODE_EXAMPLE_TEXT = 'const timeoutPromise = new Promise(() => {});';
const TEST_CODE_FENCE_MARKDOWN = [
  '# Rules',
  '',
  'Do not create a second owner.',
  '',
  '**Common violations:**',
  '```javascript',
  '// MUST NOT become a generated rule',
  TEST_CODE_EXAMPLE_TEXT,
  '```',
  '',
].join('\n');
const TEST_FORBIDDEN_PREAMBLE = 'It is FORBIDDEN to:';
const TEST_FORBIDDEN_BULLET_TEXT =
  'Introduce optional parameters that only bypass real logic for tests.';
const TEST_FORBIDDEN_PREAMBLE_MARKDOWN = [
  '# Rules',
  '',
  TEST_FORBIDDEN_PREAMBLE,
  '',
  '- ' + TEST_FORBIDDEN_BULLET_TEXT,
  '',
].join('\n');
const TEST_REQUIRED_FIRST_BULLET =
  'Initial creation writes the full canonical row shape.';
const TEST_REQUIRED_SECOND_BULLET =
  'Later lifecycle changes use partial updates only.';
const TEST_REQUIRED_PREAMBLE_MARKDOWN = [
  '## System-Table Row Lifecycle',
  '',
  'Required patterns:',
  '',
  '1. ' + TEST_REQUIRED_FIRST_BULLET,
  '2. ' + TEST_REQUIRED_SECOND_BULLET,
  '',
].join('\n');
const TEST_WRAPPED_REQUIRED_PREAMBLE_MARKDOWN = [
  '## Resource Lifetime',
  '',
  'Every queue, buffer, subscriber set, retry registry, deferred-work map, or',
  'single-flight registry must have:',
  '',
  '- one owner',
  '- one capacity or bounding rule',
  '',
].join('\n');
const TEST_NON_NORMATIVE_QUESTION_PREAMBLE_MARKDOWN = [
  '## Design Questions',
  '',
  'Use these questions to decide whether a change is',
  'required:',
  '',
  '- Which owner exists?',
  '- What evidence is missing?',
  '',
].join('\n');
const TEST_REQUIRED_PREAMBLE_WITH_EXPLICIT_MODALITY_MARKDOWN = [
  '## Shared Contract',
  '',
  'Required contract:',
  '',
  '- Consumers may not maintain a parallel cache.',
  '- null and undefined MUST NOT encode runtime state.',
  '- Initial creation writes the full canonical row shape.',
  '',
].join('\n');
const TEST_FORBIDDEN_PREAMBLE_WITH_POSITIVE_WORDS_MARKDOWN = [
  '## Handoff',
  '',
  'Forbidden patterns:',
  '',
  '- selecting from a stream without the required durable handoff edge',
  '- a consumer may select from unpublished state',
  '',
].join('\n');
const TEST_ABBREVIATION_MARKDOWN =
  'A frontier metric may be sharpened (e.g. priority to distance) only when ' +
  'the probe remains byte-identical. All other goalpost changes are forbidden.';
const TEST_INLINE_CODE_MARKDOWN = [
  '- **In-repo steering** (`docs/steering/**`) is CI-gated **ground truth**.',
  '  Anything binding future work should apply to *everyone*.',
  '',
].join('\n');
const TEST_FRAGMENT_MARKDOWN = [
  '# Rules',
  '',
  '- one declared list of forbidden reinterpretations',
  '',
].join('\n');
const TEST_OUTPUT_NAME = 'core';
const TEST_OUTPUT = Object.freeze({
  name: TEST_OUTPUT_NAME,
  title: 'Core',
  description: 'Core rules.',
});
const TEST_MANUAL_OUTPUT = Object.freeze({
  name: TEST_OUTPUT_NAME,
  title: 'Core',
  description: 'Core rules.',
  manual: true,
});
const TEST_MANUAL_CORE_MARKDOWN = [
  '# Core',
  '',
  '## Rules',
  '',
  '1. First rule.',
  '2. Second rule.',
  '',
].join('\n');
const TEST_INCOMPLETE_RULE = Object.freeze({
  id: 'ARCH-0001',
  text: 'Required workflow:',
});
const TEST_COMPLETE_RULE = Object.freeze({
  id: 'ARCH-0002',
  text: 'Do not create a second owner.',
  domain: TEST_DOMAIN,
  sources: [{file: TEST_SOURCE_FILE, line: 1}],
});

function parseTestCandidates(markdown) {
  return parseMarkdownCandidates(markdown, {
    file: TEST_SOURCE_FILE,
    domain: TEST_DOMAIN,
    priority: TEST_PRIORITY,
  });
}

test('steering pack parser attaches indented child bullets to ordered rules',
  (t) => {
    const candidates = parseTestCandidates(TEST_ORDERED_MARKDOWN_WITH_CHILD_RULES);
    const parentRule = candidates.find((candidate) =>
      candidate.text.startsWith(
        'Semantic decision boundaries must not be implemented',
      ),
    );

    t.ok(parentRule, 'ordered parent rule should be emitted');
    t.match(parentRule.text, TEST_FIRST_CHILD_RULE_TEXT);
    t.match(parentRule.text, TEST_SECOND_CHILD_RULE_TEXT);
    t.notMatch(parentRule.text, 'Small local guards');
    t.end();
  });

test('steering pack parser attaches child bullets to colon-ended parent rule',
  (t) => {
    const candidates = parseTestCandidates(TEST_MARKDOWN_WITH_CHILD_RULES);
    const parentRule = candidates.find((candidate) =>
      candidate.text.startsWith(TEST_PARENT_RULE_TEXT),
    );

    t.ok(parentRule, 'parent rule should be emitted');
    t.match(parentRule.text, TEST_FIRST_CHILD_RULE_TEXT);
    t.match(parentRule.text, TEST_SECOND_CHILD_RULE_TEXT);
    t.match(parentRule.text, TEST_THIRD_CHILD_RULE_TEXT);
    t.equal(
      parentRule.text.endsWith(TEST_PARENT_RULE_TEXT),
      false,
      'parent rule should not remain as a truncated colon-only rule',
    );
    t.equal(
      candidates.some((candidate) =>
        candidate.text === TEST_UNRELATED_RULE_TEXT),
      true,
      'unrelated normative paragraph should still be emitted',
    );
    t.end();
  });

test('steering pack parser rejects colon-ended rules without child bullets',
  (t) => {
    const candidates = parseTestCandidates(TEST_INCOMPLETE_MARKDOWN);

    t.same(candidates, []);
    t.end();
  });

test('steering pack parser preserves antecedent for context-dependent rules',
  (t) => {
    const candidates = parseTestCandidates(TEST_CONTEXT_DEPENDENT_MARKDOWN);
    const contextualRule = candidates.find((candidate) =>
      candidate.text.includes(TEST_CONTEXT_DEPENDENT_RULE_TEXT),
    );

    t.ok(contextualRule, 'context-dependent rule should be emitted');
    t.equal(
      contextualRule.text,
      TEST_CONTEXT_ANTECEDENT_TEXT + ' ' + TEST_CONTEXT_DEPENDENT_RULE_TEXT,
      'rule should keep the sentence that defines "there"',
    );
    t.end();
  });

test('steering pack parser ignores fenced code examples', (t) => {
  const candidates = parseTestCandidates(TEST_CODE_FENCE_MARKDOWN);

  t.equal(
    candidates.some((candidate) => candidate.text.includes(TEST_CODE_EXAMPLE_TEXT)),
    false,
    'code inside fenced examples should not become rules',
  );
  t.equal(
    candidates.some((candidate) => candidate.text === TEST_UNRELATED_RULE_TEXT),
    true,
    'normative prose outside the fence should still be emitted',
  );
  t.end();
});

test('steering pack parser preserves forbidden list preambles across blanks',
  (t) => {
    const candidates = parseTestCandidates(TEST_FORBIDDEN_PREAMBLE_MARKDOWN);
    const forbiddenRule = candidates.find((candidate) =>
      candidate.text.includes(TEST_FORBIDDEN_BULLET_TEXT),
    );

    t.ok(forbiddenRule, 'forbidden child bullet should be emitted');
    t.match(forbiddenRule.text, /^It is FORBIDDEN to:/u);
    t.match(forbiddenRule.text, TEST_FORBIDDEN_BULLET_TEXT);
    t.end();
  });

test('steering pack parser emits required list items with section context',
  (t) => {
    const candidates = parseTestCandidates(TEST_REQUIRED_PREAMBLE_MARKDOWN);

    t.equal(candidates.length, 2);
    t.same(candidates.map((candidate) => candidate.line), [5, 6]);
    for (const candidate of candidates) {
      t.match(
        candidate.text,
        /^System-Table Row Lifecycle — Required patterns:/u,
      );
      t.equal(candidate.strength, 'must');
    }
    t.match(candidates[0].text, TEST_REQUIRED_FIRST_BULLET);
    t.match(candidates[1].text, TEST_REQUIRED_SECOND_BULLET);
    t.end();
  });

test('steering pack parser emits items beneath wrapped normative preambles',
  (t) => {
    const candidates = parseTestCandidates(
      TEST_WRAPPED_REQUIRED_PREAMBLE_MARKDOWN,
    );

    t.equal(candidates.length, 2);
    t.same(candidates.map((candidate) => candidate.line), [6, 7]);
    for (const candidate of candidates) {
      t.match(
        candidate.text,
        /^Resource Lifetime — Every queue, buffer, subscriber set, retry registry, deferred-work map, or single-flight registry must have:/u,
      );
      t.equal(candidate.strength, 'must');
    }
    t.match(candidates[0].text, /one owner/u);
    t.match(candidates[1].text, /one capacity or bounding rule/u);
    const deduped = dedupeCandidates(candidates);
    t.equal(
      deduped.length,
      2,
      'fuzzy dedupe must not collapse siblings that share a long preamble',
    );
    t.ok(deduped.some((candidate) => candidate.text.includes('one owner')));
    t.ok(deduped.some((candidate) =>
      candidate.text.includes('one capacity or bounding rule')));
    t.end();
  });

test('steering pack parser does not promote non-normative question lists',
  (t) => {
    const candidates = parseTestCandidates(
      TEST_NON_NORMATIVE_QUESTION_PREAMBLE_MARKDOWN,
    );

    t.same(candidates, []);
    t.end();
  });

test('explicit child modality overrides an inherited positive preamble',
  (t) => {
    const candidates = parseTestCandidates(
      TEST_REQUIRED_PREAMBLE_WITH_EXPLICIT_MODALITY_MARKDOWN,
    );

    t.same(
      candidates.map((candidate) => candidate.strength),
      ['must_not', 'must_not', 'must'],
    );
    t.match(candidates[0].text, /Consumers may not maintain/u);
    t.match(candidates[1].text, /MUST NOT encode runtime state/u);
    t.end();
  });

test('categorical forbidden preambles dominate positive child wording',
  (t) => {
    const candidates = parseTestCandidates(
      TEST_FORBIDDEN_PREAMBLE_WITH_POSITIVE_WORDS_MARKDOWN,
    );

    t.same(
      candidates.map((candidate) => candidate.strength),
      ['must_not', 'must_not'],
    );
    t.end();
  });

test('steering pack parser does not split normative sentences at abbreviations',
  (t) => {
    const candidates = parseTestCandidates(TEST_ABBREVIATION_MARKDOWN);

    t.equal(candidates.length, 2);
    t.match(candidates[0].text, /\(e\.g\. priority to distance\)/u);
    t.match(candidates[0].text, /probe remains byte-identical\.$/u);
    t.end();
  });

test('steering pack parser isolates inline-code globs from emphasis markers',
  (t) => {
    const candidates = parseTestCandidates(TEST_INLINE_CODE_MARKDOWN);

    t.equal(candidates.length, 1);
    t.match(candidates[0].text, /docs\/steering\/\*\*/u);
    t.match(candidates[0].text, /CI-gated ground truth/u);
    t.match(candidates[0].text, /apply to everyone/u);
    t.notMatch(candidates[0].text, /truth\*|everyone\*/u);
    t.end();
  });

test('steering pack parser classifies restrictive may rules as binding',
  (t) => {
    const candidates = parseTestCandidates([
      'Consumers may not maintain a parallel cache.',
      '',
      'For one owner key, at most one reconcile execution may be in flight.',
      '',
    ].join('\n'));

    t.equal(candidates[0].strength, 'must_not');
    t.equal(candidates[1].strength, 'must');
    t.end();
  });

test('packed sources emit representative required-list obligations',
  (t) => {
    const systemCandidates = parseMarkdownCandidates(
      fs.readFileSync(SYSTEM_GUIDELINES_URL, 'utf8'),
      {
        file: 'system-guidelines.md',
        domain: 'architecture',
        priority: TEST_PRIORITY,
      },
    );
    const runtimeCandidates = parseMarkdownCandidates(
      fs.readFileSync(RUNTIME_CONTRACTS_URL, 'utf8'),
      {
        file: 'runtime-contracts.md',
        domain: 'architecture',
        priority: TEST_PRIORITY,
      },
    );
    const proofCandidates = parseMarkdownCandidates(
      fs.readFileSync(PROOF_LADDERS_URL, 'utf8'),
      {
        file: 'testing-guidelines/proof-ladders.md',
        domain: 'testing',
        priority: TEST_PRIORITY,
      },
    );
    const stateEncodingCandidates = dedupeCandidates(
      parseMarkdownCandidates(
        fs.readFileSync(STATE_ENCODING_URL, 'utf8'),
        {
          file: 'doctrine/state-encoding.md',
          domain: 'architecture',
          priority: TEST_PRIORITY,
        },
      ),
    );
    const decisionExperimentCandidates = dedupeCandidates(
      parseMarkdownCandidates(
        fs.readFileSync(DECISION_EXPERIMENTS_URL, 'utf8'),
        {
          file: 'doctrine/decision-experiments.md',
          domain: 'architecture',
          priority: TEST_PRIORITY,
        },
      ),
    );
    const roadmapCandidates = dedupeCandidates(
      parseMarkdownCandidates(
        fs.readFileSync(ROADMAP_URL, 'utf8'),
        {
          file: 'roadmap.md',
          domain: 'governance',
          priority: TEST_PRIORITY,
        },
      ),
    );

    for (const expected of [
      'Initial creation writes the full canonical row shape.',
      'Semantic owners submit shared-metadata writes through one canonical runtime',
      'Use operation IDs, idempotency keys, or equivalent unique identity.',
    ]) {
      t.ok(
        runtimeCandidates.some((candidate) =>
          candidate.text.includes(expected)),
        `runtime contract emits: ${expected}`,
      );
    }
    t.equal(
      systemCandidates.find((candidate) =>
        candidate.text.includes(
          'Consumers may not maintain parallel system-data caches',
        ))?.strength,
      'must_not',
      'required-list preamble does not weaken an explicit may-not child',
    );
    t.equal(
      runtimeCandidates.find((candidate) =>
        candidate.text.includes(
          'published the required durable handoff edge',
        ))?.strength,
      'must_not',
      'forbidden-list preamble dominates adjectival required wording',
    );
    t.equal(
      systemCandidates.find((candidate) =>
        candidate.text.includes(
          'nested work derives from remaining budget and never starts',
        ))?.strength,
      'must_not',
      'wrapped child continuation contributes its explicit modality',
    );
    t.ok(
      proofCandidates.some((candidate) =>
        candidate.text.includes(
          'Before editing production code, capture the relevant static guardrail',
        )),
      'proof ladder emits the pre-edit static baseline obligation',
    );
    t.equal(
      proofCandidates.find((candidate) =>
        candidate.text.includes('A Quest must not report SOLVED'))?.strength,
      'must_not',
      'required-list preamble does not weaken an explicit must-not child',
    );
    t.equal(
      proofCandidates.find((candidate) =>
        candidate.text.includes(
          'Green behavior tests do not override a failed owner-path guard',
        ))?.strength,
      'must_not',
      'later child sentences contribute their explicit modality',
    );
    for (const expected of [
      'outcome or completion state',
      'one owner',
      'one diagnostic surface',
    ]) {
      const matchingCandidate = stateEncodingCandidates.find((candidate) =>
        candidate.text.includes(expected));
      t.ok(
        matchingCandidate,
        `state encoding emits wrapped obligation: ${expected}`,
      );
      t.equal(
        matchingCandidate?.strength,
        'must',
        `section-title wording does not change modality: ${expected}`,
      );
    }
    for (const expected of [
      'the full phase chain from the scenario/probe',
      'the bounded-progress mechanism for retryable or backpressure states',
      'whether the result is a runtime fix',
    ]) {
      t.ok(
        decisionExperimentCandidates.some((candidate) =>
          candidate.text.includes(expected)),
        `decision experiments emit wrapped obligation: ${expected}`,
      );
    }
    for (const expected of [
      'The implementation home remains AGPL repo',
      'The work does not implement paid-only behavior',
      'The work remains consistent with the scope and sequence',
    ]) {
      t.ok(
        roadmapCandidates.some((candidate) =>
          candidate.text.includes(expected)),
        `roadmap emits wrapped obligation: ${expected}`,
      );
    }
    t.end();
  });

test('steering pack parser rejects non-normative fragments', (t) => {
  const candidates = parseTestCandidates(TEST_FRAGMENT_MARKDOWN);

  t.same(candidates, []);
  t.end();
});

test('steering pack renderer rejects incomplete generated rule text', (t) => {
  t.throws(
    () => validateCompleteRules([TEST_INCOMPLETE_RULE], TEST_OUTPUT_NAME),
    /Incomplete generated steering rule/u,
    'validation should fail before incomplete rules enter generated packs',
  );
  t.throws(
    () => renderPackMarkdown(TEST_OUTPUT, [TEST_INCOMPLETE_RULE]),
    /Incomplete generated steering rule/u,
    'rendering should enforce the same quality gate',
  );
  t.doesNotThrow(
    () => renderPackMarkdown(TEST_OUTPUT, [TEST_COMPLETE_RULE]),
    'complete rules should still render',
  );
  t.end();
});

test('steering pack manifest supports manual core packs', (t) => {
  const manualContentByOutput = new Map([
    [TEST_OUTPUT_NAME, TEST_MANUAL_CORE_MARKDOWN],
  ]);
  const manifest = buildManifest(
    [TEST_MANUAL_OUTPUT],
    new Map(),
    manualContentByOutput,
  );

  t.equal(countMarkdownRules(TEST_MANUAL_CORE_MARKDOWN), 2);
  t.equal(manifest[0].mode, 'manual');
  t.equal(manifest[0].ruleCount, 2);
  t.ok(manifest[0].estimatedTokens > 0);
  t.end();
});

test('applyRuleAliases marks aliases with canonical_of and master with aliases list', (t) => {
  const allRules = [
    {
      id: 'ARCH-0001',
      domain: 'architecture',
      text: 'master rule text',
      sources: [{file: 'system-guidelines.md', line: 100, section: 'A'}],
    },
    {
      id: 'STYLE-0001',
      domain: 'style',
      text: 'paraphrased master rule',
      sources: [{file: 'code-style.md', line: 50, section: 'B'}],
    },
    {
      id: 'TEST-0001',
      domain: 'testing',
      text: 'unrelated rule',
      sources: [{file: 'testing-guidelines/fixtures.md', line: 33, section: 'C'}],
    },
  ];
  const stats = applyRuleAliases(allRules, [
    {
      canonical: {file: 'system-guidelines.md', line: 100, match: 'master rule text'},
      aliases: [{file: 'code-style.md', line: 50, match: 'paraphrased master rule'}],
    },
  ]);

  t.equal(stats.pairs, 1);
  t.equal(stats.missing.length, 0);
  t.equal(allRules[1].canonical_of, 'ARCH-0001');
  t.same(allRules[0].aliases, ['STYLE-0001']);
  t.notOk(allRules[2].canonical_of, 'unrelated rule is not aliased');
  t.end();
});

test('applyRuleAliases records missing references without crashing', (t) => {
  const allRules = [
    {
      id: 'ARCH-0001',
      domain: 'architecture',
      text: 'master',
      sources: [{file: 'system-guidelines.md', line: 100}],
    },
  ];
  const stats = applyRuleAliases(allRules, [
    {
      canonical: {file: 'system-guidelines.md', line: 100, match: 'master'},
      aliases: [{file: 'missing.md', line: 1, match: 'missing rule'}],
    },
    {
      canonical: {file: 'nope.md', line: 1, match: 'absent rule'},
      aliases: [{file: 'system-guidelines.md', line: 100, match: 'master'}],
    },
  ]);

  t.equal(stats.pairs, 0);
  t.equal(stats.missing.length, 2);
  t.equal(stats.missing[0].role, 'alias');
  t.equal(stats.missing[1].role, 'canonical');
  t.end();
});

test('selectOutputRules suppresses canonical_of alias rules from per-domain packs', (t) => {
  const allRules = [
    {id: 'STYLE-0001', domain: 'style', text: 'master', tags: []},
    {
      id: 'STYLE-0002',
      domain: 'style',
      text: 'alias',
      canonical_of: 'STYLE-0001',
      tags: [],
    },
    {id: 'STYLE-0003', domain: 'style', text: 'other', tags: []},
  ];
  const selected = selectOutputRules(allRules, {
    name: 'style',
    domains: ['style'],
    maxRules: 10,
  });

  t.equal(selected.length, 2);
  t.equal(selected.map((rule) => rule.id).join(','), 'STYLE-0001,STYLE-0003');
  t.end();
});

test('complete domain selection never hides master rules behind a cap', (t) => {
  const allRules = [
    {id: 'STYLE-0001', domain: 'style'},
    {id: 'STYLE-0002', domain: 'style'},
    {id: 'STYLE-0003', domain: 'style'},
  ];
  const selected = selectOutputRules(allRules, {
    name: 'style', domains: ['style'], maxRules: 1,
  });

  t.same(selected.map((rule) => rule.id), [
    'STYLE-0001', 'STYLE-0002', 'STYLE-0003',
  ]);
  t.end();
});

test('source roles are explicit and non-pack roles explain their routing', (t) => {
  const valid = [
    {file: 'a.md', role: 'packed', domain: 'style', priority: 1},
    {
      file: 'b.md', role: 'direct-load', domain: 'testing',
      loadWhen: 'before distributed work',
    },
    {
      file: 'c.md', role: 'reference-only', domain: 'governance',
      reason: 'navigation only',
    },
  ];
  t.doesNotThrow(() => validateSourceRoles(valid));
  t.throws(
    () => validateSourceRoles([{file: 'a.md', domain: 'style', priority: 1}]),
    /must declare role/u,
  );
  t.throws(
    () => validateSourceRoles([
      {file: 'b.md', role: 'direct-load', domain: 'testing'},
    ]),
    /must declare loadWhen/u,
  );
  t.end();
});

test('limiting keys are rejected for complete domain outputs', (t) => {
  t.doesNotThrow(() => validateCompleteOutputConfig([
    {name: 'style', domains: ['style']},
  ]));
  t.throws(
    () => validateCompleteOutputConfig([
      {name: 'style', domains: ['style'], maxRules: 1},
    ]),
    /must be complete.*maxRules/u,
  );
  t.end();
});

test('coverage requires every master exactly once and accepts indexed aliases',
  (t) => {
    const master = {
      id: 'STYLE-0001', domain: 'style',
      sources: [{file: 'a.md', line: 1}],
    };
    const alias = {
      id: 'ARCH-0001', domain: 'architecture', canonical_of: 'STYLE-0001',
      sources: [{file: 'd.md', line: 1}],
    };
    const outputs = [{name: 'style', domains: ['style']}];
    const selected = new Map([['style', [master]]]);

    t.doesNotThrow(() => validateCompleteOutputCoverage(
      [master, alias], outputs, selected,
    ));
    t.throws(
      () => validateCompleteOutputCoverage([master], outputs, new Map()),
      /incomplete/u,
    );
    t.end();
  });

test('source manifest fails unexplained zero contribution and records provenance',
  (t) => {
    const sources = [
      {file: 'a.md', role: 'packed', domain: 'style', priority: 1},
      {
        file: 'b.md', role: 'direct-load', domain: 'testing',
        loadWhen: 'before distributed work',
      },
    ];
    const rule = {
      id: 'STYLE-0001', domain: 'style',
      sources: [{file: 'a.md', line: 1}],
    };
    applySourceRoles([rule], sources);
    const sourceManifest = buildSourceManifest(
      sources, [rule], new Map([['style', [rule]]]),
    );

    t.equal(rule.sources[0].role, 'packed');
    t.equal(sourceManifest[0].emittedMasterRuleCount, 1);
    t.equal(sourceManifest[1].role, 'direct-load');
    t.throws(
      () => buildSourceManifest(
        [{file: 'missing.md', role: 'packed', domain: 'style', priority: 1}],
        [],
        new Map(),
      ),
      /unexplained zero contribution/u,
    );
    t.end();
  });

test('manifest and README describe complete selectively loaded packs', (t) => {
  const rule = {id: 'STYLE-0001', domain: 'style', text: 'Do not fork names.'};
  const alias = {
    id: 'ARCH-0001', domain: 'style', text: 'Do not fork naming.',
    canonical_of: 'STYLE-0001',
  };
  const sources = [{
    file: 'a.md', role: 'packed', domain: 'style', masterRuleCount: 1,
    aliasRuleCount: 1,
  }];
  const manifest = buildManifest(
    [{name: 'style', title: 'Style', domains: ['style']}],
    new Map([['style', [rule]]]),
    new Map(),
    {allRules: [rule, alias], sourceManifest: sources},
  );
  const readme = renderReadme(manifest, sources);

  t.equal(manifest[0].completeness, 'complete');
  t.equal(manifest[0].masterRuleCount, 1);
  t.equal(manifest[0].aliasRuleCount, 1);
  t.match(readme, /selectively loaded domain packs/u);
  t.notMatch(readme, /always-loaded priority subset/u);
  t.end();
});

test('locateRuleBySourceRef finds rule by file+line', (t) => {
  const rules = [
    {id: 'A', sources: [{file: 'x.md', line: 1}, {file: 'y.md', line: 2}]},
    {id: 'B', sources: [{file: 'z.md', line: 9}]},
  ];
  t.equal(locateRuleBySourceRef(rules, {file: 'y.md', line: 2}).id, 'A');
  t.equal(locateRuleBySourceRef(rules, {file: 'z.md', line: 9}).id, 'B');
  t.equal(locateRuleBySourceRef(rules, {file: 'missing.md', line: 1}), null);
  t.end();
});

test('classifyAphoristicText flags admonition-marker prefixes', (t) => {
  t.equal(classifyAphoristicText('STOP - Do not accept the test as passing'), 'admonition_marker');
  t.equal(classifyAphoristicText('DO NOT IGNORE - Failing tests indicate broken functionality'), 'admonition_marker');
  t.equal(classifyAphoristicText('DO NOT DEFER - Resolve the failure before closing'), 'admonition_marker');
  t.equal(classifyAphoristicText('WARNING: this path is deprecated'), 'admonition_marker');
  t.end();
});

test('classifyAphoristicText flags dangling-pronoun openings followed by action verbs', (t) => {
  t.equal(classifyAphoristicText('They do not replace the implementation role.'), 'dangling_pronoun');
  t.equal(classifyAphoristicText('It must run before closure.'), 'dangling_pronoun');
  t.equal(classifyAphoristicText('These apply to all owners.'), 'dangling_pronoun');
  t.equal(classifyAphoristicText('Their authored inputs remain counted.'), 'dangling_pronoun');
  t.end();
});

test('classifyAphoristicText accepts self-contained normative rules', (t) => {
  t.equal(classifyAphoristicText('It is FORBIDDEN to add NODE_ENV checks in src/.'), null);
  t.equal(classifyAphoristicText('When a unit test exceeds 2 seconds, treat it as a hard error.'), null);
  t.equal(classifyAphoristicText('Do not pre-slice candidates to the requested replica count before admission.'), null);
  t.equal(classifyAphoristicText('Optional review roles do not replace the closure roles.'), null);
  t.notOk(isAphoristicText('Cache observes; owners decide.'));
  t.end();
});

test('validateRulesHaveTriggerAndCitation rejects aphoristic rules with file:line context', (t) => {
  const rules = [{
    id: 'TEST-0019',
    text: 'DO NOT IGNORE - Failing tests indicate broken functionality',
    sources: [{file: 'testing-guidelines/regression-policy.md', line: 341}],
  }];
  t.throws(
    () => validateRulesHaveTriggerAndCitation(rules, 'testing'),
    /TEST-0019.*regression-policy\.md:341.*aphoristic.*admonition_marker/s,
  );
  t.end();
});

test('validateRulesHaveTriggerAndCitation rejects rules without any citation', (t) => {
  const rules = [{
    id: 'ARCH-9999',
    text: 'Owners must reconcile snapshots before publishing.',
    sources: [],
  }];
  t.throws(
    () => validateRulesHaveTriggerAndCitation(rules, 'architecture'),
    /ARCH-9999.*no source citation/s,
  );
  t.end();
});

test('validateRulesHaveTriggerAndCitation passes for well-formed rules', (t) => {
  const rules = [{
    id: 'OK-0001',
    text: 'When a package closes, the focused commit must include only commitScope files.',
    sources: [{file: '_legacy_work/RULES.md', line: 42}],
  }];
  t.doesNotThrow(() => validateRulesHaveTriggerAndCitation(rules, 'core'));
  t.end();
});

test('formatRuleCitation returns file:line link for the primary source', (t) => {
  t.equal(formatRuleCitation({sources: [{file: 'a.md', line: 7}]}), 'a.md:7');
  t.equal(formatRuleCitation({sources: [{file: 'a.md'}]}), 'a.md');
  t.equal(formatRuleCitation({sources: []}), '');
  t.equal(formatRuleCitation({}), '');
  t.end();
});

test('renderPackMarkdown emits per-rule source citations inline', (t) => {
  const output = {name: 'governance', filename: 'governance.md', domains: ['governance']};
  const rules = [{
    id: 'GOV-9000',
    domain: 'governance',
    text: 'Optional review roles do not replace the closure roles.',
    tags: ['governance'],
    sources: [{file: 'workflow-guidelines/subagents.md', line: 38}],
    score: 1,
    strength: 'must',
  }];
  const md = renderPackMarkdown(output, rules);
  t.ok(md.includes('[GOV-9000]'));
  t.ok(md.includes('_(see workflow-guidelines/subagents.md:38)_'));
  t.end();
});

test('renderPackMarkdown throws when any rule is aphoristic', (t) => {
  const output = {name: 'testing', filename: 'testing.md', domains: ['testing']};
  const rules = [{
    id: 'TEST-9000',
    domain: 'testing',
    text: 'STOP - Do not accept the test as passing',
    tags: ['testing'],
    sources: [{file: 'testing-guidelines/harness.md', line: 58}],
    score: 1,
    strength: 'must',
  }];
  t.throws(
    () => renderPackMarkdown(output, rules),
    /TEST-9000.*aphoristic.*admonition_marker/s,
  );
  t.end();
});
