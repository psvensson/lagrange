import {createHash, randomUUID} from 'node:crypto';
import {constants as FILE_OPEN_FLAG} from 'node:fs';
import {
  chmod,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {validateExternalServiceManifest} from
  '../service/external-service-manifest.js';

const BUILD_CONTEXT_HASH_DOMAIN = 'lagrange.service.context.v1\0';
const DOCKERFILE_NAME = 'Dockerfile';
const DOCKERIGNORE_NAME = '.dockerignore';
const FINAL_MANIFEST_NAME = 'lagrange-service.json';
const MANIFEST_TEMPLATE_NAME = 'lagrange-service.template.json';
const SNAPSHOT_DIRECTORY_PREFIX = 'lagrange-service-context-';
const SOURCE_SNAPSHOT_DIRECTORY = 'source';
const SNAPSHOT_CONTEXT_DIRECTORY = 'context';
const TEXT_ENCODING = 'utf8';
const TEXT_NEWLINE = '\n';
const SHA256_PREFIX = 'sha256:';
const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o700;
const MAXIMUM_CONTEXT_FILES = 10_000;
const MAXIMUM_CONTEXT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_INPUT_BYTES = 4 * 1024 * 1024;
const MAXIMUM_PATH_BYTES = 4_096;
const MAXIMUM_RECURSION_DEPTH = 64;
const GLOB_META_PATTERN = /[*?[\]{}\\]/u;
const FILE_SYSTEM_ERROR_CODE = Object.freeze({
  ALREADY_EXISTS: 'EEXIST',
  NOT_FOUND: 'ENOENT',
});

class ServiceProjectBuildInputError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'ServiceProjectBuildInputError';
    this.code = code;
  }
}

function inputFailure(code, message, cause) {
  throw new ServiceProjectBuildInputError(code, message, {cause});
}

function uint64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function normalizedRelativePath(value) {
  return value.split(path.sep).join('/');
}

function projectIdentity(projectStat) {
  return Object.freeze({device: projectStat.dev, inode: projectStat.ino});
}

function sameProjectIdentity(left, right) {
  return left.device === right.device && left.inode === right.inode;
}

async function requirePinnedProjectIdentity(templateInput) {
  let observedStat;
  try {
    observedStat = await lstat(templateInput.projectPath, {bigint: true});
  } catch (error) {
    inputFailure('project_identity_changed',
      'service project identity changed during dev-install', error);
  }
  const observed = projectIdentity(observedStat);
  if (!observedStat.isDirectory() || observedStat.isSymbolicLink() ||
      !sameProjectIdentity(observed, templateInput.projectIdentity)) {
    inputFailure('project_identity_changed',
      'service project identity changed during dev-install');
  }
}

async function ordinaryFileBytes(filePath, maximumBytes = MAXIMUM_INPUT_BYTES) {
  let fileHandle;
  try {
    fileHandle = await open(
      filePath,
      FILE_OPEN_FLAG.O_RDONLY | FILE_OPEN_FLAG.O_NOFOLLOW,
    );
  } catch (error) {
    inputFailure('input_unreadable', `input file is not readable: ${filePath}`, error);
  }
  try {
    const fileStat = await fileHandle.stat();
    if (!fileStat.isFile() || fileStat.nlink !== 1 ||
        fileStat.size > maximumBytes) {
      inputFailure('input_invalid',
        `input must be a bounded ordinary file: ${filePath}`);
    }
    return await fileHandle.readFile();
  } catch (error) {
    if (error instanceof ServiceProjectBuildInputError) throw error;
    inputFailure('input_unreadable', `input file is not readable: ${filePath}`, error);
  } finally {
    await fileHandle.close();
  }
}

function parseJson(bytes, filePath) {
  try {
    return JSON.parse(bytes.toString(TEXT_ENCODING));
  } catch (error) {
    inputFailure('json_invalid', `input must contain valid JSON: ${filePath}`, error);
  }
}

async function readBoundedJsonFile(filePath) {
  return parseJson(await ordinaryFileBytes(path.resolve(filePath)), path.resolve(filePath));
}

function dockerIgnorePatterns(bytes) {
  const patterns = [];
  for (const rawLine of bytes.toString(TEXT_ENCODING).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!') || path.isAbsolute(line) ||
        line.split('/').includes('..') || GLOB_META_PATTERN.test(line)) {
      inputFailure(
        'dockerignore_unsupported',
        `.dockerignore entry is outside the deterministic subset: ${line}`,
      );
    }
    const normalized = line.replace(/^\.\//u, '').replace(/\/$/u, '');
    if (normalized) patterns.push(normalized);
  }
  return patterns.sort();
}

function pathIsIgnored(relativePath, patterns) {
  if (relativePath === FINAL_MANIFEST_NAME) return true;
  return patterns.some((pattern) =>
    relativePath === pattern || relativePath.startsWith(`${pattern}/`));
}

async function readIgnoreInput(projectPath) {
  const ignorePath = path.join(projectPath, DOCKERIGNORE_NAME);
  try {
    const bytes = await ordinaryFileBytes(ignorePath);
    return {bytes, patterns: dockerIgnorePatterns(bytes)};
  } catch (error) {
    if (error.cause?.code === FILE_SYSTEM_ERROR_CODE.NOT_FOUND) {
      return {bytes: null, patterns: []};
    }
    throw error;
  }
}

function outputRootIgnore(projectPath, outputRoot) {
  const relative = path.relative(projectPath, outputRoot);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)) return null;
  return normalizedRelativePath(relative);
}

async function collectContextFiles(projectPath, patterns, outputRoot) {
  const files = [];
  let totalBytes = 0;
  const explicitOutputIgnore = outputRootIgnore(projectPath, outputRoot);

  async function visit(directoryPath, relativeDirectory, depth) {
    if (depth > MAXIMUM_RECURSION_DEPTH) {
      inputFailure('context_too_deep', 'service build context is too deeply nested');
    }
    let entries;
    try {
      entries = await readdir(directoryPath, {withFileTypes: true});
    } catch (error) {
      inputFailure('context_unreadable', `service build context is unreadable: ${directoryPath}`, error);
    }
    entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)));
    for (const entry of entries) {
      const relativePath = normalizedRelativePath(
        path.join(relativeDirectory, entry.name),
      );
      const sourcePath = path.join(directoryPath, entry.name);
      const entryStat = await lstat(sourcePath);
      if (entryStat.isSymbolicLink()) {
        inputFailure('context_link_forbidden', `service build context contains a link: ${relativePath}`);
      }
      if (pathIsIgnored(relativePath, patterns) ||
          (explicitOutputIgnore && (relativePath === explicitOutputIgnore ||
            relativePath.startsWith(`${explicitOutputIgnore}/`)))) {
        continue;
      }
      if (entryStat.isDirectory()) {
        await visit(sourcePath, relativePath, depth + 1);
        continue;
      }
      if (!entryStat.isFile()) {
        inputFailure('context_special_forbidden', `service build context contains a special file: ${relativePath}`);
      }
      const pathBytes = Buffer.byteLength(relativePath);
      if (pathBytes === 0 || pathBytes > MAXIMUM_PATH_BYTES) {
        inputFailure('context_path_invalid', `service build context path is invalid: ${relativePath}`);
      }
      const bytes = await ordinaryFileBytes(sourcePath, MAXIMUM_CONTEXT_BYTES);
      files.push({bytes, mode: entryStat.mode & 0o777, relativePath});
      totalBytes += bytes.length;
      if (files.length > MAXIMUM_CONTEXT_FILES || totalBytes > MAXIMUM_CONTEXT_BYTES) {
        inputFailure('context_too_large', 'service build context exceeds deterministic bounds');
      }
    }
  }

  await visit(projectPath, '', 0);
  return files;
}

function fingerprintContext(files) {
  const hash = createHash('sha256');
  hash.update(BUILD_CONTEXT_HASH_DOMAIN);
  for (const file of files) {
    const pathBytes = Buffer.from(file.relativePath);
    hash.update(uint64(pathBytes.length));
    hash.update(pathBytes);
    hash.update(uint64(file.mode));
    hash.update(uint64(file.bytes.length));
    hash.update(file.bytes);
  }
  return `${SHA256_PREFIX}${hash.digest('hex')}`;
}

async function writeSnapshot(files) {
  const snapshotRoot = await mkdtemp(path.join(tmpdir(), SNAPSHOT_DIRECTORY_PREFIX));
  const contextPath = path.join(snapshotRoot, SNAPSHOT_CONTEXT_DIRECTORY);
  await mkdir(contextPath, {mode: DIRECTORY_MODE});
  await chmod(contextPath, DIRECTORY_MODE);
  try {
    for (const file of files) {
      const destination = path.join(contextPath, file.relativePath);
      await mkdir(path.dirname(destination), {recursive: true, mode: DIRECTORY_MODE});
      await writeFile(destination, file.bytes, {flag: 'wx', mode: file.mode});
      await chmod(destination, file.mode);
    }
    return {contextPath, snapshotRoot};
  } catch (error) {
    await rm(snapshotRoot, {recursive: true, force: true});
    throw error;
  }
}

async function copySourceSnapshot(projectPath, ignoreInput) {
  const snapshotRoot = await mkdtemp(path.join(tmpdir(), SNAPSHOT_DIRECTORY_PREFIX));
  const sourcePath = path.join(snapshotRoot, SOURCE_SNAPSHOT_DIRECTORY);
  let fileCount = 0;
  let totalBytes = 0;
  try {
    await cp(projectPath, sourcePath, {
      dereference: false,
      errorOnExist: true,
      filter: async (sourceEntry) => {
        const entryStat = await lstat(sourceEntry);
        const relativePath = normalizedRelativePath(
          path.relative(projectPath, sourceEntry),
        );
        if (entryStat.isSymbolicLink()) {
          inputFailure('context_link_forbidden',
            `service build context contains a link: ${sourceEntry}`);
        }
        if (!entryStat.isDirectory() && !entryStat.isFile()) {
          inputFailure('context_special_forbidden',
            `service build context contains a special file: ${sourceEntry}`);
        }
        if (relativePath === DOCKERIGNORE_NAME ||
            pathIsIgnored(relativePath, ignoreInput.patterns)) {
          return relativePath === '';
        }
        if (entryStat.isFile()) {
          fileCount += 1;
          totalBytes += entryStat.size;
          if (fileCount > MAXIMUM_CONTEXT_FILES ||
              totalBytes > MAXIMUM_CONTEXT_BYTES) {
            inputFailure('context_too_large',
              'service build context exceeds deterministic bounds');
          }
        }
        return true;
      },
      force: false,
      recursive: true,
      verbatimSymlinks: true,
    });
    if (ignoreInput.bytes) {
      const ignoreDestination = path.join(sourcePath, DOCKERIGNORE_NAME);
      await writeFile(ignoreDestination, ignoreInput.bytes, {
        flag: 'wx',
        mode: FILE_MODE,
      });
      await chmod(ignoreDestination, FILE_MODE);
    }
    return {snapshotRoot, sourcePath};
  } catch (error) {
    await rm(snapshotRoot, {recursive: true, force: true});
    throw error;
  }
}

async function createServiceProjectBuildInput(
  projectDirectory,
  outputRoot,
  templateInput,
) {
  const projectPath = path.resolve(projectDirectory);
  const resolvedOutputRoot = path.resolve(outputRoot);
  if (resolvedOutputRoot === projectPath) {
    inputFailure('output_root_invalid',
      'service OCI output root must not be the service project directory');
  }
  await requirePinnedProjectIdentity(templateInput);
  const pinnedProjectPath = templateInput.pinnedProjectPath;
  const ignoreInput = await readIgnoreInput(pinnedProjectPath);
  const nestedOutputPath = outputRootIgnore(projectPath, resolvedOutputRoot);
  if (nestedOutputPath) ignoreInput.patterns.push(nestedOutputPath);
  const sourceSnapshot = await copySourceSnapshot(pinnedProjectPath, ignoreInput);
  try {
    await requirePinnedProjectIdentity(templateInput);
    const files = await collectContextFiles(
      sourceSnapshot.sourcePath,
      ignoreInput.patterns,
      resolvedOutputRoot,
    );
    if (!files.some((file) => file.relativePath === DOCKERFILE_NAME)) {
      inputFailure('dockerfile_missing',
        `service project must contain ${DOCKERFILE_NAME}`);
    }
    const sourceFingerprint = fingerprintContext(files);
    const snapshot = await writeSnapshot(files);
    return Object.freeze({
      cleanup: () => rm(snapshot.snapshotRoot, {recursive: true, force: true}),
      contextPath: snapshot.contextPath,
      dockerfilePath: path.join(snapshot.contextPath, DOCKERFILE_NAME),
      sourceFingerprint,
    });
  } finally {
    await rm(sourceSnapshot.snapshotRoot, {recursive: true, force: true});
  }
}

async function readServiceManifestTemplate(projectDirectory) {
  const projectPath = path.resolve(projectDirectory);
  let projectDirectoryHandle;
  try {
    projectDirectoryHandle = await open(
      projectPath,
      FILE_OPEN_FLAG.O_RDONLY |
        FILE_OPEN_FLAG.O_DIRECTORY |
        FILE_OPEN_FLAG.O_NOFOLLOW,
    );
    const handleStat = await projectDirectoryHandle.stat({bigint: true});
    if (!handleStat.isDirectory()) {
      inputFailure('project_invalid',
        `service project must be an ordinary directory: ${projectPath}`);
    }
    const pinnedProjectPath = `/proc/self/fd/${projectDirectoryHandle.fd}/.`;
    const templateInput = {
      pinnedProjectPath,
      projectIdentity: projectIdentity(handleStat),
      projectPath,
    };
    await requirePinnedProjectIdentity(templateInput);
    const templatePath = path.join(pinnedProjectPath, MANIFEST_TEMPLATE_NAME);
    const template = await readBoundedJsonFile(templatePath);
    if (!template || typeof template !== 'object' || Array.isArray(template) ||
        !template.artifact || typeof template.artifact !== 'object' ||
        Array.isArray(template.artifact) ||
        Object.hasOwn(template.artifact, 'digest')) {
      inputFailure('manifest_template_invalid',
        `${MANIFEST_TEMPLATE_NAME} must be an object whose artifact omits digest`);
    }
    return Object.freeze({
      close: () => projectDirectoryHandle.close(),
      finalManifestPath: path.join(projectPath, FINAL_MANIFEST_NAME),
      pinnedFinalManifestPath: path.join(
        pinnedProjectPath,
        FINAL_MANIFEST_NAME,
      ),
      ...templateInput,
      template,
    });
  } catch (error) {
    await projectDirectoryHandle?.close().catch(() => {});
    if (error instanceof ServiceProjectBuildInputError) throw error;
    inputFailure('project_unreadable',
      `service project is unreadable: ${projectPath}`, error);
  }
}

function finalManifestBytes(template, digest) {
  const candidate = {
    ...template,
    artifact: {...template.artifact, digest},
  };
  const validation = validateExternalServiceManifest(candidate);
  if (!validation.valid) {
    const detail = validation.errors.map((error) => error.message).join('; ');
    inputFailure('manifest_invalid', `generated service manifest is invalid: ${detail}`);
  }
  return {
    bytes: Buffer.from(`${JSON.stringify(validation.manifest, null, 2)}${TEXT_NEWLINE}`),
    manifest: validation.manifest,
  };
}

async function existingFinalManifest(finalManifestPath) {
  try {
    const stat = await lstat(finalManifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAXIMUM_INPUT_BYTES) {
      inputFailure('final_manifest_invalid',
        `${FINAL_MANIFEST_NAME} must be an ordinary bounded file when it exists`);
    }
    const bytes = await ordinaryFileBytes(finalManifestPath);
    const value = parseJson(bytes, finalManifestPath);
    if (!validateExternalServiceManifest(value).valid) {
      inputFailure('final_manifest_invalid',
        `${FINAL_MANIFEST_NAME} is not a valid external service manifest`);
    }
    return bytes;
  } catch (error) {
    if (error?.code === FILE_SYSTEM_ERROR_CODE.NOT_FOUND ||
        error.cause?.code === FILE_SYSTEM_ERROR_CODE.NOT_FOUND) return null;
    throw error;
  }
}

async function writeFinalManifest(finalManifestPath, bytes) {
  const temporaryPath = path.join(
    path.dirname(finalManifestPath),
    `.${FINAL_MANIFEST_NAME}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, bytes, {flag: 'wx', mode: FILE_MODE});
  await chmod(temporaryPath, FILE_MODE);
  try {
    await link(temporaryPath, finalManifestPath);
  } catch (error) {
    if (error.code !== FILE_SYSTEM_ERROR_CODE.ALREADY_EXISTS) throw error;
    const existing = await ordinaryFileBytes(finalManifestPath);
    if (!existing.equals(bytes)) {
      inputFailure('final_manifest_conflict',
        `${FINAL_MANIFEST_NAME} already exists with different content`);
    }
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

async function materializeFinalServiceManifest(templateInput, digest) {
  await requirePinnedProjectIdentity(templateInput);
  const expected = finalManifestBytes(templateInput.template, digest);
  const existing = await existingFinalManifest(
    templateInput.pinnedFinalManifestPath,
  );
  if (existing && !existing.equals(expected.bytes)) {
    inputFailure('final_manifest_conflict',
      `${FINAL_MANIFEST_NAME} already exists with different content`);
  }
  if (!existing) {
    await writeFinalManifest(templateInput.pinnedFinalManifestPath, expected.bytes);
  }
  await requirePinnedProjectIdentity(templateInput);
  return Object.freeze({
    finalManifestPath: templateInput.finalManifestPath,
    manifest: expected.manifest,
  });
}

async function validateExistingFinalServiceManifest(templateInput) {
  await requirePinnedProjectIdentity(templateInput);
  await existingFinalManifest(templateInput.pinnedFinalManifestPath);
  await requirePinnedProjectIdentity(templateInput);
}

export {
  createServiceProjectBuildInput,
  materializeFinalServiceManifest,
  readBoundedJsonFile,
  readServiceManifestTemplate,
  validateExistingFinalServiceManifest,
};
