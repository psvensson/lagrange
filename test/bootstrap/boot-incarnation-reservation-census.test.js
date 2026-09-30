// Structural census: the boot incarnation owner is the ONE semantic
// reservation authority, and no lifecycle path manufactures a default
// incarnation. Node/process startup -> BootIncarnationOwner -> exact
// incarnation G -> BootstrapService / NodeJoiningService / lifecycle owners.
//
// Every remaining site that turns an absent incarnation into 0 — in a local
// value, in a durable COLUMN write, in a table's schema default, or by
// dropping the field from a row it otherwise carries — is listed here with
// its classification. The list is a ratchet: a new unclassified site fails,
// and a classified site that disappears must be removed (entries only
// shrink). Literal zeros in unrelated tests and data are not in scope; the
// scan targets incarnation acquisition, default, column-write, schema-default
// and field-omission shapes only.
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWNER_FILE = 'src/bootstrap/boot-incarnation-owner.js';
// The package surface (src/public-api.js re-exports src/bootstrap/index.js).
const PUBLIC_REEXPORT_FILE = 'src/bootstrap/index.js';
// Every name the incarnation is known by: the option/field, the constant, and
// the durable column. A COLUMN-keyed write (`[COLUMN.BOOT_INCARNATION]:`) and
// a quoted column key (`'boot_incarnation':`) are the same site class as a
// plain `bootIncarnation:` — the trailing quote/bracket is part of the token.
const INCARNATION_NAME =
  '(?:(?:[bB]oot|[oO]wner)Incarnation|BOOT_INCARNATION(?!_)|boot_incarnation)';
const INCARNATION = `${INCARNATION_NAME}['"\\]]?`;
const ZERO = '(?:0|TRANSPORT_NUM\\.ZERO)';

// The shapes that interpret "missing" as an incarnation.
const DEFAULT_SHAPES = Object.freeze({
  // x.bootIncarnation || 0, x.bootIncarnation ?? 0
  fallback_zero: new RegExp(
    `${INCARNATION}[^;\\n]*?(?:\\|\\||\\?\\?)\\s*${ZERO}\\b`, 'gu'),
  // ... ? x.bootIncarnation : 0;
  else_zero: new RegExp(`${INCARNATION}\\)?\\s*:\\s*${ZERO}\\s*[;,]`, 'gu'),
  // bootIncarnation: 0 / bootIncarnation = 0 / [COLUMN.BOOT_INCARNATION]: 0
  literal_zero: new RegExp(`${INCARNATION}[ \\t]*[:=][ \\t]*${ZERO}\\b`, 'gu'),
  // function normalizeBootIncarnationOption(...)
  normalizer: /function\s+normalize\w*(?:Boot|Owner)Incarnation\w*/gu,
  // The durable column's own default: a row that reaches storage without a
  // writer-supplied incarnation still gets one.
  schema_default_zero: new RegExp(
    `(?:${INCARNATION_NAME}['"]?[^}\\n]*?defaultValue:\\s*${ZERO}\\b` +
    `|ADD COLUMN\\s+boot_incarnation[^'"\\n]*DEFAULT\\s+${ZERO}\\b)`, 'gu'),
  // cond ? {...row, bootIncarnation} : <not an object>  — one branch carries
  // the field and the other does not.
  dropped_field: new RegExp(
    `\\?[\\s\\S]{0,160}?\\{[^{}]*${INCARNATION_NAME}[^{}]*\\}\\s*:\\s*(?!\\{)`,
    'gu'),
  // delete row.bootIncarnation / delete row[COLUMN.BOOT_INCARNATION]
  deleted_field: new RegExp(`delete\\s+[^;\\n]*${INCARNATION}`, 'gu'),
});

const SITE_CLASS = Object.freeze({
  // A connection slot or a decoded remote error before/without the PEER's
  // identification: an observation of another node, not this node's
  // lifecycle incarnation.
  REMOTE_PEER_OBSERVATION: 'remote_peer_observation',
  // The durable column's schema default, required by its NOT NULL migration.
  // 0 is the pre-incarnation (legacy) row marker, never current for routing
  // (endpoint-incarnation-currentness.js); no writer supplies it.
  LEGACY_ROW_SCHEMA_DEFAULT: 'legacy_row_schema_default',
  // A conditional whose alternative is the ABSENCE of the row, not the row
  // without its incarnation: nothing is written, so no field is dropped.
  ABSENT_ROW_NOT_STAMPED: 'absent_row_not_stamped',
});

const CLASSIFIED_SITES = Object.freeze({
  'src/control-plane/control-plane-error-classification.js#normalizer':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-connection-authority.js#literal_zero':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-connection-authority.js#normalizer':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-connection-close-reconnect.js#literal_zero':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-connection-lifecycle-methods.js#else_zero':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-connection-lifecycle-methods.js#literal_zero':
    {count: 3, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-reconnect-behaviors.js#else_zero':
    {count: 2, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-reconnect-behaviors.js#literal_zero':
    {count: 2, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-server-lifecycle.js#else_zero':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  'src/transport/message-router-server-lifecycle.js#literal_zero':
    {count: 1, siteClass: SITE_CLASS.REMOTE_PEER_OBSERVATION},
  // nodes
  'src/bootstrap/system-table-core-schema-definitions.js#schema_default_zero':
    {count: 1, siteClass: SITE_CLASS.LEGACY_ROW_SCHEMA_DEFAULT},
  // node_endpoints + service_endpoints
  'src/bootstrap/system-table-runtime-schema-definitions.js#schema_default_zero':
    {count: 2, siteClass: SITE_CLASS.LEGACY_ROW_SCHEMA_DEFAULT},
  // the ADD COLUMN migration of an existing deployment's nodes table
  'src/partition/partition-service-constants.js#schema_default_zero':
    {count: 1, siteClass: SITE_CLASS.LEGACY_ROW_SCHEMA_DEFAULT},
  'src/bootstrap/shared/node-registration-owner-durable-rejoin-methods.js#dropped_field':
    {count: 1, siteClass: SITE_CLASS.ABSENT_ROW_NOT_STAMPED},
});

// Every caller of the reservation verb: the runtime entrypoint (the reference
// shape), the embedding example, and the simulator's adapter onto the owner.
const RESERVATION_CALLERS = Object.freeze([
  'examples/request-binding-deployment/request-binding-example-node.js',
  'src/lagrange-runtime-startup.js',
  'test/simulation/formation-sim-boot-incarnation.js',
]);

function jsFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) jsFiles(path, files);
    else if (path.endsWith('.js')) files.push(path);
  }
  return files;
}

function scannedFiles() {
  const files = [
    ...jsFiles(join(REPO_ROOT, 'src')),
    ...jsFiles(join(REPO_ROOT, 'examples')),
    ...jsFiles(join(REPO_ROOT, 'test/simulation')),
    ...jsFiles(join(REPO_ROOT, 'test'))
      .filter((path) => path.endsWith('test-support.js')),
  ];
  return [...new Set(files)].map((path) => ({
    file: relative(REPO_ROOT, path),
    source: readFileSync(path, 'utf8'),
  }));
}

function collectDefaultSites(files) {
  const sites = {};
  for (const {file, source} of files) {
    for (const [shape, pattern] of Object.entries(DEFAULT_SHAPES)) {
      const count = (source.match(pattern) || []).length;
      if (count > 0) sites[`${file}#${shape}`] = count;
    }
  }
  return sites;
}

test('no lifecycle path manufactures a default boot incarnation: every ' +
  'remaining absent-means-0 site is classified (a new one fails here)',
(t) => {
  const sites = collectDefaultSites(scannedFiles());
  const unclassified = Object.keys(sites)
    .filter((site) => !CLASSIFIED_SITES[site]);
  t.same(unclassified, [], 'no unclassified incarnation-default site');
  const drifted = Object.entries(CLASSIFIED_SITES)
    .filter(([site, entry]) => sites[site] !== entry.count)
    .map(([site, entry]) => `${site}: classified ${entry.count}, ` +
      `found ${sites[site] ?? 0}`);
  t.same(drifted, [],
    'every classified site still exists with its count (entries only shrink)');
  for (const lifecycleOwner of [
    'src/bootstrap/bootstrap-service.js',
    'src/bootstrap/node-joining-owner-construction.js',
    'src/bootstrap/node-joining-delegate-bundles.js',
    'src/bootstrap/shared/replica-handler-setup.js',
    'src/bootstrap/shared/node-state-publication-owner.js',
    'src/node/replica-state-machine.js',
    'src/control-plane/heartbeat-service.js',
    'src/transport/message-router.js',
    'src/bootstrap/rejoin-hints.js',
    OWNER_FILE,
  ]) {
    t.notOk(Object.keys(sites).some((site) =>
      site.startsWith(`${lifecycleOwner}#`)),
    `${lifecycleOwner} carries no incarnation default`);
  }
  t.end();
});

// Anti-vacuous: the widened shapes are what make the ratchet cover a durable
// COLUMN write, a table's schema default and a conditionally dropped field —
// the three ways an absent incarnation reached storage as 0 before D5. Each
// snippet below is the exact shape that was, or could be, written.
test('the widened default shapes detect a column write, a schema default ' +
  'and a dropped field', (t) => {
  const cases = [
    ['literal_zero', 'const row = {[COLUMN.BOOT_INCARNATION]: 0};'],
    ['literal_zero', 'const row = {\'boot_incarnation\': 0};'],
    ['fallback_zero', 'row[COLUMN.BOOT_INCARNATION] = observed || 0;'],
    ['schema_default_zero',
      '{name: \'boot_incarnation\', type: COLUMN_TYPE.INTEGER, ' +
      'notNull: true, defaultValue: 0},'],
    ['schema_default_zero',
      'ADD_BOOT_INCARNATION: \'ADD COLUMN boot_incarnation INTEGER ' +
      'NOT NULL DEFAULT 0\','],
    // The pre-D5 hints builder: the field left OFF the object entirely.
    ['dropped_field',
      'return Number.isSafeInteger(bootIncarnation) && bootIncarnation > 0 ?\n' +
      '  {...snapshot, bootIncarnation} :\n  snapshot;'],
    ['deleted_field', 'delete snapshot.bootIncarnation;'],
    ['deleted_field', 'delete row[COLUMN.BOOT_INCARNATION];'],
  ];
  for (const [shape, snippet] of cases) {
    const sites = collectDefaultSites([{file: 'probe.js', source: snippet}]);
    t.same(Object.keys(sites), [`probe.js#${shape}`],
      `${shape} detects: ${snippet.split('\n')[0]}`);
  }
  // A stamped write is not a default site.
  t.same(collectDefaultSites([{
    file: 'probe.js',
    source: 'const row = {[COLUMN.BOOT_INCARNATION]: ' +
      'requireIssuedBootIncarnation(bootIncarnation, SUBJECT)};',
  }]), {}, 'a required-incarnation stamp is not a default site');
  t.end();
});

test('the boot incarnation owner is the only reservation authority', (t) => {
  const files = scannedFiles();
  const reservationState = files
    .filter(({source}) => /BOOT_INCARNATION_FILENAME|boot-incarnation\.json/u
      .test(source))
    .map(({file}) => file);
  t.same(reservationState, [OWNER_FILE],
    'only the owner names the durable reservation state');
  const definers = files
    .filter(({file, source}) => file !== OWNER_FILE &&
      /function\s+(?:reserve|mint|allocate|issue|next)\w*BootIncarnation\b/u
        .test(source) &&
      !/reserveBootIncarnation\(/u.test(source))
    .map(({file}) => file);
  t.same(definers, [],
    'no other module defines a reservation that does not call the owner');
  const callers = files
    .filter(({file, source}) => file !== OWNER_FILE &&
      /\breserveBootIncarnation\(/u.test(source))
    .map(({file}) => file)
    .sort();
  t.same(callers, [...RESERVATION_CALLERS],
    'the reservation verb has exactly the classified callers');
  const publicReexports = files
    .filter(({file, source}) => file !== OWNER_FILE &&
      /export\s*\{[^}]*\breserveBootIncarnation\b[^}]*\}/u.test(source))
    .map(({file, source}) => ({
      file,
      fromOwner: /export\s*\{\s*reserveBootIncarnation\s*\}\s*from\s*'\.\/boot-incarnation-owner\.js'/u
        .test(source),
    }));
  t.same(publicReexports, [{file: PUBLIC_REEXPORT_FILE, fromOwner: true}],
    'the public surface re-exports the owner\'s own operation, not a new ' +
    'issuer');
  t.end();
});

test('every node boot lifecycle component refuses a missing or unissued ' +
  'incarnation (typed), never defaulting to 0', async (t) => {
  const {BOOT_INCARNATION_REQUIRED} =
    await import('../../src/bootstrap/boot-incarnation-contract.js');
  const {HeartbeatService} =
    await import('../../src/control-plane/heartbeat-service.js');
  const {MessageRouter} = await import('../../src/transport/message-router.js');
  const {RejoinHintsPersistenceService} =
    await import('../../src/bootstrap/rejoin-hints.js');
  const components = {
    HeartbeatService: (bootIncarnation) =>
      new HeartbeatService({nodeId: 'census-node', bootIncarnation}),
    MessageRouter: (bootIncarnation) =>
      new MessageRouter({nodeId: 'census-node', bootIncarnation}),
    RejoinHintsPersistenceService: (bootIncarnation) =>
      new RejoinHintsPersistenceService({
        nodeId: 'census-node', bootIncarnation,
      }),
  };
  for (const [subject, construct] of Object.entries(components)) {
    for (const bootIncarnation of [undefined, null, 0, -1, 1.5]) {
      t.throws(() => construct(bootIncarnation),
        {code: BOOT_INCARNATION_REQUIRED, subject},
        `${subject} refuses incarnation ${String(bootIncarnation)}`);
    }
  }
  t.end();
});
