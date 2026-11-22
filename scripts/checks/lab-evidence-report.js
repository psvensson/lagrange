#!/usr/bin/env node

// Factual P6 execution-evidence report producer and admission validator.
//
// Consumes original git references, multi-host lab placement directories,
// per-host runtime/backend/artifact/configuration manifests, and declared
// topology/cache-isolation scope. Emits a factual Markdown/JSON report and
// rejects mismatched SHAs, failed jobs, shared-cache cross-node CDC
// substitutions, and wrong or missing per-host manifests.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {validateEvidenceApplicability} from '../solve/probes.js';
import {executionReportProblems} from '../test-execution-report.js';
import {
  ARTIFACT_STATUS,
  CLAIM_KIND,
  CLI_FLAGS,
  EXIT_ADMITTED,
  EXIT_REFUSED,
  EXIT_USAGE_OR_UNAVAILABLE,
  FORMAT_MODES,
  LAB_EVIDENCE_SCHEMA,
  LABEL,
  MESSAGE,
  MIN_ISOLATED_NODES,
  ONE,
  OUTCOME,
  PLACEMENT_ENV_KEYS,
  PROBLEM_CODE,
  REMOTE_STATE,
  REPORT_TITLES,
  TEXT,
  TWO,
  ZERO,
  addProblem,
  arrayEvery,
  arrayFilter,
  arrayJoin,
  arrayMap,
  arraySome,
  inspectGitBranchState,
  inspectLabJobDirectory,
  isPlainObject,
  isValidSha,
  stringSplit,
  stringToLowerCase,
  stringTrim,
} from './lab-evidence-report-inputs.js';

function normalizeHostManifestMap(hostManifests) {
  const byHost = new Map();
  const list = Array.isArray(hostManifests) ?
    hostManifests :
    (Array.isArray(hostManifests?.hosts) ? hostManifests.hosts : []);
  for (const item of list) {
    if (isPlainObject(item) && typeof item.host === TEXT.TYPE_STRING && item.host.length > ZERO) {
      byHost.set(item.host, item);
    }
  }
  if (isPlainObject(hostManifests) && !Array.isArray(hostManifests.hosts)) {
    for (const [key, val] of Object.entries(hostManifests)) {
      if (isPlainObject(val)) {
        byHost.set(val.host || key, {host: val.host || key, ...val});
      }
    }
  }
  return byHost;
}

function describeArtifact(artifact) {
  if (typeof artifact === TEXT.TYPE_STRING) return artifact;
  if (!isPlainObject(artifact)) return TEXT.UNAVAILABLE;
  if (artifact.status === ARTIFACT_STATUS.NOT_APPLICABLE) {
    return `${ARTIFACT_STATUS.NOT_APPLICABLE} (${artifact.reason || TEXT.UNKNOWN})`;
  }
  return artifact.digest || artifact.id || TEXT.UNAVAILABLE;
}

function describeRuntime(runtime) {
  if (typeof runtime === TEXT.TYPE_STRING) return runtime;
  if (!isPlainObject(runtime)) return TEXT.UNAVAILABLE;
  return runtime.nodeVersion || runtime.version || TEXT.UNAVAILABLE;
}

function describeBackend(backend) {
  if (typeof backend === TEXT.TYPE_STRING) return backend;
  if (!isPlainObject(backend)) return TEXT.UNAVAILABLE;
  const parts = [];
  if (backend.consensus) parts.push(String(backend.consensus));
  if (backend.storage) parts.push(String(backend.storage));
  return parts.length > ZERO ? arrayJoin(parts, TEXT.SLASH) : TEXT.UNAVAILABLE;
}

function artifactMatches(actual, expected) {
  if (expected === undefined || expected === null) return true;
  if (isPlainObject(expected) && expected.digest) {
    return isPlainObject(actual) &&
      actual.status !== ARTIFACT_STATUS.NOT_APPLICABLE &&
      actual.digest === expected.digest;
  }
  if (isPlainObject(expected) && expected.status === ARTIFACT_STATUS.NOT_APPLICABLE) {
    return isPlainObject(actual) &&
      actual.status === ARTIFACT_STATUS.NOT_APPLICABLE &&
      typeof actual.reason === TEXT.TYPE_STRING &&
      actual.reason.length > ZERO;
  }
  return describeArtifact(actual) === describeArtifact(expected);
}

function subsetMatches(actual, expected) {
  if (expected === undefined || expected === null) return true;
  if (!isPlainObject(expected)) return actual === expected;
  if (!isPlainObject(actual)) return false;
  for (const [key, val] of Object.entries(expected)) {
    if (!subsetMatches(actual[key], val)) return false;
  }
  return true;
}

function validateHostArtifactField(manifest, host, expectedHostProfile, claimedSha, problems) {
  const artifact = manifest.artifact;
  if (artifact === undefined || artifact === null) {
    addProblem(
      problems,
      PROBLEM_CODE.HOST_ARTIFACT_MISMATCH,
      `${host}: missing per-host artifact identity`,
      {host},
    );
    return;
  }
  if (isPlainObject(artifact) && artifact.status === ARTIFACT_STATUS.NOT_APPLICABLE) {
    if (typeof artifact.reason !== TEXT.TYPE_STRING ||
        stringTrim(artifact.reason).length === ZERO) {
      addProblem(
        problems,
        PROBLEM_CODE.HOST_ARTIFACT_MISMATCH,
        `${host}: not_applicable artifact missing explicit reason`,
        {host},
      );
      return;
    }
  } else {
    if (describeArtifact(artifact) === TEXT.UNAVAILABLE) {
      addProblem(
        problems,
        PROBLEM_CODE.HOST_ARTIFACT_MISMATCH,
        `${host}: missing artifact digest or identifier`,
        {host},
      );
      return;
    }
    const artSha = artifact?.sourceSha || artifact?.buildSha;
    if (artSha && artSha !== claimedSha) {
      addProblem(
        problems,
        PROBLEM_CODE.HOST_ARTIFACT_MISMATCH,
        `${host}: artifact provenance SHA=${artSha} != ${claimedSha}`,
        {host},
      );
      return;
    }
  }
  if (expectedHostProfile?.artifact !== undefined &&
      !artifactMatches(artifact, expectedHostProfile.artifact)) {
    const actualDesc = describeArtifact(artifact);
    const expDesc = describeArtifact(expectedHostProfile.artifact);
    addProblem(
      problems,
      PROBLEM_CODE.HOST_ARTIFACT_MISMATCH,
      `${host}: artifact ${actualDesc} != expected ${expDesc}`,
      {host},
    );
  }
}

function validateManifestFields(manifest, host, expectedHostProfile, claimedSha, problems) {
  if (manifest.sourceSha !== claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.HOST_MANIFEST_SHA_MISMATCH,
      `${host}: manifest sourceSha=${manifest.sourceSha} != ${claimedSha}`,
      {host},
    );
  }
  if (describeRuntime(manifest.runtime) === TEXT.UNAVAILABLE ||
      !subsetMatches(manifest.runtime, expectedHostProfile?.runtime)) {
    addProblem(
      problems,
      PROBLEM_CODE.HOST_RUNTIME_MISMATCH,
      `${host}: runtime ${JSON.stringify(manifest.runtime)} incompatible with ` +
      `${JSON.stringify(expectedHostProfile?.runtime)}`,
      {host},
    );
  }
  if (describeBackend(manifest.backend) === TEXT.UNAVAILABLE ||
      !subsetMatches(manifest.backend, expectedHostProfile?.backend)) {
    addProblem(
      problems,
      PROBLEM_CODE.HOST_BACKEND_MISMATCH,
      `${host}: backend ${JSON.stringify(manifest.backend)} incompatible with ` +
      `${JSON.stringify(expectedHostProfile?.backend)}`,
      {host},
    );
  }
  validateHostArtifactField(manifest, host, expectedHostProfile, claimedSha, problems);
  if (!isPlainObject(manifest.config) ||
      !subsetMatches(manifest.config, expectedHostProfile?.config)) {
    addProblem(
      problems,
      PROBLEM_CODE.HOST_CONFIG_MISMATCH,
      `${host}: config ${JSON.stringify(manifest.config)} incompatible with ` +
      `${JSON.stringify(expectedHostProfile?.config)}`,
      {host},
    );
  }
}

function validatePlacementEnvConfig(participatingHosts, manifestMap, problems) {
  for (const hostEntry of participatingHosts) {
    const manifest = manifestMap.get(hostEntry.host);
    if (!manifest) continue;
    const envMode = hostEntry.placementEnv?.[PLACEMENT_ENV_KEYS.MODE];
    const envRetry = hostEntry.placementEnv?.[PLACEMENT_ENV_KEYS.RETRY];
    if (envMode && manifest.config?.mode && envMode !== manifest.config.mode) {
      addProblem(
        problems,
        PROBLEM_CODE.HOST_CONFIG_MISMATCH,
        `${hostEntry.host}: manifest config.mode=${manifest.config.mode} ` +
        `contradicts placement-env mode=${envMode}`,
        {host: hostEntry.host},
      );
    }
    if (envRetry !== undefined && manifest.config?.retry !== undefined &&
        String(manifest.config.retry) !== String(envRetry)) {
      addProblem(
        problems,
        PROBLEM_CODE.HOST_CONFIG_MISMATCH,
        `${hostEntry.host}: manifest config.retry=${manifest.config.retry} ` +
        `contradicts placement-env retry=${envRetry}`,
        {host: hostEntry.host},
      );
    }
  }
}

function validateHostManifests(
  participatingHosts,
  hostManifests,
  expectedHostProfile,
  claimedSha,
  problems,
) {
  const manifestMap = normalizeHostManifestMap(hostManifests);
  const requiredHosts = new Set(arrayMap(participatingHosts, (entry) => entry.host));
  if (Array.isArray(expectedHostProfile?.requiredHosts)) {
    for (const reqHost of expectedHostProfile.requiredHosts) {
      requiredHosts.add(reqHost);
    }
  }

  for (const host of requiredHosts) {
    const manifest = manifestMap.get(host);
    if (!manifest) {
      addProblem(
        problems,
        PROBLEM_CODE.HOST_MANIFEST_MISSING,
        `missing host runtime/artifact manifest for host ${host}`,
        {host},
      );
      continue;
    }
    validateManifestFields(manifest, host, expectedHostProfile, claimedSha, problems);
  }

  validatePlacementEnvConfig(participatingHosts, manifestMap, problems);
  return manifestMap;
}

function validateTopologyScope(claimKind, topologyScope, problems) {
  const requiresIsolation = claimKind === CLAIM_KIND.CROSS_NODE_CDC_PROPAGATION ||
    claimKind === CLAIM_KIND.MULTI_HOST_FORMATION;
  if (!isPlainObject(topologyScope)) {
    if (requiresIsolation) {
      addProblem(
        problems,
        PROBLEM_CODE.TOPOLOGY_SCOPE_MISSING,
        `claimKind=${claimKind} requires explicit topologyScope`,
      );
    }
    return {
      claimKind: claimKind || TEXT.UNVERIFIED,
      topology: TEXT.UNVERIFIED,
      isolatedNodeCaches: null,
      sharedCache: null,
      nodeCount: null,
    };
  }

  const isolated = topologyScope.isolatedNodeCaches === true;
  const shared = topologyScope.sharedCache === true;
  const nodeCount = Number(topologyScope.nodeCount ?? topologyScope.processCount ?? ZERO);

  if (isolated && shared) {
    addProblem(
      problems,
      PROBLEM_CODE.SHARED_CACHE_SUBSTITUTION_REFUSED,
      MESSAGE.CONTRADICTORY_TOPOLOGY,
    );
  }
  if (requiresIsolation && (shared || !isolated || nodeCount < MIN_ISOLATED_NODES)) {
    addProblem(
      problems,
      PROBLEM_CODE.SHARED_CACHE_SUBSTITUTION_REFUSED,
      `claimKind=${claimKind} refuses shared-cache or single-cache topology ` +
      `(isolatedNodeCaches=${String(isolated)}, sharedCache=${String(shared)}, ` +
      `nodeCount=${nodeCount})`,
    );
  }

  return {
    claimKind: claimKind || TEXT.UNVERIFIED,
    topology: String(topologyScope.topology || TEXT.UNKNOWN),
    isolatedNodeCaches: isolated,
    sharedCache: shared,
    nodeCount,
  };
}

function validateRequiredFilesCoverage(jobs, requiredFiles, requireAllPlannedFiles, problems) {
  const executed = new Map();
  const expectedFiles = new Set(Array.isArray(requiredFiles) ? requiredFiles : []);

  for (const job of jobs) {
    for (const [file, row] of job.executedFiles.entries()) {
      executed.set(file, row);
    }
    if (requireAllPlannedFiles) {
      for (const planned of job.plannedFiles) {
        expectedFiles.add(planned);
      }
    }
  }

  for (const file of expectedFiles) {
    const row = executed.get(file);
    if (!row || row.ok !== true || !(Number(row.assertions) > ZERO)) {
      addProblem(
        problems,
        PROBLEM_CODE.REQUIRED_FILE_MISSING_OR_FAILED,
        `required file missing, failed, or zero assertions: ${file}`,
        {file},
      );
    }
  }
}

function resolveOutcome(problems) {
  if (problems.length === ZERO) return OUTCOME.ADMITTED;
  const isUnavailableProblem = (problem) =>
    problem.code === PROBLEM_CODE.GIT_STATE_UNAVAILABLE ||
    problem.code === PROBLEM_CODE.JOBS_MISSING;
  const onlyUnavailable = arraySome(problems, isUnavailableProblem) &&
    arrayEvery(problems, isUnavailableProblem);
  return onlyUnavailable ? OUTCOME.UNAVAILABLE : OUTCOME.REFUSED;
}

function renderGitSummaryRows(report) {
  const {git} = report;
  return [
    `| ${LABEL.OUTCOME} | \`${report.outcome}\` |`,
    `| ${LABEL.CLAIMED_SHA} | \`${report.claimedSha}\` |`,
    `| ${LABEL.HEAD_REF} | \`${git.headSha}\` (${git.headBranch}) |`,
    `| ${LABEL.TARGET_REF} | \`${git.targetRef}\` -> \`${git.targetRefSha}\` |`,
    `| ${LABEL.REMOTE_STATE} | \`${git.remote}\` \`${git.remoteRef}\`: ` +
    `\`${git.remoteState}\` (${git.remoteSha || TEXT.EMPTY}) |`,
    `| ${LABEL.ORIGIN_MAIN} | \`${git.originMainSha}\` |`,
  ];
}

function renderScopeSummaryRows(topology, totals) {
  return [
    `| ${LABEL.CLAIM_KIND} | \`${topology.claimKind}\` |`,
    `| ${LABEL.TOPOLOGY} | \`${topology.topology}\` nodes=${String(topology.nodeCount)} ` +
    `isolatedNodeCaches=${String(topology.isolatedNodeCaches)} ` +
    `sharedCache=${String(topology.sharedCache)} |`,
    `| ${LABEL.TOTALS} | files=${totals.files} pass=${totals.pass} ` +
    `fail=${totals.fail} assertions=${totals.assertions} |`,
  ];
}

/**
 * Render a factual Markdown summary table strictly from verified report fields.
 * @param {Object} report
 * @return {string}
 */
function renderLabEvidenceMarkdown(report) {
  const lines = [
    REPORT_TITLES.HEADING,
    TEXT.EMPTY,
    REPORT_TITLES.META_HEADER,
    REPORT_TITLES.META_SEP,
    ...renderGitSummaryRows(report),
    ...renderScopeSummaryRows(report.topology, report.totals),
    TEXT.EMPTY,
    REPORT_TITLES.HOSTS_HEADING,
    TEXT.EMPTY,
    REPORT_TITLES.HOSTS_HEADER,
    REPORT_TITLES.HOSTS_SEP,
  ];

  for (const row of report.hostSummary) {
    const resultCell = `${row.pass}/${row.total} (fail=${row.fail}, assertions=${row.assertions})`;
    lines.push(
      `| ${row.job} | \`${row.host}\` | \`${row.placementHead || TEXT.UNAVAILABLE}\` | ` +
      `\`${String(row.placementPid ?? TEXT.UNAVAILABLE)}\` | ` +
      `\`${row.placementEnvRaw || TEXT.UNAVAILABLE}\` | \`${row.runtime}\` | ` +
      `\`${row.backend}\` | \`${row.artifact}\` | ${resultCell} |`,
    );
  }

  if (report.problems.length > ZERO) {
    lines.push(
      TEXT.EMPTY,
      REPORT_TITLES.PROBLEMS_HEADING,
      TEXT.EMPTY,
      REPORT_TITLES.PROBLEMS_HEADER,
      REPORT_TITLES.PROBLEMS_SEP,
    );
    for (const problem of report.problems) {
      lines.push(`| \`${problem.code}\` | ${problem.detail} |`);
    }
  }

  lines.push(TEXT.EMPTY);
  return arrayJoin(lines, TEXT.NEWLINE);
}

function buildHostSummaryRows(participatingHosts, manifestMap) {
  let files = ZERO;
  let pass = ZERO;
  let fail = ZERO;
  let assertions = ZERO;
  const hostSummary = [];

  for (const entry of participatingHosts) {
    const manifest = manifestMap.get(entry.host);
    const passCount = arrayFilter(entry.executedRows, (r) => r?.ok === true).length;
    const failCount = entry.executedRows.length - passCount;
    let assertionSum = ZERO;
    for (const row of entry.executedRows) {
      if (Number.isFinite(row?.assertions)) assertionSum += row.assertions;
    }
    files += entry.executedRows.length;
    pass += passCount;
    fail += failCount;
    assertions += assertionSum;
    hostSummary.push({
      job: entry.job,
      host: entry.host,
      placementHead: entry.placementHead,
      placementPid: entry.placementPid,
      placementEnvRaw: entry.placementEnvRaw,
      runtime: manifest ? describeRuntime(manifest.runtime) : TEXT.UNAVAILABLE,
      backend: manifest ? describeBackend(manifest.backend) : TEXT.UNAVAILABLE,
      artifact: manifest ? describeArtifact(manifest.artifact) : TEXT.UNAVAILABLE,
      total: entry.executedRows.length,
      pass: passCount,
      fail: failCount,
      assertions: assertionSum,
    });
  }

  return {hostSummary, totals: {files, pass, fail, assertions}};
}

/**
 * Inspect original git refs, multi-host lab job records, per-host manifests,
 * and topology scope, returning an admitted or explicitly refused factual report.
 * @param {Object} input
 * @return {Object}
 */
function evaluateLabEvidence(input) {
  const problems = [];
  const repoRoot = input?.repoRoot || process.cwd();
  const claimedSha = stringToLowerCase(stringTrim(String(input?.claimedSha || TEXT.EMPTY)));

  if (!isValidSha(claimedSha)) {
    addProblem(
      problems,
      PROBLEM_CODE.CLAIMED_SHA_INVALID,
      `claimedSha must be a 40-hex commit SHA, got ${String(input?.claimedSha)}`,
    );
  }

  const gitState = inspectGitBranchState({...input, repoRoot, claimedSha}, problems);
  const jobDirs = Array.isArray(input?.jobDirs) ? input.jobDirs : [];
  if (jobDirs.length === ZERO) {
    addProblem(problems, PROBLEM_CODE.JOBS_MISSING, MESSAGE.JOBS_REQUIRED);
  }

  const jobs = [];
  for (const dir of jobDirs) {
    const parsedJob = inspectLabJobDirectory(
      path.isAbsolute(dir) ? dir : path.join(repoRoot, dir),
      {claimedSha, allowRetries: input?.allowRetries === true},
      problems,
    );
    if (parsedJob !== null) jobs.push(parsedJob);
  }

  const participatingHosts = [];
  for (const job of jobs) {
    for (const hostEntry of job.hosts) participatingHosts.push(hostEntry);
  }

  const manifestMap = validateHostManifests(
    participatingHosts,
    input?.hostManifests,
    input?.expectedHostProfile,
    claimedSha,
    problems,
  );

  validateRequiredFilesCoverage(
    jobs,
    input?.requiredFiles,
    input?.requireAllPlannedFiles !== false,
    problems,
  );
  const topology = validateTopologyScope(input?.claimKind, input?.topologyScope, problems);

  if (input?.applicabilityReceipt) {
    const appCheck = validateEvidenceApplicability(repoRoot, input.applicabilityReceipt);
    if (!appCheck.valid) {
      addProblem(
        problems,
        PROBLEM_CODE.APPLICABILITY_REFUSED,
        `evidence applicability check failed: ${appCheck.reason}`,
      );
    }
  }

  if (input?.executionReport) {
    const execCheck = executionReportProblems(input.executionReport, {
      sha: claimedSha,
      requiredFiles: Array.isArray(input?.requiredFiles) ? input.requiredFiles : undefined,
    });
    for (const execProb of execCheck.problems) {
      addProblem(
        problems,
        PROBLEM_CODE.EXECUTION_REPORT_REFUSED,
        `${execProb.code}: ${execProb.detail}`,
      );
    }
  }

  const {hostSummary, totals} = buildHostSummaryRows(participatingHosts, manifestMap);
  const report = {
    schema: LAB_EVIDENCE_SCHEMA,
    outcome: resolveOutcome(problems),
    claimedSha,
    git: gitState,
    topology,
    totals,
    hostSummary,
    problems,
  };
  report.markdown = renderLabEvidenceMarkdown(report);
  return report;
}

function parseCliArgs(argv) {
  const opts = {
    repoRoot: process.cwd(),
    jobDirs: [],
    requiredFiles: [],
    format: FORMAT_MODES.JSON,
    requireRemotePushed: false,
    allowRetries: false,
  };
  for (let i = ZERO; i < argv.length; i += ONE) {
    const arg = argv[i];
    if (arg === CLI_FLAGS.REPO) opts.repoRoot = argv[i += ONE];
    else if (arg === CLI_FLAGS.CLAIMED_SHA) opts.claimedSha = argv[i += ONE];
    else if (arg === CLI_FLAGS.TARGET_REF) opts.targetRef = argv[i += ONE];
    else if (arg === CLI_FLAGS.REMOTE) opts.remote = argv[i += ONE];
    else if (arg === CLI_FLAGS.REMOTE_REF) opts.remoteRef = argv[i += ONE];
    else if (arg === CLI_FLAGS.ORIGIN_MAIN_REF) opts.originMainRef = argv[i += ONE];
    else if (arg === CLI_FLAGS.REQUIRE_REMOTE_PUSHED) opts.requireRemotePushed = true;
    else if (arg === CLI_FLAGS.ALLOW_RETRIES) opts.allowRetries = true;
    else if (arg === CLI_FLAGS.JOB_DIR) opts.jobDirs.push(argv[i += ONE]);
    else if (arg === CLI_FLAGS.HOST_MANIFEST) opts.hostManifestPath = argv[i += ONE];
    else if (arg === CLI_FLAGS.EXPECTED_HOST) opts.expectedHostPath = argv[i += ONE];
    else if (arg === CLI_FLAGS.CLAIM_KIND) opts.claimKind = argv[i += ONE];
    else if (arg === CLI_FLAGS.TOPOLOGY_JSON) opts.topologyPath = argv[i += ONE];
    else if (arg === CLI_FLAGS.REQUIRED_FILES) {
      const val = argv[i += ONE];
      for (const file of stringSplit(val, TEXT.COMMA)) {
        const trimmed = stringTrim(file);
        if (trimmed.length > ZERO) opts.requiredFiles.push(trimmed);
      }
    } else if (arg === CLI_FLAGS.FORMAT) opts.format = argv[i += ONE];
    else if (arg === CLI_FLAGS.OUT) opts.outPath = argv[i += ONE];
  }
  return opts;
}

function loadOptionalJsonFlag(filePath) {
  if (!filePath) return undefined;
  return JSON.parse(fs.readFileSync(filePath, TEXT.UTF8));
}

function runCli(argv) {
  const opts = parseCliArgs(argv);
  const report = evaluateLabEvidence({
    repoRoot: opts.repoRoot,
    claimedSha: opts.claimedSha,
    targetRef: opts.targetRef,
    remote: opts.remote,
    remoteRef: opts.remoteRef,
    originMainRef: opts.originMainRef,
    requireRemotePushed: opts.requireRemotePushed,
    allowRetries: opts.allowRetries,
    jobDirs: opts.jobDirs,
    hostManifests: loadOptionalJsonFlag(opts.hostManifestPath),
    expectedHostProfile: loadOptionalJsonFlag(opts.expectedHostPath),
    claimKind: opts.claimKind,
    topologyScope: loadOptionalJsonFlag(opts.topologyPath),
    requiredFiles: opts.requiredFiles.length > ZERO ? opts.requiredFiles : undefined,
  });

  const output = opts.format === FORMAT_MODES.MARKDOWN ?
    report.markdown : JSON.stringify(report, null, TWO) + TEXT.NEWLINE;
  if (opts.outPath) {
    fs.mkdirSync(path.dirname(opts.outPath), {recursive: true});
    fs.writeFileSync(opts.outPath, output, TEXT.UTF8);
  } else {
    process.stdout.write(output);
  }

  if (report.outcome === OUTCOME.ADMITTED) return EXIT_ADMITTED;
  return report.outcome === OUTCOME.UNAVAILABLE ? EXIT_USAGE_OR_UNAVAILABLE : EXIT_REFUSED;
}

if (process.argv[ONE] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCli(process.argv.slice(TWO));
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}${TEXT.NEWLINE}`);
    process.exitCode = EXIT_USAGE_OR_UNAVAILABLE;
  }
}

export {
  ARTIFACT_STATUS,
  CLAIM_KIND,
  LAB_EVIDENCE_SCHEMA,
  OUTCOME,
  PROBLEM_CODE,
  REMOTE_STATE,
  evaluateLabEvidence,
  renderLabEvidenceMarkdown,
};
