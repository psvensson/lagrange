import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {readCurrentMetricReport} from '../../scripts/metric-report-provenance.js';
import {createMetricFixture, runMetricProducer} from './metric-report-fixture.js';

test('hidden source bytes measured by actual jscpd invalidate duplication custody', (t) => {
  const root = createMetricFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const filename = path.join(root, 'test/.cache/duplicate.js');
  fs.mkdirSync(path.dirname(filename));
  fs.writeFileSync(filename, 'export const sparse = true;\n');
  const run = () => runMetricProducer(root, 'check-duplication.js', ['--target', 'test']);
  t.equal(run().status, 0, 'initial actual duplication measurement completed');
  const before = readCurrentMetricReport(root, 'duplicationTest');
  t.ok(before, 'initial sealed report is current');
  const stat = fs.statSync(filename);
  fs.copyFileSync(path.join(root, 'test/subject.test.js'), filename);
  fs.utimesSync(filename, stat.atime, stat.mtime);
  t.notOk(readCurrentMetricReport(root, 'duplicationTest'),
    'hidden file content invalidates cache without an mtime change');
  t.equal(run().status, 0, 'changed actual duplication measurement completed');
  const after = readCurrentMetricReport(root, 'duplicationTest');
  t.ok(after.statistics.total.clones > before.statistics.total.clones,
    'actual jscpd consumes the hidden copied source and measures its clone');
  t.end();
});
