import {test} from '../../src/test-helpers/tap.js';
import {
  applyRuleAliases,
  buildManifest,
  classifyAphoristicText,
  countMarkdownRules,
  formatRuleCitation,
  isAphoristicText,
  locateRuleBySourceRef,
  parseMarkdownCandidates,
  renderPackMarkdown,
  selectOutputRules,
  validateCompleteRules,
  validateRulesHaveTriggerAndCitation,
} from '../../scripts/generate-steering-llm-pack.js';

const TEST_SOURCE_FILE = 'system guidelines.md';
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
      canonical: {file: 'system-guidelines.md', line: 100},
      aliases: [{file: 'code-style.md', line: 50}],
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
      canonical: {file: 'system-guidelines.md', line: 100},
      aliases: [{file: 'missing.md', line: 1}],
    },
    {
      canonical: {file: 'nope.md', line: 1},
      aliases: [{file: 'system-guidelines.md', line: 100}],
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
    sources: [{file: 'work/RULES.md', line: 42}],
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
