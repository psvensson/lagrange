import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as nodeTest from 'node:test';
import {
  CensusNotMeasuredError,
  readTree,
  unproducedWritePhaseFields,
} from '../../scripts/checks/partition-write-phase-field-producer-census.js';
import {
  PartitionServiceWriteMetricsBase,
} from '../../src/partition/partition-service-write-metrics-base.js';

const describe = typeof global.describe === 'function' ?
  global.describe :
  nodeTest.describe;
const it = typeof global.it === 'function' ?
  global.it :
  nodeTest.it;

const SHARED = [
  'const WRITE_PHASE_FIELD_PRODUCED_MS = \'producedMs\';',
  'const WRITE_PHASE_FIELD_ASSIGNED_MS = \'assignedMs\';',
  'const WRITE_PHASE_FIELD_PLANTED_MS = \'plantedMs\';',
].join('\n');
const BUILDER = [
  'class X {',
  '  buildWritePhaseTimingPayload(phaseTimings) {',
  '    return {',
  '      [WRITE_PHASE_FIELD_PRODUCED_MS]:',
  '        phaseTimings?.[WRITE_PHASE_FIELD_PRODUCED_MS] || 0,',
  '      [WRITE_PHASE_FIELD_ASSIGNED_MS]:',
  '        phaseTimings?.[WRITE_PHASE_FIELD_ASSIGNED_MS] || 0,',
  '      [WRITE_PHASE_FIELD_PLANTED_MS]:',
  '        phaseTimings?.[WRITE_PHASE_FIELD_PLANTED_MS] || 0,',
  '    };',
  '  }',
  '}',
  '',
].join('\n');
const EMPTY_SHARED = '';
const PRODUCERS = [
  'service.recordWritePhaseDuration(',
  '  phaseTimings,',
  '  WRITE_PHASE_FIELD_PRODUCED_MS,',
  '  startedAt,',
  ');',
  'phaseTimings[WRITE_PHASE_FIELD_ASSIGNED_MS] = 5;',
  '',
].join('\n');
const BUILDER_PATH = 'src/partition/partition-service-write-metrics-base.js';

function censusOf(builderText, sharedText = SHARED) {
  return () => unproducedWritePhaseFields({
    sharedText,
    builderText,
    sources: [{path: BUILDER_PATH, text: builderText}],
  });
}

describe('partition write-phase payload producer census', () => {
  it('fails closed: a missing payload builder is not a zero count', () => {
    assert.throws(censusOf('class X {}\n'), CensusNotMeasuredError);
  });

  it('fails closed: a builder with no phaseTimings read is not a zero count', () => {
    const builder = [
      'class X {',
      '  buildWritePhaseTimingPayload(phaseTimings) {',
      '    return {};',
      '  }',
      '}',
      '',
    ].join('\n');
    assert.throws(censusOf(builder), CensusNotMeasuredError);
  });

  it('fails closed: a read whose constant has no definition is not a zero count', () => {
    assert.throws(censusOf(BUILDER, EMPTY_SHARED), CensusNotMeasuredError);
  });

  it('negative control: a planted payload field without a producer is counted', () => {
    const unproduced = unproducedWritePhaseFields({
      sharedText: SHARED,
      builderText: BUILDER,
      sources: [
        {path: BUILDER_PATH, text: BUILDER},
        {path: 'src/partition/producers.js', text: PRODUCERS},
      ],
    });
    assert.deepEqual(unproduced, ['plantedMs']);
  });

  it('negative control: an import-list or payload mention is not a producer', () => {
    const unproduced = unproducedWritePhaseFields({
      sharedText: SHARED,
      builderText: BUILDER,
      sources: [
        {path: BUILDER_PATH, text: BUILDER},
        {path: 'src/partition/imports.js', text: 'import {\n  WRITE_PHASE_FIELD_PRODUCED_MS,\n} from "x";\n'},
      ],
    });
    assert.deepEqual(unproduced, ['producedMs', 'assignedMs', 'plantedMs']);
  });

  it('witness: every field of the production payload has a producer in src', () => {
    assert.deepEqual(unproducedWritePhaseFields(readTree()), []);
  });

  it('witness: the emitted payload carries no field that nothing assigns', () => {
    const payload = PartitionServiceWriteMetricsBase.prototype
      .buildWritePhaseTimingPayload({}, 1, 0);
    assert.equal('logAppendMs' in payload, false);
    assert.equal('sqliteRunMs' in payload, false);
  });

  it('probe prints the count as a bare number on the last line', () => {
    let stdout;
    try {
      stdout = execFileSync(process.execPath, [
        'scripts/checks/partition-write-phase-field-producer-census.js',
        '--metric',
      ], {encoding: 'utf8'});
    } catch (error) {
      stdout = error.stdout;
    }
    assert.match(stdout, /^\d+\s*$/u);
    assert.equal(Number(stdout), 0);
  });
});
