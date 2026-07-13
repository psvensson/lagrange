import {test} from '../../src/test-helpers/tap.js';
import {
  loadRuleCorpus,
  loadRules,
  matchesRule,
  renderIndex,
} from '../../scripts/lookup-rule.js';

const SAMPLE = {
  id: 'ARCH-0001', domain: 'architecture', strength: 'must_not',
  tags: ['ownership', 'cache'], rule: 'Owners decide; caches observe.',
  sources: [{file: 'a.md', line: 9, section: 'X'}],
};

test('matchesRule filters by id, domain, strength, tag, and free text', (t) => {
  t.ok(matchesRule(SAMPLE, {id: 'ARCH-0001', terms: []}));
  t.notOk(matchesRule(SAMPLE, {id: 'ARCH-9999', terms: []}));
  t.ok(matchesRule(SAMPLE, {domain: 'architecture', terms: []}));
  t.notOk(matchesRule(SAMPLE, {domain: 'testing', terms: []}));
  t.ok(matchesRule(SAMPLE, {strength: 'must_not', terms: []}));
  t.ok(matchesRule(SAMPLE, {tag: 'cache', terms: []}));
  t.notOk(matchesRule(SAMPLE, {tag: 'routing', terms: []}));
  t.ok(matchesRule(SAMPLE, {terms: ['owners', 'observe']}));
  t.notOk(matchesRule(SAMPLE, {terms: ['nonexistent']}));
  t.end();
});

test('renderIndex emits one row per rule and a correct total', (t) => {
  const rules = [SAMPLE, {...SAMPLE, id: 'ARCH-0002'}];
  const sources = [{
    file: 'a.md', role: 'packed', domain: 'architecture',
    masterRuleCount: 2, aliasRuleCount: 0,
  }];
  const md = renderIndex(rules, sources);
  t.match(md, /Total rules: 2/);
  t.match(md, /\| a\.md \| packed \| architecture \| 2 \| 0 \|/u);
  t.match(md, /a\.md:9 \[packed\]/u);
  const rows = md.split('\n').filter((l) => /^\| ARCH-\d+ \|/.test(l));
  t.equal(rows.length, 2, 'one table row per rule');
  t.end();
});

test('the committed index is in sync with rules.json (drift guard)', (t) => {
  // Guards WS9: the generated rules-index.md line count must equal rules.length.
  const corpus = loadRuleCorpus();
  const rules = loadRules();
  const md = renderIndex(rules, corpus.sourceFiles || []);
  const rows = md.split('\n').filter((l) => /^\| [A-Z]+-\d+ \|/.test(l));
  t.equal(rows.length, rules.length, 'index row count === rules.length');
  t.end();
});
