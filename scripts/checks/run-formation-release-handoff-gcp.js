#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {computeFileSetFingerprint, computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {
  analyzeFormationReleaseEvents,
  FORMATION_TIMEOUT_CODE,
  projectLiveLogEntriesToEvents,
  REVERT_COUNTEREXAMPLE,
} from './formation-release-handoff-gcp-analysis.js';
import {
  startGcpAffinityCluster,
} from '../../examples/service-data-affinity/gcp-cluster-provider.js';
import {parseExactJson} from '../solve/exact-json.js';
import {buildDigestRecord} from '../release-content-digest.js';
import {
  canonicalCommitDelta,
  commitDeltaChangedPaths,
} from '../solve/content-addressed-change-artifact.js';
import {resolveDockerBuildContextManifest} from
  '../../test/distributed/harness/docker-provider.js';

const arraySort = Function.call.bind(Array.prototype.sort);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const bufferFrom = Buffer.from;
const bufferEquals = Function.call.bind(Buffer.prototype.equals);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const DateConstructor = Date;
const dateNow = Date.now;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const numberIsFinite = Number.isFinite;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const stringConstructor = String;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_ROOT = path.join(
  ROOT,
  'test-output/reports/formation-release-handoff-closure',
);
const FIXED_VARIANT = 'fixed';
const REVERTED_VARIANT = 'reverted';
const EXPECTED_FINGERPRINT_ARG = '--expected-source-fingerprint=';
const EXPECTED_CONTROLLER_DIGEST_ARG = '--expected-controller-digest=';
const EXPECTED_RELEASE_CONTENT_DIGEST_ARG =
  '--expected-release-content-digest=';
const EXPECTED_FIXED_COMMIT_ARG = '--expected-fixed-commit=';
const EXPECTED_BUILD_INPUT_DIGEST_ARG = '--expected-build-input-digest=';
const RUNTIME_ROOT_ARG = '--runtime-root=';
const REVERT_MANIFEST_ARG = '--revert-manifest=';
const SHA256_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const UTF8_ENCODING = 'utf8';
const OWN_DATA_VALUE_FIELD = 'value';
const OWN_DATA_MESSAGE_FIELD = 'message';
const LOG_FILE_SUFFIX = '.log';
const GIT_COMMIT_SHA_LENGTH = 40;
const SHA256_HEX_LENGTH = 64;
const REPORT_SCHEMA_VERSION = 3;
const REPORT_SCENARIO = 'formation-release-handoff-closure-live-gcp';
const REPORT_FIDELITY = 'live-gcp';
const CLOSURE_OBSERVATION_LABEL = 'formation release handoff closure';
const ERROR = Object.freeze({
  COMMITTED_ENDPOINT_REQUIRED: 'exact committed endpoint is required',
  RUNTIME_ENDPOINT_MISMATCH:
    'runtime endpoint must be the exact clean commit',
  CONTROLLER_DIGEST_MISMATCH:
    'controller digest does not match expectation',
  RELEASE_CONTENT_MISMATCH:
    'release-content identity does not match expectation',
  SOURCE_FINGERPRINT_MISMATCH:
    'runtime source fingerprint does not match expectation',
  BUILD_INPUT_DIGEST_MISMATCH:
    'runtime build-input digest does not match expectation',
  REVERTED_ROOT_REQUIRED:
    'reverted runtime requires a separate source root',
  REVERT_MANIFEST_MISMATCH:
    'revert manifest does not bind the selected runtime',
  OBSERVATION_OWNER_UNAVAILABLE:
    'cluster closure observation owner unavailable',
});
const CLOSURE_OBSERVATION_TIMEOUT_MS = 60_000;
const CLOSURE_OBSERVATION_INTERVAL_MS = 200;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const CONTROLLER_PATHS = Object.freeze([
  'examples/service-data-affinity/gcp-cluster-provider.js',
  'scripts/checks/formation-release-handoff-gcp-analysis.js',
  'scripts/checks/run-formation-release-handoff-gcp.js',
  'test/distributed/build-image.js',
]);

function sha256(bytes) {
  return createHash(SHA256_ALGORITHM).update(bytes).digest(HEX_ENCODING);
}

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value :
    undefined;
}

function parseLogLine(line) {
  try {
    const value = jsonParse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function readLogEvents(outputDir) {
  const names = arraySort(await fs.readdir(outputDir));
  const events = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (!stringIncludes(name, LOG_FILE_SUFFIX)) continue;
    const bytes = await fs.readFile(path.join(outputDir, name), 'utf8');
    const lines = stringSplit(bytes, '\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const event = parseLogLine(lines[lineIndex]);
      if (event) events[events.length] = event;
    }
  }
  return events;
}

function resolveVariant(argv = process.argv.slice(2)) {
  const value = arrayFind(argv, (arg) =>
    arg === `--variant=${FIXED_VARIANT}` ||
    arg === `--variant=${REVERTED_VARIANT}`);
  return value === `--variant=${REVERTED_VARIANT}` ?
    REVERTED_VARIANT : FIXED_VARIANT;
}

function resolveArgumentValue(argv, prefix) {
  const argument = arrayFind(argv, (value) =>
    typeof value === 'string' && stringStartsWith(value, prefix));
  return argument ? stringSlice(argument, prefix.length) : null;
}

function normalizeRevertedPathList(value) {
  if (!arrayIsArray(value) || value.length === 0) return null;
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    if (
      typeof value[index] !== 'string' ||
      value[index].length === 0 ||
      arrayIncludes(result, value[index])
    ) return null;
    result[result.length] = value[index];
  }
  return result;
}

function requireArgument(argv, prefix, message) {
  const value = resolveArgumentValue(argv, prefix);
  if (!value) throw new Error(message);
  return value;
}

function allTrue(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== true) return false;
  }
  return true;
}

function commitShaIsExact(value) {
  if (typeof value !== 'string' || value.length !== GIT_COMMIT_SHA_LENGTH) {
    return false;
  }
  const allowed = '0123456789abcdef';
  for (let index = 0; index < value.length; index += 1) {
    if (!stringIncludes(allowed, value[index])) return false;
  }
  return true;
}

function resolveCommittedEndpoint(root, expectedCommit) {
  if (!commitShaIsExact(expectedCommit)) {
    throw new Error(ERROR.COMMITTED_ENDPOINT_REQUIRED);
  }
  const headCommit = execFileSync(
    'git',
    ['-C', root, 'rev-parse', 'HEAD'],
    {encoding: UTF8_ENCODING, maxBuffer: GIT_MAX_BUFFER_BYTES},
  );
  const dirty = execFileSync(
    'git',
    ['-C', root, 'status', '--porcelain', '--untracked-files=all'],
    {encoding: UTF8_ENCODING, maxBuffer: GIT_MAX_BUFFER_BYTES},
  );
  const normalizedHeadCommit = stringTrim(headCommit);
  const normalizedDirty = stringTrim(dirty);
  if (normalizedHeadCommit !== expectedCommit || normalizedDirty.length > 0) {
    throw new Error(ERROR.RUNTIME_ENDPOINT_MISMATCH);
  }
  return normalizedHeadCommit;
}

function defaultBindingOwners() {
  return {
    buildDigestRecord,
    canonicalCommitDelta,
    commitDeltaChangedPaths,
    resolveCommittedEndpoint,
    resolveDockerBuildContextManifest,
  };
}

async function resolveControllerBinding(argv, owners) {
  const expectedControllerDigest = requireArgument(
    argv,
    EXPECTED_CONTROLLER_DIGEST_ARG,
    'expected controller digest is required',
  );
  const controllerDigest = await computeFileSetFingerprint(
    ROOT,
    CONTROLLER_PATHS,
  );
  if (controllerDigest !== expectedControllerDigest) {
    throw new Error(ERROR.CONTROLLER_DIGEST_MISMATCH);
  }
  const expectedReleaseContentDigest = requireArgument(
    argv,
    EXPECTED_RELEASE_CONTENT_DIGEST_ARG,
    'expected release-content digest is required',
  );
  const expectedFixedCommit = requireArgument(
    argv,
    EXPECTED_FIXED_COMMIT_ARG,
    'expected fixed commit is required',
  );
  const releaseRecord = await owners.buildDigestRecord(ROOT);
  owners.resolveCommittedEndpoint(ROOT, expectedFixedCommit);
  if (
    releaseRecord.releaseContentDigest !== expectedReleaseContentDigest ||
    releaseRecord.headCommit !== expectedFixedCommit
  ) {
    throw new Error(ERROR.RELEASE_CONTENT_MISMATCH);
  }
  return {
    controllerDigest,
    expectedControllerDigest,
    expectedFixedCommit,
    expectedReleaseContentDigest,
    releaseRecord,
  };
}

async function resolveRuntimeBinding(argv, owners) {
  const runtimeRootValue = resolveArgumentValue(argv, RUNTIME_ROOT_ARG);
  const runtimeRoot = runtimeRootValue ? path.resolve(runtimeRootValue) : ROOT;
  const expectedSourceFingerprint = requireArgument(
    argv,
    EXPECTED_FINGERPRINT_ARG,
    'expected runtime source fingerprint is required',
  );
  const runtimeSourceFingerprint = await computeSourceFingerprint(
    path.join(runtimeRoot, 'src'),
  );
  if (runtimeSourceFingerprint !== expectedSourceFingerprint) {
    throw new Error(ERROR.SOURCE_FINGERPRINT_MISMATCH);
  }
  const expectedBuildInputDigest = requireArgument(
    argv,
    EXPECTED_BUILD_INPUT_DIGEST_ARG,
    'expected runtime build-input digest is required',
  );
  const buildContextManifest =
    await owners.resolveDockerBuildContextManifest(runtimeRoot, 'Dockerfile');
  if (buildContextManifest.buildInputDigest !== expectedBuildInputDigest) {
    throw new Error(ERROR.BUILD_INPUT_DIGEST_MISMATCH);
  }
  return {
    buildContextManifest,
    expectedBuildInputDigest,
    expectedSourceFingerprint,
    runtimeRoot,
    runtimeRootValue,
    runtimeSourceFingerprint,
  };
}

function expectedRevertCounterexample(value) {
  return value ===
    REVERT_COUNTEREXAMPLE.TRANSIENT_PROJECTION_OMISSION_REVOCATION ||
    value === REVERT_COUNTEREXAMPLE.FORMATION_TIMEOUT_WITHOUT_GENERATION;
}

function resolveReverseArtifactPath(manifest, manifestPath) {
  const file = manifest?.reverseArtifactFile;
  if (typeof file !== 'string' || file !== path.basename(file)) return null;
  return path.join(path.dirname(manifestPath), file);
}

function revertEndpointManifestMatches(manifest, expected) {
  return allTrue([
    manifest?.schemaVersion === 2,
    manifest?.variant === REVERTED_VARIANT,
    manifest?.fixedCommit === expected.fixedCommit,
    manifest?.revertedCommit === expected.revertedCommit,
    manifest?.controllerDigest === expected.controllerDigest,
    manifest?.fixedReleaseContentDigest ===
      expected.fixedReleaseContentDigest,
    manifest?.fixedBuildInputDigest === expected.fixedBuildInputDigest,
    manifest?.revertedBuildInputDigest === expected.revertedBuildInputDigest,
    manifest?.fixedSourceFingerprint === expected.fixedSourceFingerprint,
    manifest?.runtimeSourceFingerprint ===
      expected.runtimeSourceFingerprint,
  ]);
}

function revertArtifactManifestMatches(manifest, expected) {
  return allTrue([
    typeof manifest?.reverseArtifactSha256 === 'string',
    manifest?.reverseArtifactSha256?.length === SHA256_HEX_LENGTH,
    expected.reverseArtifactMatches,
    expected.revertedPaths !== null,
    expected.changedPathsMatch,
    expectedRevertCounterexample(manifest?.expectedCounterexample),
  ]);
}

function revertManifestMatches(manifest, expected) {
  return revertEndpointManifestMatches(manifest, expected) &&
    revertArtifactManifestMatches(manifest, expected);
}

function listsAreExact(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function canonicalArtifactMatches(delta, artifactBytes, expectedSha256) {
  if (!delta?.ok || !artifactBytes) return false;
  const canonicalBytes = bufferFrom(delta.content, 'utf8');
  return bufferEquals(canonicalBytes, artifactBytes) &&
    sha256(artifactBytes) === expectedSha256;
}

async function resolveRevertBinding(argv, runtime, controller, owners) {
  if (!runtime.runtimeRootValue || runtime.runtimeRoot === ROOT) {
    throw new Error(ERROR.REVERTED_ROOT_REQUIRED);
  }
  const manifestPath = path.resolve(requireArgument(
    argv,
    REVERT_MANIFEST_ARG,
    'reverted runtime requires an exact revert manifest',
  ));
  const manifestBytes = await fs.readFile(manifestPath);
  const manifest = parseExactJson(bufferToString(manifestBytes, 'utf8'));
  const reverseArtifactPath = resolveReverseArtifactPath(
    manifest,
    manifestPath,
  );
  const reverseArtifactBytes = reverseArtifactPath ?
    await fs.readFile(reverseArtifactPath) : null;
  const fixedSourceFingerprint = await computeSourceFingerprint(
    path.join(ROOT, 'src'),
  );
  const fixedBuildContextManifest =
    await owners.resolveDockerBuildContextManifest(ROOT, 'Dockerfile');
  const revertedPaths = normalizeRevertedPathList(
    manifest?.orderedRevertedPaths,
  );
  const revertedCommit = owners.resolveCommittedEndpoint(
    runtime.runtimeRoot,
    manifest?.revertedCommit,
  );
  const changedPaths = owners.commitDeltaChangedPaths(
    runtime.runtimeRoot,
    controller.expectedFixedCommit,
    revertedCommit,
  );
  const changedPathsMatch = listsAreExact(changedPaths, revertedPaths);
  const delta = revertedPaths ? owners.canonicalCommitDelta(
    runtime.runtimeRoot,
    controller.expectedFixedCommit,
    revertedCommit,
    revertedPaths,
  ) : null;
  const reverseArtifactMatches = canonicalArtifactMatches(
    delta,
    reverseArtifactBytes,
    manifest?.reverseArtifactSha256,
  );
  if (!revertManifestMatches(manifest, {
    changedPathsMatch,
    controllerDigest: controller.controllerDigest,
    fixedBuildInputDigest: fixedBuildContextManifest.buildInputDigest,
    fixedCommit: controller.expectedFixedCommit,
    fixedReleaseContentDigest: controller.expectedReleaseContentDigest,
    fixedSourceFingerprint,
    revertedBuildInputDigest: runtime.buildContextManifest.buildInputDigest,
    revertedCommit,
    reverseArtifactMatches,
    revertedPaths,
    runtimeSourceFingerprint: runtime.runtimeSourceFingerprint,
  })) {
    throw new Error(ERROR.REVERT_MANIFEST_MISMATCH);
  }
  return {
    revertManifest: {
      ...manifest,
      orderedRevertedPaths: revertedPaths,
      reverseArtifactPath,
    },
    revertManifestSha256: sha256(manifestBytes),
  };
}

async function resolveRunBinding(
  argv = process.argv.slice(2),
  owners = defaultBindingOwners(),
) {
  const variant = resolveVariant(argv);
  const controller = await resolveControllerBinding(argv, owners);
  const runtime = await resolveRuntimeBinding(argv, owners);
  const revert = variant === REVERTED_VARIANT ?
    await resolveRevertBinding(argv, runtime, controller, owners) : {
      revertManifest: null,
      revertManifestSha256: null,
    };
  return {
    variant,
    fixedBuildInputDigest: revert.revertManifest?.fixedBuildInputDigest ||
      runtime.buildContextManifest.buildInputDigest,
    runtimeRoot: runtime.runtimeRoot,
    runtimeBuildInputDigest: runtime.buildContextManifest.buildInputDigest,
    runtimeBuildInputPaths: runtime.buildContextManifest.entries,
    runtimeSourceFingerprint: runtime.runtimeSourceFingerprint,
    expectedBuildInputDigest: runtime.expectedBuildInputDigest,
    expectedSourceFingerprint: runtime.expectedSourceFingerprint,
    controllerDigest: controller.controllerDigest,
    expectedControllerDigest: controller.expectedControllerDigest,
    fixedCommit: controller.expectedFixedCommit,
    fixedSourceFingerprint: controller.releaseRecord.srcFingerprint,
    revertedBuildInputDigest:
      revert.revertManifest?.revertedBuildInputDigest || null,
    revertedSourceFingerprint:
      revert.revertManifest?.runtimeSourceFingerprint || null,
    releaseContentDigest: controller.releaseRecord.releaseContentDigest,
    releaseContentFileCount: controller.releaseRecord.fileCount,
    revertManifest: revert.revertManifest,
    revertManifestSha256: revert.revertManifestSha256,
  };
}

async function observeFixedClosure(
  cluster,
  sourceFingerprint,
  now = dateNow,
) {
  const collector = cluster?.getLogCollector?.();
  const nodes = cluster?.getNodes?.();
  const seedNode = arrayIsArray(nodes) ? nodes[0] : null;
  if (
    typeof cluster?.waitForState !== 'function' ||
    typeof collector?.collectFinalSnapshot !== 'function' ||
    typeof collector?.getBuffer !== 'function' ||
    !seedNode
  ) {
    throw new Error(ERROR.OBSERVATION_OWNER_UNAVAILABLE);
  }
  const startedAt = now();
  // Cluster startup intentionally attaches the live stream only after every
  // node is ACTIVE, while formation can complete during that wait. Reconcile
  // the durable history once after the stream is attached, then let the stream
  // own the tail. LogCollector's log-id fence deduplicates the overlap.
  await collector.collectFinalSnapshot(seedNode);
  const snapshotElapsedMs = now() - startedAt;
  if (!numberIsFinite(snapshotElapsedMs) || snapshotElapsedMs < 0) {
    return {
      satisfied: false,
      elapsedMs: CLOSURE_OBSERVATION_TIMEOUT_MS,
      polls: 0,
      value: false,
    };
  }
  const remainingTimeoutMs =
    CLOSURE_OBSERVATION_TIMEOUT_MS - snapshotElapsedMs;
  if (remainingTimeoutMs < 0) {
    return {
      satisfied: false,
      elapsedMs: snapshotElapsedMs,
      polls: 0,
      value: false,
    };
  }
  const analyzeBufferedClosure = () => {
    const entries = collector.getBuffer();
    const events = projectLiveLogEntriesToEvents(entries);
    const analysis = analyzeFormationReleaseEvents(events, sourceFingerprint);
    return analysis.closurePassed ? analysis : false;
  };
  const replayObservation = analyzeBufferedClosure();
  if (replayObservation || remainingTimeoutMs === 0) {
    return {
      satisfied: replayObservation !== false,
      elapsedMs: snapshotElapsedMs,
      polls: 1,
      value: replayObservation || false,
    };
  }
  const tailObservation = await cluster.waitForState(
    analyzeBufferedClosure, {
      timeoutMs: remainingTimeoutMs,
      intervalMs: CLOSURE_OBSERVATION_INTERVAL_MS,
      throwOnTimeout: false,
      label: CLOSURE_OBSERVATION_LABEL,
    });
  const measuredElapsedMs = now() - startedAt;
  const tailElapsedMs = tailObservation?.elapsedMs;
  const elapsedIsValid = numberIsFinite(measuredElapsedMs) &&
    measuredElapsedMs >= snapshotElapsedMs &&
    numberIsFinite(tailElapsedMs) && tailElapsedMs >= 0;
  if (!elapsedIsValid) {
    return {
      ...tailObservation,
      satisfied: false,
      elapsedMs: CLOSURE_OBSERVATION_TIMEOUT_MS,
      value: false,
    };
  }
  const minimumElapsedMs = snapshotElapsedMs + tailElapsedMs;
  const totalElapsedMs = measuredElapsedMs >= minimumElapsedMs ?
    measuredElapsedMs : minimumElapsedMs;
  const satisfied = tailObservation.satisfied === true &&
    totalElapsedMs <= CLOSURE_OBSERVATION_TIMEOUT_MS;
  return {
    ...tailObservation,
    satisfied,
    elapsedMs: totalElapsedMs,
    value: satisfied ? tailObservation.value : false,
  };
}

async function runCluster(outputDir, binding) {
  let handle = null;
  let error = null;
  let closureObservation = null;
  try {
    handle = await startGcpAffinityCluster({
      verbose: true,
      outputDir,
      buildRoot: binding.runtimeRoot,
      expectedBuildInputDigest: binding.runtimeBuildInputDigest,
    });
    if (binding.variant === FIXED_VARIANT) {
      closureObservation = await observeFixedClosure(
        handle.cluster,
        binding.runtimeSourceFingerprint,
      );
    }
  } catch (caught) {
    error = caught;
  } finally {
    if (handle) {
      try {
        await handle.stop();
      } catch (caught) {
        error ||= caught;
      }
    }
  }
  return {error, closureObservation};
}

async function analyzeClusterOutput(outputDir, sourceFingerprint) {
  try {
    return {
      analysis: analyzeFormationReleaseEvents(
        await readLogEvents(outputDir),
        sourceFingerprint,
      ),
      error: null,
    };
  } catch (error) {
    return {analysis: null, error};
  }
}

async function writeReport(report, outputDir) {
  await fs.mkdir(path.dirname(outputDir), {recursive: true});
  const reportBytes = bufferFrom(`${jsonStringify(report, null, 2)}\n`);
  const reportPath = path.join(path.dirname(outputDir), 'report.json');
  await fs.writeFile(reportPath, reportBytes);
  process.stdout.write(`${jsonStringify({
    ...report,
    report: path.relative(ROOT, reportPath),
    reportSha256: sha256(reportBytes),
  }, null, 2)}\n`);
}

function fixedEvidencePassed(variant, cluster, analysis) {
  if (variant !== FIXED_VARIANT) return true;
  return cluster.closureObservation?.satisfied === true &&
    analysis?.closurePassed === true;
}

function revertedCounterexampleObserved(variant, expected, analysis) {
  if (variant !== REVERTED_VARIANT) return true;
  return analysis?.closurePassed === false &&
    analysis?.counterexampleClassification === expected;
}

function executionOutcomeExpected(variant, expected, analysis, error) {
  if (error === null) return true;
  if (variant !== REVERTED_VARIANT) return false;
  if (expected !== REVERT_COUNTEREXAMPLE.FORMATION_TIMEOUT_WITHOUT_GENERATION) {
    return false;
  }
  if (analysis?.counterexampleClassification !== expected) return false;
  const code = readOwnData(error, 'code');
  const message = readOwnData(error, OWN_DATA_MESSAGE_FIELD);
  return code === FORMATION_TIMEOUT_CODE ||
    (typeof message === 'string' &&
      stringIncludes(message, FORMATION_TIMEOUT_CODE));
}

function reportRevertEvidence(binding) {
  if (!binding.revertManifest) {
    return {
      expectedCounterexample: null,
      revertedCommit: null,
      orderedRevertedPaths: [],
      reverseArtifactSha256: null,
    };
  }
  return {
    expectedCounterexample: binding.revertManifest.expectedCounterexample,
    revertedCommit: binding.revertManifest.revertedCommit,
    orderedRevertedPaths: binding.revertManifest.orderedRevertedPaths,
    reverseArtifactSha256: binding.revertManifest.reverseArtifactSha256,
  };
}

function errorMessage(error) {
  if (!error) return null;
  return stringConstructor(readOwnData(error, OWN_DATA_MESSAGE_FIELD) || error);
}

function buildRunReport(options) {
  const revert = reportRevertEvidence(options.binding);
  const passed = allTrue([
    fixedEvidencePassed(options.binding.variant, options.cluster,
      options.analysis),
    revertedCounterexampleObserved(
      options.binding.variant,
      revert.expectedCounterexample,
      options.analysis,
    ),
    executionOutcomeExpected(
      options.binding.variant,
      revert.expectedCounterexample,
      options.analysis,
      options.error,
    ),
  ]);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    scenario: REPORT_SCENARIO,
    fidelity: REPORT_FIDELITY,
    variant: options.binding.variant,
    controllerRoot: ROOT,
    controllerDigest: options.binding.controllerDigest,
    expectedControllerDigest: options.binding.expectedControllerDigest,
    controllerPaths: CONTROLLER_PATHS,
    fixedCommit: options.binding.fixedCommit,
    fixedSourceFingerprint: options.binding.fixedSourceFingerprint,
    fixedBuildInputDigest: options.binding.fixedBuildInputDigest,
    releaseContentDigest: options.binding.releaseContentDigest,
    releaseContentFileCount: options.binding.releaseContentFileCount,
    runtimeRoot: options.binding.runtimeRoot,
    runtimeBuildInputDigest: options.binding.runtimeBuildInputDigest,
    expectedBuildInputDigest: options.binding.expectedBuildInputDigest,
    runtimeBuildInputPaths: options.binding.runtimeBuildInputPaths,
    revertedBuildInputDigest: options.binding.revertedBuildInputDigest,
    revertedSourceFingerprint: options.binding.revertedSourceFingerprint,
    sourceFingerprint: options.binding.runtimeSourceFingerprint,
    expectedSourceFingerprint: options.binding.expectedSourceFingerprint,
    revertManifestSha256: options.binding.revertManifestSha256,
    reverseArtifactSha256: revert.reverseArtifactSha256,
    orderedRevertedPaths: revert.orderedRevertedPaths,
    expectedCounterexample: revert.expectedCounterexample,
    revertedCommit: revert.revertedCommit,
    startedAt: dateToISOString(options.startedAt),
    finishedAt: dateToISOString(new DateConstructor()),
    passed,
    clusterStartPassed: options.error === null,
    closureObservation: options.cluster.closureObservation,
    error: errorMessage(options.error),
    analysis: options.analysis,
    logDir: path.relative(ROOT, options.outputDir),
  };
}

async function runFormationReleaseHandoffGcp(options = {}) {
  const binding = options.binding || await resolveRunBinding(
    options.argv || process.argv.slice(2),
  );
  const sourceFingerprint = binding.runtimeSourceFingerprint;
  const startedAt = new DateConstructor();
  const runId = stringReplaceAll(dateToISOString(startedAt), ':', '-');
  const outputDir = path.join(REPORT_ROOT, runId, 'full-logs');
  const cluster = await runCluster(outputDir, binding);
  const analyzed = await analyzeClusterOutput(outputDir, sourceFingerprint);
  const error = cluster.error || analyzed.error;
  const report = buildRunReport({
    analysis: analyzed.analysis,
    binding,
    cluster,
    error,
    outputDir,
    startedAt,
  });
  await writeReport(report, outputDir);
  if (!report.passed) process.exitCode = 1;
  return report;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runFormationReleaseHandoffGcp();
}

export {
  analyzeFormationReleaseEvents,
  CONTROLLER_PATHS,
  executionOutcomeExpected,
  observeFixedClosure,
  readLogEvents,
  REVERT_COUNTEREXAMPLE,
  revertedCounterexampleObserved,
  resolveRunBinding,
  runFormationReleaseHandoffGcp,
};
