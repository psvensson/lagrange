// One short installation exclusion protects configuration and service ownership.
import fs from 'node:fs';
import path from 'node:path';
import {createOwnedDirectory, ownedPath} from './paths.js';


const EXISTING_LOCK = 'EEXIST';
const SERVICE_SEPARATOR = ',';
const REFUSAL = Object.freeze({
  LIFECYCLE_BUSY: 'tooling_lifecycle_busy',
});


const DIRECTORY = '.codex/quest-tooling';
const LOCK = `${DIRECTORY}/lifecycle.lock`;
const OWNER = 'owner.json';

function withLifecycleLock(root, action, work) {
  createOwnedDirectory(root, DIRECTORY);
  const lock = ownedPath(root, LOCK);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code === EXISTING_LOCK) throw new Error(REFUSAL.LIFECYCLE_BUSY);
    throw error;
  }
  fs.writeFileSync(path.join(lock, OWNER), JSON.stringify({root, pid: process.pid, action}));
  try {
    // Service startup acquires its long-lived service lock synchronously before
    // returning a Promise. The installation exclusion ends at that handoff.
    return work();
  } finally {
    fs.rmSync(lock, {recursive: true});
  }
}

function assertNoServices(root, profile) {
  const active = Object.keys(profile.servers).filter((server) =>
    fs.existsSync(ownedPath(root, `${DIRECTORY}/${server}.lock`)));
  if (active.length > 0) throw new Error(`tooling_session_active: ${active.join(SERVICE_SEPARATOR)}`);
}

export {assertNoServices, withLifecycleLock};
