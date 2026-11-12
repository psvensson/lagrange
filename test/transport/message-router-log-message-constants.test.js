/**
 * Every log-message constant the router sources reference must be defined:
 * an undefined member logs a line with no message (two such lines existed).
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {ROUTER_LOG_MSG} from '../../src/constants/transport.js';
import {
  MESSAGE_ROUTER_LITERAL,
} from '../../src/transport/message-router-shared-vocabulary.js';

const TRANSPORT_SOURCE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../src/transport');
const VOCABULARIES = Object.freeze([
  Object.freeze({name: 'ROUTER_LOG_MSG', members: ROUTER_LOG_MSG}),
  Object.freeze({name: 'MESSAGE_ROUTER_LITERAL', members: MESSAGE_ROUTER_LITERAL}),
]);

function referencedMembers(name) {
  const pattern = new RegExp(`\\b${name}\\s*\\.\\s*([A-Z][A-Z0-9_]*)`, 'g');
  const references = new Map();
  for (const file of fs.readdirSync(TRANSPORT_SOURCE_DIR)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(TRANSPORT_SOURCE_DIR, file), 'utf8');
    for (const match of source.matchAll(pattern)) {
      references.set(match[1], file);
    }
  }
  return references;
}

for (const {name, members} of VOCABULARIES) {
  test(`every ${name} member referenced in src/transport is defined`,
    async (t) => {
      const references = referencedMembers(name);
      t.ok(references.size > 0, 'the scan found references');
      const missing = [...references]
        .filter(([member]) => members[member] === undefined)
        .map(([member, file]) => `${member} (${file})`);
      t.same(missing, [], 'no referenced member is undefined');
    });
}

test('the two keepalive liveness lines carry their own messages', async (t) => {
  t.equal(typeof ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND, 'string');
  t.equal(typeof ROUTER_LOG_MSG.CONNECTION_PING_TIMEOUT_SKIPPED_ALIVE, 'string');
  t.not(ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND,
    ROUTER_LOG_MSG.CONNECTION_PING_TIMEOUT_SKIPPED_ALIVE);
});
