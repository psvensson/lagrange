// Second-process data-directory acquisition shared by the entrypoint
// process-custody witnesses.
import {spawn} from 'node:child_process';
import {DATA_DIRECTORY_OWNER_ERROR_CODE} from '../../src/storage/data-directory-process-owner.js';

const OWNER_MODULE = new URL('../../src/storage/data-directory-process-owner.js', import.meta.url);

// Resolves the child's own report: {acquired, pid, exitCode, signal, stderr, code?, message?}.
function contender(t, dataDir) {
  // Same genuine second-process acquisition convention as
  // replica-lifecycle-durable-generation.test.js; no lock implementation fake.
  const program = `
    import {acquireDataDirectoryProcessOwner} from ${JSON.stringify(OWNER_MODULE.href)};
    try {
      const owner = acquireDataDirectoryProcessOwner(${JSON.stringify(dataDir)});
      process.stdout.write(JSON.stringify({acquired:true,pid:process.pid}));
      owner.release();
    } catch (error) {
      process.stdout.write(JSON.stringify({acquired:false,pid:process.pid,
        code:error.code,message:error.message}));
      process.exitCode = error.code === ${JSON.stringify(DATA_DIRECTORY_OWNER_ERROR_CODE)} ?
        23 : 24;
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', program],
      {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      try {
        resolve({exitCode, signal, stderr, ...JSON.parse(stdout)});
      } catch (error) {
        reject(new Error(`contender failed to report: ${stdout}; ${stderr}`, {cause: error}));
      }
    });
  });
}


export {contender};
