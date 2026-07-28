import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const localText = Object.freeze({
  GIT: 'git',
  REV_PARSE: 'rev-parse',
  HEAD: 'HEAD',
  DIFF: 'diff',
  BINARY: '--binary',
  FULL_INDEX: '--full-index',
  NO_EXT_DIFF: '--no-ext-diff',
  PATH_SEPARATOR: '--',
  UTF8: 'utf8',
  SHA256: 'sha256',
});
const C4_SOURCE_PATHS = Object.freeze([
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/replay-benchmark-resource-evidence.js',
  'scripts/checks/run-benchmark-whole-topology-resource-accounting-live.js',
  'scripts/checks/run-benchmark-whole-topology-resource-accounting-scenarios.js',
  'test/distributed/harness/__tests__/benchmark-resource-evidence-test-fixture-constants.js',
  'test/distributed/harness/__tests__/benchmark-resource-evidence-test-fixture.js',
  'test/distributed/harness/__tests__/benchmark-resource-live-observation-authority.test.js',
  'test/distributed/harness/__tests__/benchmark-whole-topology-resource-accounting-adversarial.test.js',
  'test/distributed/harness/__tests__/benchmark-whole-topology-resource-accounting.test.js',
  'test/distributed/harness/__tests__/docker-provider.test.js',
  'test/distributed/harness/benchmark-resource-accounting.js',
  'test/distributed/harness/benchmark-resource-capacity-summary.js',
  'test/distributed/harness/benchmark-resource-contract-constants.js',
  'test/distributed/harness/benchmark-resource-cost-and-effects.js',
  'test/distributed/harness/benchmark-resource-durable-resolver.js',
  'test/distributed/harness/benchmark-resource-evidence-data.js',
  'test/distributed/harness/benchmark-resource-evidence-root-constants.js',
  'test/distributed/harness/benchmark-resource-evidence-root.js',
  'test/distributed/harness/benchmark-resource-live-observation-authority.js',
  'test/distributed/harness/benchmark-resource-live-root-validation.js',
  'test/distributed/harness/benchmark-resource-matrix-manifest.js',
  'test/distributed/harness/benchmark-resource-paired-run-evidence.js',
  'test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js',
  'test/distributed/harness/benchmark-resource-window-source.js',
  'test/distributed/harness/docker-provider.js',
]);

export async function collectBenchmarkResourceSourceProvenance(
  sourcePaths = C4_SOURCE_PATHS,
) {
  const {stdout: revisionText} = await execFileAsync(
    localText.GIT,
    [localText.REV_PARSE, localText.HEAD],
    {encoding: localText.UTF8},
  );
  const baseCommit = revisionText.trim();
  const {stdout: delta} = await execFileAsync(
    localText.GIT,
    [
      localText.DIFF,
      localText.BINARY,
      localText.FULL_INDEX,
      localText.NO_EXT_DIFF,
      baseCommit,
      localText.PATH_SEPARATOR,
      ...sourcePaths,
    ],
    {encoding: localText.UTF8},
  );
  if (delta.length === 0) {
    return {
      sourceRevision: `git-commit:${baseCommit}`,
      baseCommit,
      changeFingerprint: null,
    };
  }
  const changeFingerprint =
    `sha256:${createHash(localText.SHA256).update(delta).digest('hex')}`;
  return {
    sourceRevision: `git-delta:${baseCommit}:${changeFingerprint}`,
    baseCommit,
    changeFingerprint,
  };
}
