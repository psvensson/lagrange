import tap from 'tap';

import {
  flipLadderRow,
  specLadderPathFromRef,
} from '../../scripts/solve/spec-ladder-flip.js';
import {renderHandoff} from '../../scripts/solve/handoff.js';

const LADDER = [
  '| Order | Quest | Required terminal |',
  '| --- | --- | --- |',
  '| 1 | `epic-rung-one` | terminal one |',
  '| 2 | `epic-rung-two` — ✅ SOLVED 2026-07-26 | terminal two |',
].join('\n');

tap.test('spec-ladder flip', async (t) => {
  t.test('resolves only solve/specs ladder refs', (t) => {
    t.equal(specLadderPathFromRef('solve/specs/my-epic/tasks.md#S4'),
      'solve/specs/my-epic/tasks.md');
    t.equal(specLadderPathFromRef('solve/specs/my-epic/tasks.md'),
      'solve/specs/my-epic/tasks.md');
    t.equal(specLadderPathFromRef('solve/specs/my-epic/requirements.md#r5'),
      null, 'requirements refs never flip');
    t.equal(specLadderPathFromRef('some-bare-id'), null);
    t.equal(specLadderPathFromRef(null), null);
    t.end();
  });

  t.test('marks the matching row after the id token', (t) => {
    const {content, changed} = flipLadderRow(LADDER, 'epic-rung-one',
      '2026-07-27');
    t.ok(changed);
    t.match(content, /\| 1 \| `epic-rung-one` — ✅ SOLVED 2026-07-27 \|/u);
    t.end();
  });

  t.test('a row already marked SOLVED is never re-stamped', (t) => {
    const {content, changed} = flipLadderRow(LADDER, 'epic-rung-two',
      '2026-07-27');
    t.notOk(changed);
    t.equal(content, LADDER);
    t.end();
  });

  t.test('an absent id changes nothing', (t) => {
    const {changed} = flipLadderRow(LADDER, 'not-in-ladder', '2026-07-27');
    t.notOk(changed);
    t.end();
  });

  t.test('checkbox-list specs get the same in-cell marker', (t) => {
    const {content, changed} = flipLadderRow(
      '- [ ] `list-quest` does the thing', 'list-quest', '2026-07-27');
    t.ok(changed);
    t.match(content, /`list-quest` — ✅ SOLVED 2026-07-27 does the thing/u);
    t.end();
  });
});

const LONG_STATEMENT = 'The release workflow contract validates package, ' +
  'chart, and image metadata against one authoritative version source; ' +
  'every consumer reads that source and drift fails the gate deterministically.';

function terminalHandoff(overrides = {}) {
  return {
    ok: true,
    checkpoint: false,
    checkpointReason: null,
    questId: 'q-subject',
    audit: {status: 'pass'},
    gate: {problems: []},
    inScope: ['solve/quests/q-subject.json'],
    outOfScope: [],
    summary: LONG_STATEMENT,
    title: null,
    coauthorTrailer: null,
    verificationPreflight: null,
    ...overrides,
  };
}

tap.test('terminal commit subject', async (t) => {
  t.test('a sealed title becomes the whole subject; statement is the body',
    (t) => {
      const rendered = renderHandoff(terminalHandoff(
        {title: 'Release metadata reads one version source'}));
      t.match(rendered,
        /q-subject: Release metadata reads one version source/u);
      t.match(rendered, /validates package/u, 'statement present as body');
      t.notMatch(rendered,
        /q-subject: The release workflow contract validates/u,
        'the statement never becomes the subject');
      t.end();
    });

  t.test('without a title the subject is the first clause, capped', (t) => {
    const rendered = renderHandoff(terminalHandoff());
    const subject = rendered.split('\n')
      .find((line) => line.includes('q-subject: '));
    t.ok(subject, 'commit command rendered');
    const summary = subject.split('q-subject: ')[1];
    t.ok(summary.length <= 73, `subject stays one line (${summary.length})`);
    t.match(summary, /^The release workflow contract validates/u);
    t.end();
  });
});
