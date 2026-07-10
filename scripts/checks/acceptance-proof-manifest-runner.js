import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ACCEPTANCE_MANIFEST_SCHEMA_VERSION,
  ACCEPTANCE_PROOF,
  DEFAULT_ACCEPTANCE_MANIFEST,
} from './acceptance-proof-manifest-constants.js';

export {
  ACCEPTANCE_MANIFEST_SCHEMA_VERSION,
  DEFAULT_ACCEPTANCE_MANIFEST,
};

const CAPTURED_OUTPUT = 'captured-output';
const EXTERNAL_ARTIFACT = 'external';
const ARTIFACT_MODES = Object.freeze([CAPTURED_OUTPUT, EXTERNAL_ARTIFACT]);
const FORBIDDEN_SHELL_EXECUTABLES = Object.freeze([
  'bash',
  'cmd',
  'cmd.exe',
  'dash',
  'fish',
  'ksh',
  'powershell',
  'pwsh',
  'sh',
  'zsh',
]);
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const NO_COMMAND_FAILURE_REASONS = Object.freeze([]);
const ARTIFACT_NOT_PRODUCED_PREFIX =
  'required artifact is stale or was not produced or updated: ';

function sha256(value) {
  return createHash(ACCEPTANCE_PROOF.HASH_ALGORITHM)
    .update(value)
    .digest(ACCEPTANCE_PROOF.HASH_ENCODING);
}

function rootRelativePath(root, value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const absolute = path.isAbsolute(value) ? path.normalize(value) : path.resolve(root, value);
  const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
  if (!relative || relative.startsWith(ACCEPTANCE_PROOF.PARENT_SEGMENT) ||
    path.isAbsolute(relative)) return null;
  return {absolute, relative};
}

function validEnvironmentContract(environment) {
  if (!environment || typeof environment !== 'object' ||
    Array.isArray(environment)) {
    return false;
  }
  if (typeof environment.inherit !== 'boolean') return false;
  if (!environment.set || typeof environment.set !== 'object' ||
    Array.isArray(environment.set)) {
    return false;
  }
  return Object.entries(environment.set).every(([key, value]) =>
    /^[A-Z_][A-Z0-9_]*$/u.test(key) && typeof value === 'string');
}

function validateCommand(command, index, seenIds, seenArtifacts) {
  const label = `commands[${index}]`;
  const problems = [];
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    return [`${label} must be an object`];
  }
  if (typeof command.id !== 'string' || command.id.length === 0) {
    problems.push(`${label}.id must be a non-empty string`);
  } else if (seenIds.has(command.id)) {
    problems.push(`${label}.id is duplicated: ${command.id}`);
  } else {
    seenIds.add(command.id);
  }
  if (command.skip === true || command.enabled === false ||
    command.status === ACCEPTANCE_PROOF.SKIPPED_STATUS) {
    problems.push(`${label} must not be skipped or disabled`);
  }
  if (Object.hasOwn(command, ACCEPTANCE_PROOF.COMMAND_FIELD) ||
    Object.hasOwn(command, ACCEPTANCE_PROOF.SHELL_FIELD)) {
    problems.push(`${label} must use executable + argv, not a shell string`);
  }
  if (typeof command.executable !== 'string' || command.executable.length === 0) {
    problems.push(`${label}.executable must be a non-empty string`);
  } else if (FORBIDDEN_SHELL_EXECUTABLES.includes(
    path.basename(command.executable).toLowerCase(),
  )) {
    problems.push(`${label}.executable must not be a shell interpreter`);
  }
  if (!Array.isArray(command.argv) ||
    !command.argv.every((value) => typeof value === 'string')) {
    problems.push(`${label}.argv must be an array of strings`);
  }
  if (!Number.isInteger(command.timeoutMs) || command.timeoutMs <= 0 ||
    command.timeoutMs > MAX_TIMEOUT_MS) {
    problems.push(`${label}.timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}`);
  }
  if (!Array.isArray(command.acceptableExitCodes) ||
    command.acceptableExitCodes.length === 0 ||
    !command.acceptableExitCodes.every((value) =>
      Number.isInteger(value) && value >= 0 &&
        value <= ACCEPTANCE_PROOF.MAX_EXIT_CODE)) {
    problems.push(`${label}.acceptableExitCodes must contain exit codes from 0 to 255`);
  }
  const artifact = command.requiredArtifact;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    problems.push(`${label}.requiredArtifact must be an object`);
  } else {
    if (!ARTIFACT_MODES.includes(artifact.mode)) {
      problems.push(`${label}.requiredArtifact.mode is invalid`);
    }
    if (typeof artifact.path !== 'string' || artifact.path.length === 0 ||
      path.isAbsolute(artifact.path) ||
      artifact.path.split(/[\\/]/u).includes(ACCEPTANCE_PROOF.PARENT_SEGMENT)) {
      problems.push(`${label}.requiredArtifact.path must stay inside the workspace`);
    } else if (seenArtifacts.has(artifact.path)) {
      problems.push(`${label}.requiredArtifact.path is duplicated: ${artifact.path}`);
    } else {
      seenArtifacts.add(artifact.path);
    }
  }
  return problems;
}

export function validateAcceptanceManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [ACCEPTANCE_PROOF.MANIFEST_OBJECT_REQUIRED];
  }
  if (manifest.schemaVersion !== ACCEPTANCE_MANIFEST_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${ACCEPTANCE_MANIFEST_SCHEMA_VERSION}`,
    );
  }
  if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
    problems.push(ACCEPTANCE_PROOF.MANIFEST_ID_REQUIRED);
  }
  if (!validEnvironmentContract(manifest.environment)) {
    problems.push(ACCEPTANCE_PROOF.ENVIRONMENT_CONTRACT_REQUIRED);
  }
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) {
    problems.push(ACCEPTANCE_PROOF.COMMANDS_REQUIRED);
    return problems;
  }
  const seenIds = new Set();
  const seenArtifacts = new Set();
  manifest.commands.forEach((command, index) => {
    problems.push(...validateCommand(command, index, seenIds, seenArtifacts));
  });
  return problems;
}

export function acceptanceArtifactIdentity(root, artifactPath) {
  const resolved = rootRelativePath(root, artifactPath);
  if (!resolved || !fs.existsSync(resolved.absolute) ||
    !fs.statSync(resolved.absolute).isFile()) {
    return {
      path: artifactPath || null,
      exists: false,
      size: null,
      mtimeMs: null,
      sha256: null,
    };
  }
  const content = fs.readFileSync(resolved.absolute);
  const stat = fs.statSync(resolved.absolute);
  return {
    path: resolved.relative,
    exists: true,
    size: content.length,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(content),
  };
}

function commandEnvironment(manifestEnvironment) {
  const base = manifestEnvironment.inherit ? {...process.env} : {};
  return {...base, ...manifestEnvironment.set};
}

function defaultExecute(command, options) {
  return spawnSync(command.executable, command.argv, {
    cwd: options.root,
    env: options.env,
    encoding: ACCEPTANCE_PROOF.TEXT_ENCODING,
    timeout: command.timeoutMs,
    maxBuffer: MAX_BUFFER_BYTES,
  });
}

function captureCommandOutput(root, command, execution, startedAt) {
  const resolved = rootRelativePath(root, command.requiredArtifact.path);
  if (!resolved) return;
  fs.mkdirSync(path.dirname(resolved.absolute), {recursive: true});
  fs.writeFileSync(resolved.absolute, JSON.stringify({
    schemaVersion: 1,
    commandId: command.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    executable: command.executable,
    argv: command.argv,
    exitCode: Number.isInteger(execution.status) ? execution.status : null,
    signal: execution.signal || null,
    error: execution.error ? {
      code: execution.error.code || null,
      message: execution.error.message || String(execution.error),
    } : null,
    stdout: execution.stdout || '',
    stderr: execution.stderr || '',
  }, null, 2));
}

function manifestSnapshot(root, manifestPath) {
  const resolved = rootRelativePath(root, manifestPath);
  if (!resolved || !fs.existsSync(resolved.absolute)) {
    return {
      resolved,
      content: null,
      sha256: null,
      manifest: null,
      error: ACCEPTANCE_PROOF.MISSING_ERROR,
    };
  }
  try {
    const content = fs.readFileSync(resolved.absolute);
    return {
      resolved,
      content,
      sha256: sha256(content),
      manifest: JSON.parse(content.toString(ACCEPTANCE_PROOF.TEXT_ENCODING)),
      error: null,
    };
  } catch (error) {
    return {
      resolved,
      content: null,
      sha256: null,
      manifest: null,
      error: error.message,
    };
  }
}

function artifactIdentityChanged(before, after) {
  if (!after.exists) return false;
  if (!before.exists) return true;
  return before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.sha256 !== after.sha256;
}

function commandFailureReasons(command, execution, beforeIdentity, identity) {
  const reasons = Array.from(NO_COMMAND_FAILURE_REASONS);
  if (execution.error?.code === ACCEPTANCE_PROOF.TIMEOUT_ERROR_CODE ||
    execution.signal === ACCEPTANCE_PROOF.TERMINATION_SIGNAL) {
    reasons.push(`timed out after ${command.timeoutMs}ms`);
  } else if (execution.error) {
    reasons.push(`execution failed: ${execution.error.message}`);
  }
  if (!command.acceptableExitCodes.includes(execution.status)) {
    reasons.push(`exit status ${execution.status} is not acceptable`);
  }
  if (!identity.exists) {
    reasons.push(`required artifact is missing: ${command.requiredArtifact.path}`);
  } else if (!artifactIdentityChanged(beforeIdentity, identity)) {
    reasons.push(ARTIFACT_NOT_PRODUCED_PREFIX + command.requiredArtifact.path);
  }
  return reasons;
}

function executeManifestCommand({
  root,
  manifestPath,
  manifestSha256,
  command,
  env,
  execute,
}) {
  const artifactPath = rootRelativePath(root, command.requiredArtifact.path);
  const beforeIdentity = acceptanceArtifactIdentity(
    root,
    command.requiredArtifact.path,
  );
  if (command.requiredArtifact.mode === CAPTURED_OUTPUT && artifactPath) {
    fs.rmSync(artifactPath.absolute, {force: true});
  }
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let execution;
  try {
    execution = execute(command, {root, env});
  } catch (error) {
    execution = {status: null, signal: null, stdout: '', stderr: '', error};
  }
  if (command.requiredArtifact.mode === CAPTURED_OUTPUT) {
    try {
      captureCommandOutput(root, command, execution, startedAt);
    } catch (error) {
      execution = {...execution, error: execution.error || error};
    }
  }
  const identity = acceptanceArtifactIdentity(root, command.requiredArtifact.path);
  const reasons = commandFailureReasons(
    command,
    execution,
    beforeIdentity,
    identity,
  );
  if (manifestSnapshot(root, manifestPath).sha256 !== manifestSha256) {
    reasons.push(ACCEPTANCE_PROOF.MANIFEST_DRIFT_REASON);
  }
  const passed = reasons.length === 0;
  return {
    id: command.id,
    status: passed ? ACCEPTANCE_PROOF.STATUS_PASS : ACCEPTANCE_PROOF.STATUS_FAIL,
    executable: command.executable,
    argv: command.argv,
    timeoutMs: command.timeoutMs,
    exitCode: Number.isInteger(execution.status) ? execution.status : null,
    signal: execution.signal || null,
    startedAt,
    finishedAt: new Date().toISOString(),
    reasons,
    artifactBeforeIdentity: beforeIdentity,
    artifactIdentity: identity,
  };
}

function notRunCommand(command) {
  return {
    id: command.id,
    status: ACCEPTANCE_PROOF.STATUS_NOT_RUN,
    reasons: [ACCEPTANCE_PROOF.PRIOR_COMMAND_FAILED],
    artifactIdentity: null,
  };
}

function commandSummary(commands) {
  return {
    total: commands.length,
    passed: commands.filter((command) =>
      command.status === ACCEPTANCE_PROOF.STATUS_PASS).length,
    failed: commands.filter((command) =>
      command.status === ACCEPTANCE_PROOF.STATUS_FAIL).length,
    notRun: commands.filter((command) =>
      command.status === ACCEPTANCE_PROOF.STATUS_NOT_RUN).length,
  };
}

export function runAcceptanceManifest(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const manifestPath = options.manifestPath || DEFAULT_ACCEPTANCE_MANIFEST;
  const initial = manifestSnapshot(root, manifestPath);
  const validationProblems = initial.manifest ?
    validateAcceptanceManifest(initial.manifest) :
    [`manifest cannot be read: ${initial.error || manifestPath}`];
  const timestamp = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    timestamp,
    manifest: {
      id: initial.manifest?.id || null,
      path: initial.resolved?.relative || manifestPath,
      sha256: initial.sha256,
      schemaVersion: initial.manifest?.schemaVersion || null,
    },
    validationProblems,
    environment: initial.manifest?.environment || null,
    commands: [],
    summary: {total: 0, passed: 0, failed: 0, notRun: 0},
    passed: false,
  };
  if (validationProblems.length > 0) return report;

  const execute = options.execute || defaultExecute;
  const env = commandEnvironment(initial.manifest.environment);
  let stopped = false;
  for (const command of initial.manifest.commands) {
    if (stopped) {
      report.commands.push(notRunCommand(command));
      continue;
    }
    const result = executeManifestCommand({
      root,
      manifestPath,
      manifestSha256: initial.sha256,
      command,
      env,
      execute,
    });
    report.commands.push(result);
    stopped = result.status !== ACCEPTANCE_PROOF.STATUS_PASS;
  }
  report.summary = commandSummary(report.commands);
  report.passed = report.summary.total > 0 &&
    report.summary.passed === report.summary.total;
  return report;
}

export function writeAcceptanceReport(root, report, directory, prefix) {
  const absoluteDir = path.resolve(root, directory);
  fs.mkdirSync(absoluteDir, {recursive: true});
  const stamp = report.timestamp.replace(/[:.]/gu, '-');
  const file = path.join(absoluteDir, `${prefix}-${stamp}.report.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return path.relative(root, file)
    .replaceAll(path.sep, ACCEPTANCE_PROOF.PATH_SEPARATOR);
}
