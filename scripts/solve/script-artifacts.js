// Literal retained paths declared by a script probe. No implicit discovery.
import path from 'node:path';


const ARTIFACTS_FIELD = 'artifacts';
const PATH_SEPARATOR = '/';
const CURRENT_DIRECTORY = '.';
const PARENT_DIRECTORY = '..';
const INVALID_ARTIFACT_DECLARATION = 'script artifacts must be unique literal repository-relative file paths';


const UNSAFE_PATH = /[\\*?[\]{}]/u;
const FIRST_PRINTABLE = 32;

function scriptArtifacts(args) {
  if (!Object.hasOwn(args, ARTIFACTS_FIELD)) return [];
  const files = args.artifacts;
  if (!Array.isArray(files) || new Set(files).size !== files.length ||
    files.some((file) => typeof file !== 'string' || file.length === 0 ||
      path.posix.isAbsolute(file) || UNSAFE_PATH.test(file) ||
      [...file].some((character) => character.charCodeAt(0) < FIRST_PRINTABLE) ||
      file.split(PATH_SEPARATOR).some((part) => part === '' || part === CURRENT_DIRECTORY || part === PARENT_DIRECTORY) ||
      /^[a-z]:/iu.test(file))) {
    throw new Error(INVALID_ARTIFACT_DECLARATION);
  }
  return [...files];
}

export {scriptArtifacts};
