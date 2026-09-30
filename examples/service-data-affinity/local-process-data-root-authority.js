import {randomUUID} from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, parse, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWNER_MARKER_NAME = '.lagrange-local-process-owner.json';
const OWNER_MARKER_KIND = 'lagrange-local-process-cluster-root-v1';

function dataRootIsNarrow(dataRoot) {
  if (typeof dataRoot !== 'string' || dataRoot.length === 0) return false;
  const root = resolve(dataRoot);
  return !new Set([
    parse(root).root,
    resolve('.'),
    REPOSITORY_ROOT,
    homedir(),
  ]).has(root);
}

function dataRootAuthorityError(message, details = {}, cause = null) {
  const error = new Error(message, cause ? {cause} : undefined);
  error.code = 'LOCAL_PROCESS_CLUSTER_DATA_ROOT_AUTHORITY';
  error.details = details;
  return error;
}

async function observePath(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertDirectoryObservation(observation, path) {
  if (!observation?.isDirectory() || observation.isSymbolicLink()) {
    throw dataRootAuthorityError(
      `Local process ownership path is not a real directory: ${path}`,
      {path},
    );
  }
}

async function claimLocalProcessDataRootUnchecked(dataRoot) {
  if (!dataRootIsNarrow(dataRoot)) {
    throw dataRootAuthorityError(
      `Refusing broad local process data root: ${String(dataRoot)}`,
      {dataRoot},
    );
  }
  const root = resolve(dataRoot);
  const before = await observePath(root);
  if (before) {
    assertDirectoryObservation(before, root);
    const existingEntries = await readdir(root);
    if (existingEntries.length > 0) {
      throw dataRootAuthorityError(
        `Refusing populated unowned local process data root: ${root}`,
        {dataRoot: root, existingEntries: Object.freeze(existingEntries)},
      );
    }
  } else {
    await mkdir(root, {recursive: true});
  }
  const rootObservation = await lstat(root);
  assertDirectoryObservation(rootObservation, root);
  if (await realpath(root) !== root) {
    throw dataRootAuthorityError(
      `Local process data root traverses a symbolic path: ${root}`,
      {dataRoot: root});
  }
  const ownerId = randomUUID();
  const markerPath = resolve(root, OWNER_MARKER_NAME);
  const marker = JSON.stringify({kind: OWNER_MARKER_KIND, ownerId});
  try {
    await writeFile(markerPath, marker, {encoding: 'utf8', flag: 'wx'});
  } catch (cause) {
    throw dataRootAuthorityError(
      `Could not claim local process data root: ${root}`,
      {dataRoot: root, markerPath},
      cause,
    );
  }
  const [claimedEntries, claimedRoot] = await Promise.all([
    readdir(root),
    lstat(root),
  ]);
  if (claimedRoot.isSymbolicLink() || !claimedRoot.isDirectory() ||
      claimedRoot.dev !== rootObservation.dev ||
      claimedRoot.ino !== rootObservation.ino ||
      claimedEntries.length !== 1 || claimedEntries[0] !== OWNER_MARKER_NAME) {
    await rm(markerPath, {force: true});
    throw dataRootAuthorityError(
      `Local process data root changed while it was claimed: ${root}`,
      {dataRoot: root, claimedEntries: Object.freeze(claimedEntries)},
    );
  }
  return Object.freeze({
    root,
    ownerId,
    marker,
    markerPath,
    device: rootObservation.dev,
    inode: rootObservation.ino,
  });
}

async function claimLocalProcessDataRoot(dataRoot) {
  try {
    return await claimLocalProcessDataRootUnchecked(dataRoot);
  } catch (cause) {
    if (cause?.code === 'LOCAL_PROCESS_CLUSTER_DATA_ROOT_AUTHORITY') {
      throw cause;
    }
    throw dataRootAuthorityError(
      `Could not establish local process data-root authority: ${dataRoot}`,
      {dataRoot}, cause);
  }
}

async function assertLocalProcessDataRootAuthority(authority) {
  let observations;
  try {
    observations = await Promise.all([
      lstat(authority.root),
      lstat(authority.markerPath),
      readFile(authority.markerPath, 'utf8'),
      realpath(authority.root),
    ]);
  } catch (cause) {
    throw dataRootAuthorityError(
      `Local process data-root authority is unavailable: ${authority.root}`,
      {dataRoot: authority.root}, cause);
  }
  const [rootObservation, markerObservation, marker, canonicalRoot] =
    observations;
  assertDirectoryObservation(rootObservation, authority.root);
  if (rootObservation.dev !== authority.device ||
      rootObservation.ino !== authority.inode ||
      canonicalRoot !== authority.root ||
      !markerObservation.isFile() || markerObservation.isSymbolicLink() ||
      marker !== authority.marker) {
    throw dataRootAuthorityError(
      `Local process data-root authority changed: ${authority.root}`,
      {dataRoot: authority.root},
    );
  }
}

function assertNodePathBelongsToRoot(authority, dataDir) {
  const resolvedDataDir = resolve(dataDir);
  if (dirname(resolvedDataDir) !== authority.root) {
    throw dataRootAuthorityError(
      `Node data directory is outside its owned root: ${resolvedDataDir}`,
      {dataDir: resolvedDataDir, dataRoot: authority.root},
    );
  }
  return resolvedDataDir;
}

async function createOwnedLocalProcessNodeDirectory(authority, dataDir) {
  await assertLocalProcessDataRootAuthority(authority);
  const ownedDataDir = assertNodePathBelongsToRoot(authority, dataDir);
  try {
    await mkdir(ownedDataDir, {recursive: false});
  } catch (cause) {
    throw dataRootAuthorityError(
      `Could not exclusively create node data directory: ${ownedDataDir}`,
      {dataDir: ownedDataDir},
      cause,
    );
  }
  let observation;
  try {
    observation = await lstat(ownedDataDir);
    await assertLocalProcessDataRootAuthority(authority);
  } catch (cause) {
    throw dataRootAuthorityError(
      `Could not prove node data-directory ownership: ${ownedDataDir}`,
      {dataDir: ownedDataDir}, cause);
  }
  assertDirectoryObservation(observation, ownedDataDir);
  return Object.freeze({
    path: ownedDataDir,
    device: observation.dev,
    inode: observation.ino,
  });
}

async function resetOwnedLocalProcessNodeDirectory(
  authority, node, reset = rm,
) {
  await assertLocalProcessDataRootAuthority(authority);
  const dataDir = assertNodePathBelongsToRoot(authority, node.dataDir);
  let observation;
  try {
    observation = await lstat(dataDir);
  } catch (cause) {
    throw dataRootAuthorityError(
      `Node data directory is unavailable before reset: ${dataDir}`,
      {dataDir}, cause);
  }
  if (!observation.isDirectory() || observation.isSymbolicLink() ||
      observation.dev !== node.dataDirIdentity.device ||
      observation.ino !== node.dataDirIdentity.inode) {
    throw dataRootAuthorityError(
      `Node data-directory authority changed before reset: ${dataDir}`,
      {dataDir},
    );
  }
  try {
    await reset(dataDir, {recursive: true, force: false});
  } catch (cause) {
    throw dataRootAuthorityError(
      `Node data-directory reset failed: ${dataDir}`,
      {dataDir}, cause);
  }
}

export {
  assertLocalProcessDataRootAuthority,
  claimLocalProcessDataRoot,
  createOwnedLocalProcessNodeDirectory,
  dataRootIsNarrow,
  resetOwnedLocalProcessNodeDirectory,
};
