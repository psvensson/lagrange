import {lstat, mkdir} from 'node:fs/promises';
import path from 'node:path';

import {
  SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE,
  SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE,
  SERVICE_LOCAL_OCI_LAYOUT_PATH,
  ServiceLocalOciLayoutFailure,
  failServiceLocalOciLayout,
} from './service-local-oci-layout-errors.js';

const FILE_SYSTEM_NOT_FOUND_CODE = 'ENOENT';

function failInvalidOutputRoot() {
  failServiceLocalOciLayout(
    SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.OUTPUT_ROOT_INVALID,
    SERVICE_LOCAL_OCI_LAYOUT_PATH.OUTPUT_ROOT,
    SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE.OUTPUT_ROOT_INVALID,
  );
}

async function rejectUnsafeOutputAncestor(outputRoot) {
  let currentPath = path.parse(outputRoot).root;
  const segments = path.relative(currentPath, outputRoot).split(path.sep);
  for (const segment of segments) {
    if (segment.length === 0) continue;
    currentPath = path.join(currentPath, segment);
    let currentStat;
    try {
      currentStat = await lstat(currentPath);
    } catch (error) {
      if (error.code === FILE_SYSTEM_NOT_FOUND_CODE) return;
      throw error;
    }
    if (!currentStat.isDirectory() || currentStat.isSymbolicLink()) {
      failInvalidOutputRoot();
    }
  }
}

async function readServiceOciOutputRootStat(outputRoot) {
  await rejectUnsafeOutputAncestor(outputRoot);
  const rootStat = await lstat(outputRoot, {bigint: true});
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    failInvalidOutputRoot();
  }
  return rootStat;
}

function outputRootIdentity(rootStat) {
  return Object.freeze({device: rootStat.dev, inode: rootStat.ino});
}

async function ensureServiceOciOutputRoot(outputRoot) {
  try {
    await rejectUnsafeOutputAncestor(outputRoot);
    await mkdir(outputRoot, {recursive: true});
    return outputRootIdentity(await readServiceOciOutputRootStat(outputRoot));
  } catch (error) {
    if (error instanceof ServiceLocalOciLayoutFailure) throw error;
    failServiceLocalOciLayout(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.OUTPUT_ROOT_INVALID,
      SERVICE_LOCAL_OCI_LAYOUT_PATH.OUTPUT_ROOT,
      SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE.OUTPUT_ROOT_UNAVAILABLE,
      error,
    );
  }
}

async function requireServiceOciOutputRootIdentity(outputRoot, expected) {
  try {
    const observed = outputRootIdentity(
      await readServiceOciOutputRootStat(outputRoot),
    );
    if (observed.device !== expected.device || observed.inode !== expected.inode) {
      failInvalidOutputRoot();
    }
  } catch (error) {
    if (error instanceof ServiceLocalOciLayoutFailure) throw error;
    failServiceLocalOciLayout(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.OUTPUT_ROOT_INVALID,
      SERVICE_LOCAL_OCI_LAYOUT_PATH.OUTPUT_ROOT,
      SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE.OUTPUT_ROOT_UNAVAILABLE,
      error,
    );
  }
}

async function requireServiceOciLayoutDirectory(layoutPath) {
  let layoutStat;
  try {
    layoutStat = await lstat(layoutPath);
  } catch (error) {
    failServiceLocalOciLayout(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      SERVICE_LOCAL_OCI_LAYOUT_PATH.OUTPUT_ROOT,
      SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE.LAYOUT_ROOT_INVALID,
      error,
    );
  }
  if (!layoutStat.isDirectory() || layoutStat.isSymbolicLink()) {
    failServiceLocalOciLayout(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      SERVICE_LOCAL_OCI_LAYOUT_PATH.OUTPUT_ROOT,
      SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE.LAYOUT_ROOT_INVALID,
    );
  }
}

async function serviceOciLayoutDirectoryExists(layoutPath) {
  try {
    const layoutStat = await lstat(layoutPath);
    if (!layoutStat.isDirectory() || layoutStat.isSymbolicLink()) {
      failServiceLocalOciLayout(
        SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
        SERVICE_LOCAL_OCI_LAYOUT_PATH.OUTPUT_ROOT,
        SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE.LAYOUT_ROOT_INVALID,
      );
    }
    return true;
  } catch (error) {
    if (error.code === FILE_SYSTEM_NOT_FOUND_CODE) return false;
    throw error;
  }
}

export {
  ensureServiceOciOutputRoot,
  requireServiceOciLayoutDirectory,
  requireServiceOciOutputRootIdentity,
  serviceOciLayoutDirectoryExists,
};
