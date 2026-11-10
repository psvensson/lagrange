import fs from 'node:fs';
import path from 'node:path';


const PATH_SEPARATOR = '/';
const WINDOWS_SEPARATOR = '\\';
const CURRENT_DIRECTORY = '.';
const PARENT_DIRECTORY = '..';
const MISSING_PATH = 'ENOENT';


function ownedPath(root, relative) {
  if (path.isAbsolute(relative) || relative.includes(WINDOWS_SEPARATOR) ||
    relative.split(PATH_SEPARATOR).some((part) => ['', CURRENT_DIRECTORY, PARENT_DIRECTORY].includes(part))) {
    throw new Error(`tooling_unsafe_path: ${relative}`);
  }
  let current = root;
  for (const part of relative.split(PATH_SEPARATOR)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === MISSING_PATH) continue;
      throw error;
    }
    if (stat.isSymbolicLink() || fs.realpathSync(current) !== current) {
      throw new Error(`tooling_unsafe_path: ${relative}`);
    }
  }
  return current;
}

function createOwnedDirectory(root, relative) {
  const directory = ownedPath(root, relative);
  fs.mkdirSync(directory, {recursive: true});
  return ownedPath(root, relative);
}

function existsLiteral(root, relative) {
  const file = ownedPath(root, relative);
  return fs.existsSync(file);
}

export {createOwnedDirectory, existsLiteral, ownedPath};
