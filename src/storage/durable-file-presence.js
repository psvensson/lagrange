/**
 * Owner contract:
 * Owner: whether a durable file is positively absent (2026-11-12). A path
 * that cannot be resolved is not an absent file: `fs.existsSync` answers
 * false for a file under a directory without search permission, for a path
 * through a non-directory and for any other failed lookup, and a reader that
 * decides from it reads a broken data directory as "nothing was ever there".
 * Inputs: the file's path.
 * Canonical output: a frozen {presence, cause} (DURABLE_FILE_PRESENCE):
 *   PRESENT  the path is a regular file (cause null);
 *   ABSENT   the lookup of the file answered ENOENT, and so did every
 *            missing directory above it up to the nearest existing one, which
 *            is a directory this process may read and search (cause null): the
 *            name is positively not there. A replica's own directory is
 *            removed with its last database, so a missing directory under a
 *            readable one is an absence, not a doubt;
 *   UNKNOWN  anything else, with its cause {code, path}: the failing
 *            lookup's error code (EACCES, ENOTDIR, ELOOP, EIO, ...),
 *            NOT_A_REGULAR_FILE (a directory or a link in the file's place)
 *            or DANGLING_LINK (a directory above it is a link to nothing),
 *            and the path it was about.
 * Not proven here: that the directory is the mounted volume it was at
 * startup (an unmounted volume whose mount point is an empty readable
 * directory reads ABSENT); that is the data directory owner's fact.
 * Prohibited: an absence decided from a failed lookup.
 */
import fs from 'node:fs';
import path from 'node:path';

const DURABLE_FILE_PRESENCE = Object.freeze({
  PRESENT: 'durable-file-present',
  ABSENT: 'durable-file-absent',
  UNKNOWN: 'durable-file-presence-unknown',
});
const DURABLE_FILE_PRESENCE_CAUSE = Object.freeze({
  NOT_A_REGULAR_FILE: 'durable-file-not-a-regular-file',
  DANGLING_LINK: 'durable-file-ancestor-link-dangles',
  UNCODED: 'durable-file-lookup-failed',
});
const NOT_FOUND = 'ENOENT';
const PRESENT = Object.freeze({presence: DURABLE_FILE_PRESENCE.PRESENT,
  cause: null});
const ABSENT = Object.freeze({presence: DURABLE_FILE_PRESENCE.ABSENT,
  cause: null});

function unknown(code, subject) {
  return Object.freeze({presence: DURABLE_FILE_PRESENCE.UNKNOWN,
    cause: Object.freeze({code, path: subject})});
}

// The error code of one lookup, or null when it succeeded.
function lookupCodeOf(lookup) {
  try {
    lookup();
    return null;
  } catch (error) {
    return typeof error?.code === 'string' ? error.code :
      DURABLE_FILE_PRESENCE_CAUSE.UNCODED;
  }
}

// The nearest existing name above a missing one: ABSENT when every missing
// level answered ENOENT and that name is a directory this process may read
// and search. (It is a directory or a link: a lookup below a regular file
// answers ENOTDIR, never ENOENT.) A link whose target is missing - a data
// directory linked to a volume that is not mounted - is not an absence.
function absenceUnder(missing) {
  let directory = path.dirname(missing);
  for (;;) {
    const code = lookupCodeOf(() => fs.lstatSync(directory));
    if (code === null) {
      const resolved = lookupCodeOf(() => fs.accessSync(directory,
        fs.constants.R_OK | fs.constants.X_OK));
      if (resolved === null) {
        return ABSENT;
      }
      return unknown(resolved === NOT_FOUND ?
        DURABLE_FILE_PRESENCE_CAUSE.DANGLING_LINK : resolved, directory);
    }
    const parent = path.dirname(directory);
    if (code !== NOT_FOUND || parent === directory) {
      return unknown(code, directory);
    }
    directory = parent;
  }
}

/**
 * Whether a durable file is there, positively.
 * @param {string} file - The file's path.
 * @return {Object} Frozen {presence, cause}.
 */
function readDurableFilePresence(file) {
  const target = path.resolve(String(file));
  let stat = null;
  const code = lookupCodeOf(() => {
    stat = fs.lstatSync(target);
  });
  if (code === null) {
    return stat.isFile() ? PRESENT :
      unknown(DURABLE_FILE_PRESENCE_CAUSE.NOT_A_REGULAR_FILE, target);
  }
  return code === NOT_FOUND ? absenceUnder(target) : unknown(code, target);
}

export {
  DURABLE_FILE_PRESENCE,
  DURABLE_FILE_PRESENCE_CAUSE,
  readDurableFilePresence,
};
