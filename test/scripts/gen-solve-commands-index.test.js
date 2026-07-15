import tap from 'tap';

import {flagKnownToSource} from '../../scripts/gen-solve-commands-index.js';

tap.test('command index recognizes direct argument references', (t) => {
  t.equal(flagKnownToSource('args[\'plan-doc\']', 'plan-doc'), true);
  t.equal(flagKnownToSource('args.planDoc', 'planDoc'), true);
  t.end();
});

tap.test('command index recognizes string constants used as argument keys', (t) => {
  const source = [
    'const PLAN_DOC_ARGUMENT = \'plan-doc\';',
    'const value = args[PLAN_DOC_ARGUMENT];',
  ].join('\n');

  t.equal(flagKnownToSource(source, 'plan-doc'), true);
  t.end();
});

tap.test('command index rejects unused string constants', (t) => {
  const source = 'const PLAN_DOC_ARGUMENT = \'plan-doc\';';

  t.equal(flagKnownToSource(source, 'plan-doc'), false);
  t.end();
});

tap.test('command index keeps computed constants within one source file', (t) => {
  const sourceChunks = [
    'const OPTION = \'stale-flag\';',
    'const OPTION = \'real-flag\'; args[OPTION];',
  ];

  t.equal(flagKnownToSource(sourceChunks, 'stale-flag'), false);
  t.equal(flagKnownToSource(sourceChunks, 'real-flag'), true);
  t.end();
});

tap.test('command index ignores computed argument references in comments', (t) => {
  const source = [
    'const PLAN_DOC_ARGUMENT = \'plan-doc\';',
    '// args[PLAN_DOC_ARGUMENT];',
  ].join('\n');

  t.equal(flagKnownToSource(source, 'plan-doc'), false);
  t.end();
});
