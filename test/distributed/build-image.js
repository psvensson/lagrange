/**
 * Docker image build orchestration for the distributed runner: build (or
 * reuse) the cluster image, labelled with the current git hash so unchanged
 * commits skip the rebuild. Extracted from run.js to keep that file under the
 * test-file size ratchet; behavior and signature are identical, just
 * relocated. The git helpers and progress-line extractor live here too so the
 * module is self-contained (run.js re-exports them for its existing callers).
 */

import {execFile} from 'node:child_process';
import {DockerProvider} from './harness/docker-provider.js';

const BUILD_PROGRESS_LOG_PREFIX = 'docker-build: ';
const DOCKER_LINE_EMPTY = '';
const GIT_HASH_COMMAND = 'git';
const GIT_HASH_ARGS = Object.freeze(['rev-parse', '--short=12', 'HEAD']);
const GIT_STATUS_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--porcelain']);
const GIT_HASH_FALLBACK = 'unknown';
const IMAGE_LABEL_GIT_HASH = 'ddb.git-hash';
const IMAGE_REUSE_LOG_PREFIX = 'Reusing Docker image for commit ';
const IMAGE_REBUILD_DIRTY_PREFIX =
  'Detected uncommitted workspace changes; rebuilding image: ';
const IMAGE_BUILD_LOG_PREFIX = 'Building Docker image';
const IMAGE_BUILD_LOG_SUFFIX = '...';
const IMAGE_BUILD_WITH_COMMIT_PREFIX = ' for commit ';
const IMAGE_SKIP_DIRTY_REBUILD_PREFIX =
  'Skipping dirty-workspace rebuild in fast-local mode: ';
const IMAGE_SKIP_DIRTY_REBUILD_MISSING_SUFFIX =
  ' (image missing, rebuilding once)';
const IMAGE_BUILT_LOG_PREFIX = 'Image built: ';
const DEFAULT_DOCKERFILE = 'Dockerfile';
const BUILD_CONTEXT_PATH = '.';
const IMAGE_REUSE_SEPARATOR = ': ';
const NEWLINE = '\n';
const BUILD_PROGRESS_ID_KEY = 'id';
const BUILD_PROGRESS_STATUS_KEY = 'status';
const BUILD_PROGRESS_STREAM_KEY = 'stream';
const BUILD_PROGRESS_PROGRESS_KEY = 'progress';
const BUILD_PROGRESS_ERROR_KEY = 'error';
/**
 * Resolve current git short hash.
 * @param {string} cwd
 * @return {Promise<string>}
 */
async function resolveGitHash(cwd = process.cwd()) {
  return new Promise((resolveHash) => {
    execFile(GIT_HASH_COMMAND, GIT_HASH_ARGS, {cwd}, (error, stdout) => {
      if (error) {
        resolveHash(GIT_HASH_FALLBACK);
        return;
      }
      const hash = String(stdout || DOCKER_LINE_EMPTY).trim();
      resolveHash(hash || GIT_HASH_FALLBACK);
    });
  });
}

/**
 * Resolve whether the current git workspace has uncommitted changes.
 * @param {string} cwd
 * @return {Promise<boolean>}
 */
async function resolveGitDirty(cwd = process.cwd()) {
  return new Promise((resolveDirty) => {
    execFile(GIT_STATUS_COMMAND, GIT_STATUS_ARGS, {cwd}, (error, stdout) => {
      if (error) {
        resolveDirty(false);
        return;
      }
      resolveDirty(String(stdout || DOCKER_LINE_EMPTY).trim().length > 0);
    });
  });
}

// Extract a single human-readable progress line from a docker build event,
// or null when the event carries nothing worth printing.
function defaultExtractBuildProgressLine(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }
  if (typeof event[BUILD_PROGRESS_STREAM_KEY] === 'string' &&
      event[BUILD_PROGRESS_STREAM_KEY].trim().length > 0) {
    return event[BUILD_PROGRESS_STREAM_KEY].trim();
  }
  if (typeof event[BUILD_PROGRESS_ERROR_KEY] === 'string' &&
      event[BUILD_PROGRESS_ERROR_KEY].trim().length > 0) {
    return event[BUILD_PROGRESS_ERROR_KEY].trim();
  }
  const id = event[BUILD_PROGRESS_ID_KEY];
  const status = event[BUILD_PROGRESS_STATUS_KEY];
  const progress = event[BUILD_PROGRESS_PROGRESS_KEY];
  if (status) {
    return [id, status, progress].filter(Boolean).join(' ');
  }
  return null;
}

/**
 * Build the Docker image before running scenarios. Signature preserved from
 * run.js: (config, verbose, dockerOperationSink, options).
 *
 * @param {Object} config - Parsed cluster configuration
 * @param {boolean} verbose
 * @param {Function|null} dockerOperationSink
 * @param {Object} [options]
 * @param {string} [options.gitHash]
 * @param {boolean} [options.gitDirty]
 * @param {Function} [options.extractBuildProgressLine]
 */
async function buildImage(
  config,
  verbose,
  dockerOperationSink = null,
  options = {},
) {
  const extractBuildProgressLine =
    typeof options.extractBuildProgressLine === 'function' ?
      options.extractBuildProgressLine :
      defaultExtractBuildProgressLine;
  const provider = new DockerProvider({
    socketPath: config.docker.socketPath,
    operationSink: dockerOperationSink,
  });

  const gitHash = options.gitHash || await resolveGitHash();
  const gitDirty = typeof options.gitDirty === 'boolean' ?
    options.gitDirty :
    await resolveGitDirty();
  const skipBuildOnDirty = config?.docker?.skipBuildOnDirty === true;
  const existingHash = await provider.getImageLabel(
    config.image,
    IMAGE_LABEL_GIT_HASH,
  );

  if (gitDirty && skipBuildOnDirty) {
    const imageExists = await provider.imageExists(config.image);
    if (imageExists) {
      if (verbose) {
        process.stdout.write(
          IMAGE_SKIP_DIRTY_REBUILD_PREFIX + config.image + NEWLINE,
        );
      }
      return {image: config.image, gitHash, gitDirty, reused: true};
    }
    if (verbose) {
      process.stdout.write(
        IMAGE_SKIP_DIRTY_REBUILD_PREFIX +
        config.image +
        IMAGE_SKIP_DIRTY_REBUILD_MISSING_SUFFIX +
        NEWLINE,
      );
    }
  }

  if (!gitDirty &&
      existingHash === gitHash &&
      gitHash !== GIT_HASH_FALLBACK) {
    if (verbose) {
      process.stdout.write(
        IMAGE_REUSE_LOG_PREFIX +
        gitHash +
        IMAGE_REUSE_SEPARATOR +
        config.image +
        NEWLINE,
      );
    }
    return {image: config.image, gitHash, gitDirty, reused: true};
  }

  if (verbose) {
    if (gitDirty) {
      process.stdout.write(
        IMAGE_REBUILD_DIRTY_PREFIX + config.image + NEWLINE,
      );
    }
    const commitSuffix = gitHash && gitHash !== GIT_HASH_FALLBACK ?
      IMAGE_BUILD_WITH_COMMIT_PREFIX + gitHash :
      DOCKER_LINE_EMPTY;
    process.stdout.write(
      IMAGE_BUILD_LOG_PREFIX + commitSuffix + IMAGE_BUILD_LOG_SUFFIX + NEWLINE,
    );
  }
  const progressSink = verbose ?
    (event) => {
      const line = extractBuildProgressLine(event);
      if (!line) {
        return;
      }
      process.stdout.write(BUILD_PROGRESS_LOG_PREFIX + line + NEWLINE);
    } :
    null;
  await provider.buildImage(
    BUILD_CONTEXT_PATH,
    config.image,
    config.dockerfile || DEFAULT_DOCKERFILE,
    progressSink,
    {[IMAGE_LABEL_GIT_HASH]: gitHash},
  );
  if (verbose) {
    process.stdout.write(IMAGE_BUILT_LOG_PREFIX + config.image + NEWLINE);
  }

  return {image: config.image, gitHash, gitDirty, reused: false};
}

export {
  buildImage,
  resolveGitDirty,
};
