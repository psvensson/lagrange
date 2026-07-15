import fs from 'node:fs';
import path from 'node:path';

import {CONFIG_FILE, SOLVE_DATA_DIR} from './constants.js';

const LOCAL_STR_OWNED_001 = 'config';
const LOCAL_STR_OWNED_002 = 'environment';
const LOCAL_STR_OWNED_003 = 'none';
const LOCAL_STR_OWNED_004 = 'co-author trailer must match `Co-Authored-By: Name <email>`';

const COAUTHOR_ENV = 'SOLVE_COAUTHOR_TRAILER';
const COAUTHOR_PATTERN =
  /^Co-Authored-By:\s+[^<>\n]+\s+<[^<>\s@]+@[^<>\s@]+>$/u;

function configuredTrailer(root, env) {
  const file = path.join(root, SOLVE_DATA_DIR, CONFIG_FILE);
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof config.coauthorTrailer === 'string' && config.coauthorTrailer.trim()) {
      return {source: LOCAL_STR_OWNED_001, value: config.coauthorTrailer.trim()};
    }
  } catch {
    // Config is optional for attribution. `solve doctor` reports parse failures.
  }
  if (typeof env[COAUTHOR_ENV] === 'string' && env[COAUTHOR_ENV].trim()) {
    return {source: LOCAL_STR_OWNED_002, value: env[COAUTHOR_ENV].trim()};
  }
  return {source: LOCAL_STR_OWNED_003, value: null};
}

export function inspectCoauthorAttribution(root, env = process.env) {
  const configured = configuredTrailer(root, env);
  if (configured.value === null) {
    return {
      configured: false,
      valid: true,
      source: LOCAL_STR_OWNED_003,
      trailer: null,
      issue: null,
    };
  }
  if (!COAUTHOR_PATTERN.test(configured.value)) {
    return {
      configured: true,
      valid: false,
      source: configured.source,
      trailer: null,
      issue: LOCAL_STR_OWNED_004,
    };
  }
  return {
    configured: true,
    valid: true,
    source: configured.source,
    trailer: configured.value,
    issue: null,
  };
}

export function resolveCoauthorTrailer(root, env = process.env) {
  return inspectCoauthorAttribution(root, env).trailer;
}
