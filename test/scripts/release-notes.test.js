/**
 * Unit + wiring tests: per-release notes renderer (scripts/release-notes.js).
 *
 * release.yml uses this script as the fail-fast release gate (tag must have a
 * non-empty CHANGELOG section matching package.json's version, or non-empty
 * [Unreleased] notes while that version is not yet cut) and as the
 * renderer for both the GitHub release-page body and the Docker Hub
 * repository description. The wiring tests pin the real repo files (the
 * committed CHANGELOG.md parses; docs/dockerhub-overview.md carries the
 * injection markers) so a drift there fails here, not on release day.
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  DOCKERHUB_DESCRIPTION_MAX_BYTES,
  OVERVIEW_MARKER_BEGIN,
  OVERVIEW_MARKER_END,
  assertReleaseVersions,
  demoteHeadings,
  extractChangelogSection,
  extractReleasedSections,
  renderDockerhubOverview,
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

const MARKED_TEMPLATE = [
  '# Lagrange',
  '',
  'Intro.',
  '',
  OVERVIEW_MARKER_BEGIN,
  OVERVIEW_MARKER_END,
  '',
  '## Quick start',
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
    sections.some((s) => /never leak/.test(s.body)),
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

test('renderDockerhubOverview: injects per-release sections between markers', async (t) => {
  const rendered = renderDockerhubOverview({
    template: MARKED_TEMPLATE,
    sections: extractReleasedSections(SAMPLE_CHANGELOG),
  });
  t.match(rendered, /## Release notes/);
  t.match(rendered, /### 0\.2\.0 — 2026-08-01/);
  t.match(rendered, /#### Added/, 'body headings demoted below the version heading');
  t.match(rendered, /### 0\.1\.0 — 2026-07-02/);
  t.match(rendered, /releases\/tag\/v0\.2\.0/, 'links each version to its release page');
  t.match(rendered, /## Quick start/, 'template content outside markers preserved');
  t.ok(rendered.includes(OVERVIEW_MARKER_BEGIN) && rendered.includes(OVERVIEW_MARKER_END),
    'markers survive so re-rendering stays idempotent');

  const again = renderDockerhubOverview({
    template: rendered,
    sections: extractReleasedSections(SAMPLE_CHANGELOG),
  });
  t.equal(again, rendered, 'idempotent when re-rendered over its own output');
});

test('renderDockerhubOverview: degrades oldest sections to links under the char cap', async (t) => {
  const bigBody = `### Added\n- ${'x'.repeat(400)}`;
  const sections = Array.from({length: 10}, (_, i) => ({
    version: `0.${9 - i}.0`,
    date: '2026-01-01',
    body: bigBody,
  }));
  const rendered = renderDockerhubOverview({
    template: MARKED_TEMPLATE,
    sections,
    maxBytes: 2000,
  });
  t.ok(Buffer.byteLength(rendered, 'utf8') <= 2000, 'respects the byte cap');
  t.match(rendered, /### 0\.9\.0/, 'newest keeps its full body');
  t.match(rendered, /- \*\*0\.0\.0\*\* \(2026-01-01\) — \[release notes\]/, 'oldest degrades to a link line');
  for (const section of sections) {
    t.match(rendered, new RegExp(section.version.replace(/\./g, '\\.')), 'no version dropped');
  }

  t.throws(
    () => renderDockerhubOverview({template: MARKED_TEMPLATE, sections, maxBytes: 100}),
    /exceeds 100 bytes/,
    'impossible cap is a hard error, not silent truncation',
  );
  t.throws(
    () => renderDockerhubOverview({template: 'no markers here', sections}),
    /marker pair/,
  );
});

test('demoteHeadings shifts every heading level by one', async (t) => {
  t.equal(demoteHeadings('### Added\ntext\n#### Deep'), '#### Added\ntext\n##### Deep');
});

test('fenced code blocks are inert: no heading demotion, no section splitting', async (t) => {
  const fenced = '### Added\n```sh\n# a shell comment\n## [9.9.9] — 2099-01-01\n```\n### Fixed';
  t.equal(
    demoteHeadings(fenced),
    '#### Added\n```sh\n# a shell comment\n## [9.9.9] — 2099-01-01\n```\n#### Fixed',
    'headings demoted outside the fence only',
  );

  const changelog = `# Changelog\n\n## [0.2.0] — 2026-08-01\n\n${fenced}\n\n## [0.1.0] — 2026-07-02\n\n- real\n`;
  const sections = extractReleasedSections(changelog);
  t.equal(sections.length, 2, 'heading-looking line inside a fence is not a section boundary');
  t.match(sections[0].body, /\[9\.9\.9\]/, 'fence content stays in the enclosing section');
});

test('wiring: the real CHANGELOG.md and dockerhub-overview.md satisfy the release gate', async (t) => {
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

  const template = readFileSync(join(REPO_ROOT, 'docs/dockerhub-overview.md'), 'utf8');
  const rendered = renderDockerhubOverview({
    template,
    sections: extractReleasedSections(changelog),
  });
  t.ok(
    Buffer.byteLength(rendered, 'utf8') <= DOCKERHUB_DESCRIPTION_MAX_BYTES,
    'rendered overview fits Docker Hub full_description limit',
  );
  t.match(rendered, /## Release notes/);
});
