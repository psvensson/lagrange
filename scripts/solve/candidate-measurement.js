import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {candidateContentIdentity} from './candidate-content-identity.js';
import {
  inspectChangeArtifact,
  isVerificationBookkeeping,
  parseCommitChangeRef,
} from './change-artifact.js';

const SNAPSHOT_PREFIX = 'lagrange-solver-measurement-';
const TEXT_ENCODING = 'utf8';
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function run(root, args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? TEXT_ENCODING,
    input: options.input,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
}

function reviewedPaths(inspection, questId) {
  return (inspection?.changedPaths || [])
    .filter((filePath) => !isVerificationBookkeeping(filePath, questId))
    .sort();
}

function commitMeasurementIdentity(root, quest, attempt, inspection) {
  const commitRef = parseCommitChangeRef(attempt.event.changeRef);
  if (!commitRef) return null;
  const paths = reviewedPaths(inspection, quest.id);
  const identity = candidateContentIdentity(root, paths, {commit: commitRef.head});
  return {paths, identity};
}

function diffMeasurementIdentity(root, quest, attempt, inspection) {
  const baseCommit = attempt.event.workspaceBaseCommit;
  if (!/^[0-9a-f]{40}$/u.test(String(baseCommit || ''))) {
    return {paths: [], identity: {ok: false, fingerprint: null,
      problem: 'measurement candidate has no full base commit SHA'}};
  }
  const paths = reviewedPaths(inspection, quest.id);
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), SNAPSHOT_PREFIX));
  fs.rmSync(snapshot, {recursive: true, force: true});
  const added = run(root, ['worktree', 'add', '--detach', snapshot, baseCommit]);
  if (added.status !== 0) {
    return {paths, identity: {ok: false, fingerprint: null,
      problem: `measurement candidate worktree failed: ${String(added.stderr || '').trim()}`}};
  }
  try {
    const applied = run(snapshot,
      ['apply', '--binary', '--whitespace=nowarn', '-'],
      {input: inspection.content || ''});
    if (applied.status !== 0) {
      return {paths, identity: {ok: false, fingerprint: null,
        problem: `measurement candidate patch failed: ${String(applied.stderr || '').trim()}`}};
    }
    return {paths, identity: candidateContentIdentity(snapshot, paths)};
  } finally {
    run(root, ['worktree', 'remove', '--force', snapshot]);
    fs.rmSync(snapshot, {recursive: true, force: true});
  }
}

export function candidateMeasurementIdentity(root, quest, attempt) {
  const inspection = attempt?.inspection ||
    inspectChangeArtifact(root, quest, attempt?.event?.changeRef);
  if (!inspection?.valid) {
    return {
      ok: false,
      fingerprint: null,
      paths: [],
      problem: (inspection?.problems || ['unreadable change artifact']).join('; '),
    };
  }
  const projected = parseCommitChangeRef(attempt.event.changeRef) ?
    commitMeasurementIdentity(root, quest, attempt, inspection) :
    diffMeasurementIdentity(root, quest, attempt, inspection);
  return {
    ...projected.identity,
    paths: projected.paths,
  };
}

export function projectCandidateMeasurements(root, quest, attempts = []) {
  const measurements = attempts.map((attempt) => {
    const identity = candidateMeasurementIdentity(root, quest, attempt);
    return {
      attemptIndex: attempt.index,
      frontier: attempt.event.frontier || null,
      evidenceFingerprint: attempt.event.evidenceFingerprint || null,
      sourceFingerprint: identity.fingerprint,
      sourceIdentityOk: identity.ok,
      sourcePaths: identity.paths,
      sourceIdentityProblem: identity.problem || null,
    };
  });
  const versions = [];
  const byFingerprint = new Map();
  for (const measurement of measurements) {
    const fingerprint = measurement.sourceFingerprint;
    if (!fingerprint) continue;
    let version = byFingerprint.get(fingerprint);
    if (!version) {
      version = {
        sourceFingerprint: fingerprint,
        sourcePaths: measurement.sourcePaths,
        measurementAttemptIndexes: [],
      };
      byFingerprint.set(fingerprint, version);
      versions.push(version);
    }
    version.measurementAttemptIndexes.push(measurement.attemptIndex);
  }
  return {
    schemaVersion: 1,
    measurements,
    sourceVersions: versions,
  };
}
