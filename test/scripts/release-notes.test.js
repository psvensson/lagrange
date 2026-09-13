/**
 * Unit + wiring tests: per-release notes renderer (scripts/release-notes.js).
 *
 * release.yml uses this script as the fail-fast release gate (tag must have a
 * non-empty CHANGELOG section matching package.json's version) and to render
 * the GitHub release-page body. Docker Hub intentionally does not route through
 * this renderer: its one authored overview owner is the exact tagged README.md.
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  assertReleaseVersions,
  extractChangelogSection,
  extractReleasedSections,
  renderGitHubReleaseNotes,
} from '../../scripts/release-notes.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, '../..');

const SAMPLE_CHANGELOG = [
  '# Changelog',
  '',
  'Preamble.',
  '',
  '## [Unreleased]',
  '',
  '### Removed',
  '- Unreleased item that must never leak into release notes.',
  '',
  '## [0.2.0] — 2026-08-01',
  '',
  '### Added',
  '- Second-release feature.',
  '',
  '## [0.1.0] — 2026-07-02',
  '',
  'First tagged release.',
  '',
  '### Fixed',
  '- A first-release fix.',
  '',
  '[Unreleased]: https://example.org/compare/v0.2.0...HEAD',
  '[0.2.0]: https://example.org/releases/tag/v0.2.0',
  '[0.1.0]: https://example.org/releases/tag/v0.1.0',
].join('\n');

test('extractReleasedSections: newest first, Unreleased skipped, link defs trimmed', async (t) => {
  const sections = extractReleasedSections(SAMPLE_CHANGELOG);
  t.equal(sections.length, 2, 'two released sections');
  t.equal(sections[0].version, '0.2.0');
  t.equal(sections[0].date, '2026-08-01');
  t.equal(sections[0].body, '### Added\n- Second-release feature.');
  t.equal(sections[1].version, '0.1.0');
  t.notMatch(sections[1].body, /\[0\.1\.0\]:/, 'trailing link definitions trimmed');
  t.match(sections[1].body, /A first-release fix\./);
  t.notOk(
    sections.some((section) => /never leak/.test(section.body)),
    'Unreleased content excluded',
  );
});

test('extractChangelogSection: missing or empty section throws (release gate)', async (t) => {
  t.throws(
    () => extractChangelogSection(SAMPLE_CHANGELOG, '9.9.9'),
    /no "## \[9\.9\.9\]" section/,
  );
  const emptySection = '# Changelog\n\n## [0.3.0] — 2026-09-01\n\n## [0.2.0] — 2026-08-01\n\n- x\n';
  t.throws(() => extractChangelogSection(emptySection, '0.3.0'), /is empty/);
  t.equal(extractChangelogSection(SAMPLE_CHANGELOG, '0.2.0').version, '0.2.0');
});

test('assertReleaseVersions: package and chart versions must match the tag', async (t) => {
  const chart = 'version: 0.2.0\nappVersion: "0.2.0"\n';
  t.doesNotThrow(() => assertReleaseVersions('0.2.0', '0.2.0', chart));
  t.throws(
    () => assertReleaseVersions('0.2.0', '0.1.0', chart),
    /package\.json=0\.1\.0/u,
  );
  t.throws(
    () => assertReleaseVersions(
      '0.2.0',
      '0.2.0',
      'version: 0.1.0\nappVersion: "0.2.0"\n',
    ),
    /Chart\.yaml version=0\.1\.0/u,
  );
});

test('renderGitHubReleaseNotes: changelog body + image refs + tagged links', async (t) => {
  const notes = renderGitHubReleaseNotes(extractChangelogSection(SAMPLE_CHANGELOG, '0.2.0'));
  t.match(notes, /Lagrange 0\.2\.0 — 2026-08-01/);
  t.match(notes, /Second-release feature\./, 'contains the concrete changes');
  t.match(notes, /docker\.io\/psvensson\/lagrange:0\.2\.0/);
  t.notMatch(notes, /codeberg|forgejo/iu);
  t.match(notes, /blob\/v0\.2\.0\/CHANGELOG\.md/, 'changelog link pinned to the tag');
  t.notMatch(notes, /never leak/);
});

test('fenced heading-looking lines do not split changelog sections', async (t) => {
  const fenced = '### Added\n```sh\n# a shell comment\n## [9.9.9] — 2099-01-01\n```\n### Fixed';
  const changelog = `# Changelog\n\n## [0.2.0] — 2026-08-01\n\n${fenced}\n\n## [0.1.0] — 2026-07-02\n\n- real\n`;
  const sections = extractReleasedSections(changelog);
  t.equal(sections.length, 2, 'heading-looking line inside a fence is not a section boundary');
  t.match(sections[0].body, /\[9\.9\.9\]/, 'fence content stays in the enclosing section');
});

test('wiring: the real CHANGELOG.md satisfies the release gate', async (t) => {
  const changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  const packageVersion = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
  ).version;
  // The dated section for package.json's version is cut when the version is
  // released (RELEASE.md); until then the notes accumulate under
  // [Unreleased], which must not be empty while the version is uncut.
  const released = extractReleasedSections(changelog)
    .find((section) => section.version === packageVersion);
  if (released) {
    t.ok(released.body.length > 0, `CHANGELOG has a non-empty [${packageVersion}] section`);
  } else {
    const unreleased = /## \[Unreleased\]\n([\s\S]*?)\n## \[/u.exec(changelog);
    t.ok(
      unreleased && unreleased[1].trim().length > 0,
      `CHANGELOG keeps non-empty [Unreleased] notes until [${packageVersion}] is cut`,
    );
    t.throws(
      () => extractChangelogSection(changelog, packageVersion),
      /Move the \[Unreleased\] items/u,
      'the tag-time gate still refuses to release an uncut version',
    );
  }
});
