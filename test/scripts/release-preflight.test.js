/**
 * Release preflight: five facts, pure decisions, exact commands, and no
 * side effects beyond fetch/read operations. A missing durable proof receipt,
 * a dirty tree, a HEAD that is not origin/main, a disagreeing version literal,
 * a missing changelog section or an existing tag each block on their own.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {OUTCOME as PROOF_OUTCOME, PROOF} from '../../scripts/proof-authority.js';
import {
  CHECK,
  evaluateReleasePreflight,
  gatherReleaseFacts,
  parseArguments,
  renderPreflight,
  runReleasePreflight,
} from '../../scripts/release-preflight.js';

const VERSION = '0.2.0';
const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const RECEIPT_OBJECT = 'c'.repeat(40);

function provenProof() {
  return {
    outcome: PROOF_OUTCOME.PROVEN,
    proofId: PROOF.RELEASE_FULL,
    subjectSha: HEAD,
    objectSha: RECEIPT_OBJECT,
    receipt: {proofId: PROOF.RELEASE_FULL, subjectSha: HEAD, outcome: 'passed'},
  };
}

function facts(overrides = {}) {
  return {
    version: VERSION,
    tag: `v${VERSION}`,
    remote: 'origin',
    repository: 'psvensson/lagrange',
    headSha: HEAD,
    remoteMainSha: HEAD,
    statusLines: [],
    releaseProof: provenProof(),
    versionSources: {
      packageJson: VERSION, packageLock: VERSION, cli: VERSION,
      entrypoint: VERSION, chart: VERSION, chartApp: VERSION,
    },
    changelog: {present: true, problem: ''},
    localTags: [],
    remoteTagLines: [],
    ...overrides,
  };
}

function failing(result) {
  return result.checks.filter((check) => !check.ok).map((check) => check.id);
}

test('all five facts green is READY with the exact tag commands', (t) => {
  const result = evaluateReleasePreflight(facts());
  t.equal(result.ok, true);
  t.same(failing(result), []);
  t.same(result.commands, [
    `git tag -a v${VERSION} -m "lagrange-server ${VERSION}" ${HEAD}`,
    `git push origin v${VERSION}`,
  ]);
  const rendered = renderPreflight(result);
  t.match(rendered, /READY/);
  t.match(rendered, /release-full-v1 receipt/);
  t.match(rendered, /git push origin v0\.2\.0/);
  t.end();
});

test('durable receipt is the sole proof authority, not workflow history', (t) => {
  const result = evaluateReleasePreflight(facts({
    releaseProof: {
      outcome: PROOF_OUTCOME.UNPROVEN,
      proofId: PROOF.RELEASE_FULL,
      subjectSha: HEAD,
    },
    workflowRuns: [{
      id: 33985719322,
      path: '.github/workflows/full-gate.yml',
      head_sha: HEAD,
      status: 'completed',
      conclusion: 'success',
    }],
  }));
  t.equal(result.ok, false);
  t.same(failing(result), [CHECK.RELEASE_PROOF]);
  t.match(result.checks[2].detail, /no release-full-v1 receipt exists/);
  t.end();
});

test('each fact blocks on its own', (t) => {
  t.same(failing(evaluateReleasePreflight(facts({
    statusLines: [' M src/x.js'],
  }))), [CHECK.CLEAN_TREE]);
  t.same(failing(evaluateReleasePreflight(facts({remoteMainSha: OTHER}))),
    [CHECK.HEAD_IS_REMOTE_MAIN]);
  t.same(failing(evaluateReleasePreflight(facts({
    releaseProof: {outcome: PROOF_OUTCOME.UNPROVEN},
  }))), [CHECK.RELEASE_PROOF]);
  const unavailable = evaluateReleasePreflight(facts({
    releaseProof: {outcome: PROOF_OUTCOME.UNAVAILABLE, because: 'remote down'},
  }));
  t.same(failing(unavailable), [CHECK.RELEASE_PROOF]);
  t.match(unavailable.checks[2].detail, /authority unavailable: remote down/);
  const versions = evaluateReleasePreflight(facts({
    versionSources: {
      packageJson: VERSION, packageLock: '0.1.1', cli: VERSION,
      entrypoint: VERSION, chart: VERSION, chartApp: '',
    },
  }));
  t.same(failing(versions), [CHECK.VERSIONS_AGREE]);
  t.match(versions.checks[3].detail, /packageLock=0\.1\.1, chartApp=absent/);
  const changelog = evaluateReleasePreflight(facts({
    changelog: {present: false, problem: 'CHANGELOG.md has no section'},
  }));
  t.same(failing(changelog), [CHECK.VERSIONS_AGREE]);
  t.match(changelog.checks[3].detail, /has no section/);
  t.same(failing(evaluateReleasePreflight(facts({localTags: ['v0.2.0']}))),
    [CHECK.TAG_ABSENT]);
  t.same(failing(evaluateReleasePreflight(facts({
    remoteTagLines: [`${OTHER}\trefs/tags/v0.2.0`],
  }))), [CHECK.TAG_ABSENT]);
  const blocked = renderPreflight(evaluateReleasePreflight(facts({
    localTags: ['v0.2.0'],
  })));
  t.match(blocked, /BLOCKED/);
  t.match(blocked, /nothing was tagged/);
  t.notMatch(blocked, /git push/);
  t.same(
    evaluateReleasePreflight(facts({localTags: ['v0.2.0']})).commands, [],
    'a blocked result carries no commands, in JSON either',
  );
  t.end();
});

test('gatherReleaseFacts reads git and asks the proof authority once', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preflight-'));
  fs.mkdirSync(path.join(root, 'charts/lagrange-node'), {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    version: VERSION,
    repository: {url: 'git+https://github.com/psvensson/lagrange.git'},
  }));
  fs.writeFileSync(path.join(root, 'package-lock.json'),
    JSON.stringify({version: VERSION}));
  fs.writeFileSync(path.join(root, 'charts/lagrange-node/Chart.yaml'),
    `version: ${VERSION}\nappVersion: "${VERSION}"\n`);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'),
    `# Changelog\n\n## [Unreleased]\n\n## [${VERSION}] — 2026-09-05\n\n` +
    '### Added\n- something\n\n[Unreleased]: https://x/compare/v0.2.0...HEAD\n');
  const gitCalls = [];
  const git = (args) => {
    gitCalls.push(args.join(' '));
    const [verb] = args;
    if (verb === 'rev-parse') return args[1] === 'HEAD' ? HEAD : HEAD;
    if (verb === 'status') return ' M solve/x.json\n';
    if (verb === 'tag') return '';
    if (verb === 'ls-remote') return '';
    return '';
  };
  const proofCalls = [];
  const proofResolver = (request) => {
    proofCalls.push(request);
    return provenProof();
  };
  const gathered = gatherReleaseFacts({
    root, git, proofResolver,
    sourceVersions: {cli: VERSION, entrypoint: VERSION},
  });
  t.equal(gathered.repository, 'psvensson/lagrange');
  t.equal(gathered.headSha, HEAD);
  t.equal(gathered.releaseProof.outcome, PROOF_OUTCOME.PROVEN);
  t.same(gathered.statusLines, ['M solve/x.json'],
    'status output is reported verbatim; git itself applies the solve/ exclusion');
  t.equal(gathered.changelog.present, true);
  t.same(gathered.versionSources, {
    packageJson: VERSION, packageLock: VERSION, cli: VERSION,
    entrypoint: VERSION, chart: VERSION, chartApp: VERSION,
  });
  t.same(gitCalls, [
    'fetch --quiet origin',
    'rev-parse HEAD',
    'rev-parse origin/main',
    'status --porcelain -- . :!solve',
    'tag --list v0.2.0',
    'ls-remote --tags origin refs/tags/v0.2.0',
  ], 'reads only; no tag, no push');
  t.same(proofCalls, [{
    proofId: PROOF.RELEASE_FULL,
    sha: HEAD,
    remote: 'origin',
    root,
  }]);
  const lines = [];
  const run = runReleasePreflight({
    root, git, proofResolver,
    sourceVersions: {cli: VERSION, entrypoint: VERSION},
    log: (line) => lines.push(line),
  });
  t.equal(run.exitCode, 1, 'the dirty status line blocks');
  t.match(lines.join('\n'), /FAIL clean_release_content/);
  const asJson = [];
  runReleasePreflight({
    root,
    git: (args) => (args[0] === 'status' ? '' : git(args)),
    proofResolver,
    sourceVersions: {cli: VERSION, entrypoint: VERSION},
    json: true,
    log: (line) => asJson.push(line),
  });
  t.equal(JSON.parse(asJson[0]).ok, true);
  t.same(parseArguments(['--json', '--remote', 'upstream']),
    {json: true, remote: 'upstream'});
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
