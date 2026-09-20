// The membership-publication-epoch census: ONE owner for the scan, shared by
// the census test and the inventory it checks (quest
// critical-spread-overflow-budget-audit).
//
// Round 1 scanned for identifiers that SPELL a publication, membership or
// planning epoch. That misses every alias that carries the value under
// another name, and the verifier found fourteen of them with a single
// same-line binding probe. This census is DATA-FLOW aware to a stated depth:
//
//   seed     every identifier matching the concept pattern, plus the
//            carrier's own named values and reason codes, which spell the
//            concept in words rather than in an identifier;
//   step     on any line that mentions a known concept token, every OTHER
//            epoch-ish identifier bound from it, or assigned into it, on the
//            SAME statement becomes a concept token;
//   repeat   until no new token is found (a fixed point).
//
// A fourth rule follows renames whose TARGET NAME does not spell epoch at
// all - `stamp`, `publicationRevision`, `source_snapshot_version`, `value` -
// because a rename does not have to keep the word. Those are inventoried as
// RENAME SITES, at one hop: the site is recorded with what it was bound
// from, and the new identifier is NOT promoted to a concept token, because
// names like `value` and `matches` would then match half the tree. That is
// the stated depth, not a claim of completeness.
//
// What it still cannot see is stated in the inventory's limits: a bare
// `epoch` property name, a computed key, any flow that crosses a function
// boundary without a same-line binding, and any rename site beyond the first
// hop.
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIRECTORY = 'src';
const JS_SUFFIX = '.js';
const UTF8 = 'utf8';
// Identifiers that SPELL the concept.
const CONCEPT_PATTERN =
  /[A-Za-z0-9_$]*(?:[Pp]ublication_?[Ee]poch|[Mm]embership_?[Ee]poch|[Pp]lanning_?[Ee]poch|PUBLICATION_EPOCH|MEMBERSHIP_EPOCH|PLANNING_EPOCH)[A-Za-z0-9_$]*/gu;
// Any identifier that mentions an epoch at all. The candidates for the
// data-flow step are drawn from here.
const ANY_EPOCH_PATTERN = /[A-Za-z0-9_$]*(?:[Ee]poch|EPOCH)[A-Za-z0-9_$]*/gu;
// The carrier's own tokens. They are part of the domain - they are the named
// values and reason codes the epoch criterion produces - but they do not
// spell "publication epoch", so no pattern over identifiers finds them.
const CARRIER_TOKENS = Object.freeze([
  'SPREAD_CURE_PARTITION_EPOCH_NOT_READ',
  'MEMBERSHIP_GENERATION_STALE',
  'authorization_membership_generation_stale',
  'MEMBERSHIP_FENCE_NOT_EVALUATED',
  'authorization_membership_fence_not_evaluated',
  'not_read_by_the_carrier',
]);
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/u;
const MAX_ITERATIONS = 10;
// `X = <maybe.a.path.>knownToken` or `X: <...>knownToken`, ending the
// statement. The captured X is the renamed-into identifier.
const RENAME_BINDING =
  /(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:[\w$]+(?:\?\.|\.))*([A-Za-z_$][\w$]*)\s*[,;]?\s*$/u;
const EPOCH_IN_NAME = /epoch/iu;

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(JS_SUFFIX)) {
      out.push(full);
    }
  }
  return out;
}

function readSourceLines(root) {
  const files = [];
  for (const file of listSourceFiles(path.join(root, SRC_DIRECTORY)).sort()) {
    files.push({
      file: path.relative(root, file),
      lines: fs.readFileSync(file, UTF8).split('\n'),
    });
  }
  return files;
}

function matchAll(line, pattern) {
  return [...line.matchAll(pattern)].map((match) => match[0]);
}

function tokensOnLine(line, known) {
  const spelled = matchAll(line, CONCEPT_PATTERN);
  const carried = CARRIER_TOKENS.filter((token) => line.includes(token));
  const aliased = matchAll(line, ANY_EPOCH_PATTERN)
    .filter((token) => known.has(token));
  return new Set([...spelled, ...carried, ...aliased]);
}

// The data-flow step: `other = ...concept...`, `other: concept`, or
// `concept: other`, all on one line.
function bindsConcept(line, candidate, known) {
  for (const concept of known) {
    const escaped = concept.replace(/[$]/gu, '\\$');
    const assignment =
      new RegExp(`\\b${candidate}\\b\\s*[:=][^=]?[^;]*\\b${escaped}\\b`, 'u');
    const reverse =
      new RegExp(`\\b${escaped}\\b\\s*:\\s*${candidate}\\b`, 'u');
    if (assignment.test(line) || reverse.test(line)) {
      return true;
    }
  }
  return false;
}

// A bare `epoch` names half a dozen unrelated concepts in this repository,
// so it is never a candidate. The blind spot that creates is disclosed in
// the inventory's limits.
function isBareEpoch(token) {
  return token === 'epoch' || token === 'Epoch' || token === 'EPOCH';
}

function discoverOnLine(line, known) {
  if (COMMENT_LINE.test(line)) {
    return [];
  }
  const present = tokensOnLine(line, known);
  if (present.size === 0) {
    return [];
  }
  const found = [];
  for (const candidate of matchAll(line, ANY_EPOCH_PATTERN)) {
    if (known.has(candidate) || isBareEpoch(candidate)) {
      continue;
    }
    if (bindsConcept(line, candidate, present)) {
      found.push(candidate);
    }
  }
  return found;
}

function discoverAliases(files, seed) {
  const known = new Set(seed);
  for (let round = 0; round < MAX_ITERATIONS; round += 1) {
    let added = 0;
    for (const entry of files) {
      for (const line of entry.lines) {
        for (const token of discoverOnLine(line, known)) {
          known.add(token);
          added += 1;
        }
      }
    }
    if (added === 0) {
      return {known, rounds: round + 1};
    }
  }
  return {known, rounds: MAX_ITERATIONS};
}

// One hop of rename following: an identifier whose own name does not spell
// epoch, bound directly from a known concept token on the same statement.
function renameSiteOnLine(line, known) {
  if (COMMENT_LINE.test(line)) {
    return null;
  }
  const matched = RENAME_BINDING.exec(line);
  if (!matched) {
    return null;
  }
  const [, renamedInto, boundFrom] = matched;
  if (!known.has(boundFrom) || known.has(renamedInto) ||
      EPOCH_IN_NAME.test(renamedInto)) {
    return null;
  }
  return {token: renamedInto, boundFrom};
}

/**
 * Census the whole concept over src, to a fixed point.
 * @param {string} root the repository root to scan
 * @return {{sites: Array<Object>, tokens: Array<string>, rounds: number,
 *   seedTokens: Array<string>}} the census
 */
function censusMembershipEpochDomain(root) {
  const files = readSourceLines(root);
  const seed = new Set(CARRIER_TOKENS);
  for (const entry of files) {
    for (const line of entry.lines) {
      for (const token of matchAll(line, CONCEPT_PATTERN)) {
        seed.add(token);
      }
    }
  }
  const {known, rounds} = discoverAliases(files, seed);
  const sites = [];
  const renameSites = [];
  for (const entry of files) {
    entry.lines.forEach((line, index) => {
      const present = [...tokensOnLine(line, known)]
        .filter((token) => known.has(token)).sort();
      for (const token of present) {
        sites.push({file: entry.file, line: index + 1, token});
      }
      const renamed = renameSiteOnLine(line, known);
      if (renamed) {
        renameSites.push({file: entry.file, line: index + 1,
          token: renamed.token, boundFrom: renamed.boundFrom});
      }
    });
  }
  return {
    sites,
    renameSites,
    tokens: [...known].sort(),
    seedTokens: [...seed].sort(),
    rounds,
  };
}

export {CARRIER_TOKENS, censusMembershipEpochDomain};
