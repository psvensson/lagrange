/**
 * Shared scaffold-projection writer for the `lagrange service init`
 * scaffolds (the WASM-first and the legacy OCI owners).
 *
 * One owner for the two invariants every scaffold shares: the target
 * directory's subdirectory tree is created and chmod-pinned, and each
 * projected file is written exclusive-write (never clobbering an
 * existing path) then chmod-pinned. Both scaffolds differ only in WHICH
 * subdirectories and files they project, so those arrive as parameters.
 */

import fs from 'node:fs';
import path from 'node:path';

const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o755;
const PROJECTED_FILE = Object.freeze({
  ENCODING: 'utf8',
  EXCLUSIVE_WRITE_FLAG: 'wx',
});

/**
 * Create the scaffold's subdirectory tree and write its projected files
 * (exclusive-write, mode-pinned).
 * @param {string} targetDirectory - the freshly created project root.
 * @param {string[]} subdirectories - directories to create, in order.
 * @param {Array<[string, string]>} files - [relativePath, content] pairs.
 */
function writeScaffoldProjectFiles(targetDirectory, subdirectories, files) {
  for (const directory of subdirectories) {
    const directoryPath = path.join(targetDirectory, directory);
    fs.mkdirSync(directoryPath, {mode: DIRECTORY_MODE});
    fs.chmodSync(directoryPath, DIRECTORY_MODE);
  }
  for (const [relativePath, content] of files) {
    const filePath = path.join(targetDirectory, relativePath);
    fs.writeFileSync(filePath, content, {
      encoding: PROJECTED_FILE.ENCODING,
      flag: PROJECTED_FILE.EXCLUSIVE_WRITE_FLAG,
      mode: FILE_MODE,
    });
    fs.chmodSync(filePath, FILE_MODE);
  }
}

/**
 * Create a scaffold project directory and write its projected files,
 * removing ONLY the freshly created target on any write failure
 * (never clobbering a pre-existing path). The service-name result shape
 * is shared by both scaffolds.
 * @param {object} params
 * @param {string} params.targetArgument - user-supplied target path.
 * @param {string[]} params.subdirectories - directories to create.
 * @param {Array<[string, string]>} params.files - [relativePath, content].
 * @param {function(Error, string): Error} params.classifyError - maps a
 *   write failure to the owning scaffold's typed error.
 * @return {{name: string, targetDirectory: string, files: string[]}}
 */
function createScaffoldProject({
  targetArgument,
  subdirectories,
  files,
  classifyError,
}) {
  const targetDirectory = path.resolve(targetArgument);
  const serviceName = path.basename(targetDirectory);
  let targetCreated = false;
  try {
    fs.mkdirSync(targetDirectory, {mode: DIRECTORY_MODE});
    targetCreated = true;
    fs.chmodSync(targetDirectory, DIRECTORY_MODE);
    writeScaffoldProjectFiles(targetDirectory, subdirectories, files);
  } catch (error) {
    if (targetCreated) {
      fs.rmSync(targetDirectory, {recursive: true, force: true});
    }
    throw classifyError(error, targetDirectory);
  }
  return Object.freeze({
    name: serviceName,
    targetDirectory,
    files: Object.freeze(files.map(([relativePath]) => relativePath)),
  });
}

export {createScaffoldProject, writeScaffoldProjectFiles};
