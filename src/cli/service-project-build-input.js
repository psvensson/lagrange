import {constants as FILE_OPEN_FLAG} from 'node:fs';
import {open} from 'node:fs/promises';
import path from 'node:path';

const TEXT_ENCODING = 'utf8';
const MAXIMUM_INPUT_BYTES = 4 * 1024 * 1024;
const SERVICE_PROJECT_BUILD_INPUT_ERROR_NAME =
  'ServiceProjectBuildInputError';
const SERVICE_PROJECT_BUILD_INPUT_ERROR_CODE = Object.freeze({
  INPUT_INVALID: 'input_invalid',
  INPUT_UNREADABLE: 'input_unreadable',
  JSON_INVALID: 'json_invalid',
});

class ServiceProjectBuildInputError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = SERVICE_PROJECT_BUILD_INPUT_ERROR_NAME;
    this.code = code;
  }
}

function inputFailure(code, message, cause) {
  throw new ServiceProjectBuildInputError(code, message, {cause});
}

async function ordinaryFileBytes(filePath, maximumBytes = MAXIMUM_INPUT_BYTES) {
  let fileHandle;
  try {
    fileHandle = await open(
      filePath,
      FILE_OPEN_FLAG.O_RDONLY | FILE_OPEN_FLAG.O_NOFOLLOW,
    );
  } catch (error) {
    inputFailure(
      SERVICE_PROJECT_BUILD_INPUT_ERROR_CODE.INPUT_UNREADABLE,
      `input file is not readable: ${filePath}`,
      error,
    );
  }
  try {
    const fileStat = await fileHandle.stat();
    if (!fileStat.isFile() || fileStat.nlink !== 1 ||
        fileStat.size > maximumBytes) {
      inputFailure(SERVICE_PROJECT_BUILD_INPUT_ERROR_CODE.INPUT_INVALID,
        `input must be a bounded ordinary file: ${filePath}`);
    }
    return await fileHandle.readFile();
  } catch (error) {
    if (error instanceof ServiceProjectBuildInputError) throw error;
    inputFailure(
      SERVICE_PROJECT_BUILD_INPUT_ERROR_CODE.INPUT_UNREADABLE,
      `input file is not readable: ${filePath}`,
      error,
    );
  } finally {
    await fileHandle.close();
  }
}

function parseJson(bytes, filePath) {
  try {
    return JSON.parse(bytes.toString(TEXT_ENCODING));
  } catch (error) {
    inputFailure(
      SERVICE_PROJECT_BUILD_INPUT_ERROR_CODE.JSON_INVALID,
      `input must contain valid JSON: ${filePath}`,
      error,
    );
  }
}

async function readBoundedJsonFile(filePath) {
  const resolved = path.resolve(filePath);
  return parseJson(await ordinaryFileBytes(resolved), resolved);
}

export {readBoundedJsonFile};
