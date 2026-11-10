#!/usr/bin/env node
// Retain real command/client output. This producer never manufactures outcomes.
import fs from 'node:fs';
import path from 'node:path';
import {headSha} from '../solve/guards.js';
import {configurationIdentity, sourceDigests} from '../agent-tooling/evidence.js';
import {loadProfile, projectRoot, sha256} from '../agent-tooling/profile.js';
import {refuseProbe, requireSuccess, run} from '../agent-tooling/process.js';
import {createOwnedDirectory, ownedPath} from '../agent-tooling/paths.js';
import {OBSERVATION_KIND, OBSERVATION_PHASE, OBSERVATION_SCHEMA} from '../agent-tooling/evidence-contract.js';
import {TOOLING_EXECUTABLE} from '../agent-tooling/host-protocol.js';

const COMMAND_SEPARATOR = '--';
const LINE_SEPARATOR = '\n';
const USAGE = 'usage: quest-agent-tooling.js <id> <phase> -- <command> [args]';
const DUPLICATE_OBSERVATION = 'observation exists; retain it and choose a new attempt id';
const REFUSAL = Object.freeze({
  HOST_VERSION_MISMATCH: 'tooling_host_version_mismatch',
});


const MAX_CAPTURE_MS = 15 * 60 * 1000;
const OUTPUT_ROOT = 'test-output/agent-tooling/observations';

try {
  refuseProbe();
  const [id, phase, separator, command, ...args] = process.argv.slice(2);
  if (!/^[a-z0-9][a-z0-9-]+$/u.test(id) || separator !== COMMAND_SEPARATOR || !command ||
    ![OBSERVATION_PHASE.BASELINE, OBSERVATION_PHASE.CANDIDATE, OBSERVATION_PHASE.CONTROL,
      OBSERVATION_PHASE.AUTHORING, OBSERVATION_PHASE.LANDING].includes(phase)) {
    throw new Error(USAGE);
  }
  const root = projectRoot(process.cwd());
  const output = ownedPath(root, `${OUTPUT_ROOT}/${id}.json`);
  if (fs.existsSync(output)) throw new Error(DUPLICATE_OBSERVATION);
  const {profile, digest} = loadProfile(root);
  const host = requireSuccess(run(root, TOOLING_EXECUTABLE.CODEX, ['--version']));
  if (host !== `${profile.host.name} ${profile.host.version}`) {
    throw new Error(REFUSAL.HOST_VERSION_MISMATCH);
  }
  const source = {root, commit: headSha(root), files: sourceDigests(root)};
  const configuration = configurationIdentity(root, profile);
  const sourceContents = [OBSERVATION_PHASE.BASELINE, OBSERVATION_PHASE.AUTHORING].includes(
    phase) ? Object.fromEntries(
      Object.keys(source.files).map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')])) : null;
  createOwnedDirectory(root, OUTPUT_ROOT);
  // Reserve the unique attempt before running it. An interrupted empty file is
  // explicitly non-admissible, and another capture cannot overwrite its history.
  const fd = fs.openSync(output, 'wx', 0o600);
  const observation = run(root, command, args, {timeout: MAX_CAPTURE_MS,
    input: '', env: {...process.env}});
  const identityErrors = [];
  const inspectAfter = (label, inspect) => {
    try {
      return inspect();
    } catch (error) {
      identityErrors.push({label, error: error.message});
      return null;
    }
  };
  const sourceAfter = inspectAfter('source', () =>
    ({root, commit: headSha(root), files: sourceDigests(root)}));
  const configurationAfter = inspectAfter('configuration', () => configurationIdentity(root, profile));
  const sourceContentsAfter = phase === OBSERVATION_PHASE.AUTHORING && sourceAfter !== null ?
    inspectAfter('source contents', () => Object.fromEntries(Object.keys(sourceAfter.files)
      .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]))) : null;
  const record = {schema: OBSERVATION_SCHEMA, id, phase,
    kind: path.basename(command) === TOOLING_EXECUTABLE.CODEX ?
      OBSERVATION_KIND.CODEX : OBSERVATION_KIND.COMMAND,
    ...observation, host: profile.host, profileDigest: digest, source,
    sourceContents, sourceContentsAfter, configuration, identityErrors,
    configurationAfter, sourceAfter,
    changedFiles: sourceAfter === null ? null :
      [...new Set([...Object.keys(source.files), ...Object.keys(sourceAfter.files)])]
        .filter((file) => source.files[file] !== sourceAfter.files[file]),
    stdoutSha256: sha256(observation.stdout === null ? '' : observation.stdout),
    stderrSha256: sha256(observation.stderr === null ? '' : observation.stderr)};
  fs.writeFileSync(fd, JSON.stringify(record, null, 2) + LINE_SEPARATOR);
  fs.closeSync(fd);
  console.log(JSON.stringify({output: path.relative(root, output), id,
    exitCode: record.exitCode, signal: record.signal, error: record.error,
    startedAt: record.startedAt, endedAt: record.endedAt}));
  process.exitCode = record.exitCode === 0 && record.error === null &&
    identityErrors.length === 0 ? 0 : 1;
} catch (error) {
  console.error(`tooling_observation_unavailable: ${error.message}`);
  process.exitCode = 1;
}
