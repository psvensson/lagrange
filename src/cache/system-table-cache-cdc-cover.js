// Pure normalized-cover mechanics for CDC hydration. A cover is a sorted set
// of key atoms and absence-gap atoms. It carries no retry or publication state.

import {
  compareCdcCoverageKeys,
  keyInCdcCoverageInterval,
} from '../cdc/cdc-coverage-domain.js';
import {digest} from '../utils/canonical-json-data.js';

const CDC_COVERAGE_ATOM_KIND = Object.freeze({
  ABSENCE: 'absence',
  KEY: 'key',
});
const CDC_COVERAGE_OVERLAY_STATE = Object.freeze({
  CONFLICT: 'conflict',
  INSTALLED: 'installed',
  STALE: 'stale',
});

function compareFloor(left, right) {
  return left.logIndex === right.logIndex ? left.ordinal - right.ordinal :
    left.logIndex - right.logIndex;
}

function intervalIsNonEmpty(lower, upper) {
  return lower === null || upper === null ||
    compareCdcCoverageKeys(lower, upper) < 0;
}

function keyInGap(key, atom) {
  const afterLower = atom.lower === null ||
    (atom.lowerOpen ? compareCdcCoverageKeys(key, atom.lower) > 0 :
      compareCdcCoverageKeys(key, atom.lower) >= 0);
  return afterLower && (atom.upper === null ||
    compareCdcCoverageKeys(key, atom.upper) < 0);
}

function atomCoversKey(atom, key) {
  return atom.kind === CDC_COVERAGE_ATOM_KIND.KEY ? atom.key === key :
    keyInGap(key, atom);
}

function atomOverlapsCell(atom, cell) {
  if (atom.kind === CDC_COVERAGE_ATOM_KIND.KEY) {
    return keyInCdcCoverageInterval(atom.key, cell.lower, cell.upper);
  }
  return !((atom.upper !== null && cell.lower !== null &&
      compareCdcCoverageKeys(atom.upper, cell.lower) <= 0) ||
    (cell.upper !== null && atom.lower !== null &&
      compareCdcCoverageKeys(cell.upper, atom.lower) <= 0));
}

function absenceAtom(scopeId, domainDigest, lower, upper, lowerOpen, floor) {
  const semanticDigest = digest({kind: CDC_COVERAGE_ATOM_KIND.ABSENCE,
    scopeId, domainDigest, lower, upper, lowerOpen, floor});
  return Object.freeze({kind: CDC_COVERAGE_ATOM_KIND.ABSENCE,
    scopeId, domainDigest, lower, upper, lowerOpen, floor, semanticDigest});
}

function keyAtom(scopeId, domainDigest, key, rowDigest, floor) {
  const semanticDigest = digest({kind: CDC_COVERAGE_ATOM_KIND.KEY,
    scopeId, domainDigest, key, rowDigest, floor});
  return Object.freeze({kind: CDC_COVERAGE_ATOM_KIND.KEY,
    scopeId, domainDigest, key, rowDigest, floor, semanticDigest});
}

function buildCoverageAtoms({scopeId, domainDigest, lower, upper, floor, rows}) {
  const atoms = [];
  let cursor = lower;
  let cursorOpen = false;
  for (const item of rows) {
    if (cursor === null || compareCdcCoverageKeys(cursor, item.key) < 0) {
      atoms.push(absenceAtom(scopeId, domainDigest, cursor, item.key,
        cursorOpen, floor));
    }
    atoms.push(keyAtom(scopeId, domainDigest, item.key, item.rowDigest, floor));
    cursor = item.key;
    cursorOpen = true;
  }
  if (upper === null || cursor === null ||
      compareCdcCoverageKeys(cursor, upper) < 0) {
    atoms.push(absenceAtom(scopeId, domainDigest, cursor, upper,
      cursorOpen, floor));
  }
  return atoms;
}

function compareAtomOrder(left, right) {
  const leftKey = left.kind === CDC_COVERAGE_ATOM_KIND.KEY ? left.key : left.lower;
  const rightKey = right.kind === CDC_COVERAGE_ATOM_KIND.KEY ? right.key : right.lower;
  if (leftKey === null) return rightKey === null ? -1 : -1;
  if (rightKey === null) return 1;
  const compared = compareCdcCoverageKeys(leftKey, rightKey);
  if (compared !== 0) return compared;
  return left.kind === CDC_COVERAGE_ATOM_KIND.ABSENCE ? -1 : 1;
}

function sameAbsence(left, right) {
  return left.kind === CDC_COVERAGE_ATOM_KIND.ABSENCE &&
    right.kind === CDC_COVERAGE_ATOM_KIND.ABSENCE &&
    left.scopeId === right.scopeId && left.domainDigest === right.domainDigest &&
    compareFloor(left.floor, right.floor) === 0;
}

function coalesceCoverageAtoms(values) {
  const sorted = [...values].sort(compareAtomOrder);
  const atoms = [];
  for (const atom of sorted) {
    const prior = atoms.at(-1);
    if (prior && sameAbsence(prior, atom) && prior.upper !== null &&
        atom.lower !== null &&
        compareCdcCoverageKeys(prior.upper, atom.lower) === 0 &&
        atom.lowerOpen === false) {
      atoms[atoms.length - 1] = absenceAtom(prior.scopeId,
        prior.domainDigest, prior.lower, atom.upper, prior.lowerOpen, prior.floor);
    } else {
      atoms.push(atom);
    }
  }
  return atoms;
}

function trimAtomOutsideCell(atom, cell) {
  if (!atomOverlapsCell(atom, cell)) return [atom];
  if (atom.kind === CDC_COVERAGE_ATOM_KIND.KEY) return [];
  const retained = [];
  if (cell.lower !== null &&
      (atom.lower === null || compareCdcCoverageKeys(atom.lower, cell.lower) < 0)) {
    retained.push(absenceAtom(atom.scopeId, atom.domainDigest, atom.lower,
      cell.lower, atom.lowerOpen, atom.floor));
  }
  if (cell.upper !== null &&
      (atom.upper === null || compareCdcCoverageKeys(cell.upper, atom.upper) < 0)) {
    retained.push(absenceAtom(atom.scopeId, atom.domainDigest, cell.upper,
      atom.upper, false, atom.floor));
  }
  return retained.filter((candidate) =>
    intervalIsNonEmpty(candidate.lower, candidate.upper));
}

function trimCoverageAtomsOutsideCell(atoms, cell) {
  return coalesceCoverageAtoms(atoms.flatMap(
    (atom) => trimAtomOutsideCell(atom, cell)));
}

function equalFloorOverlapConflicts(oldAtom, incomingAtom) {
  if (oldAtom.kind === CDC_COVERAGE_ATOM_KIND.KEY &&
      incomingAtom.kind === CDC_COVERAGE_ATOM_KIND.KEY) {
    return oldAtom.key === incomingAtom.key &&
      oldAtom.rowDigest !== incomingAtom.rowDigest;
  }
  return oldAtom.kind !== incomingAtom.kind;
}

function compareAtomOverlap(prior, next) {
  const overlaps = next.kind === CDC_COVERAGE_ATOM_KIND.KEY ?
    atomCoversKey(prior, next.key) :
    prior.kind === CDC_COVERAGE_ATOM_KIND.KEY ?
      keyInGap(prior.key, next) :
      atomOverlapsCell(prior, next);
  if (!overlaps) return null;
  const compared = compareFloor(next.floor, prior.floor);
  if (compared < 0) return CDC_COVERAGE_OVERLAY_STATE.STALE;
  if (compared === 0 && equalFloorOverlapConflicts(prior, next)) {
    return CDC_COVERAGE_OVERLAY_STATE.CONFLICT;
  }
  return null;
}

function overlayCoverageAtoms(existing, incoming, cell) {
  for (const next of incoming) {
    for (const prior of existing) {
      const match = compareAtomOverlap(prior, next);
      if (match !== null) {
        return {state: match, atoms: existing};
      }
    }
  }
  return {state: CDC_COVERAGE_OVERLAY_STATE.INSTALLED,
    atoms: coalesceCoverageAtoms([
      ...trimCoverageAtomsOutsideCell(existing, cell), ...incoming,
    ])};
}

function coveringCoverageAtom(atoms, key) {
  return atoms.find((atom) => atomCoversKey(atom, key)) ?? null;
}

function coverageAtomsRetainedBytes(atoms) {
  let bytes = 0;
  for (const atom of atoms) bytes += Buffer.byteLength(JSON.stringify(atom));
  return bytes;
}

function coverageAtomsStats(scopes) {
  let atoms = 0;
  let bytes = 0;
  for (const scope of scopes.values()) {
    for (const cover of scope.coverByTable.values()) {
      atoms += cover.length;
      bytes += coverageAtomsRetainedBytes(cover);
    }
  }
  return {atoms, bytes};
}

export {
  CDC_COVERAGE_ATOM_KIND,
  buildCoverageAtoms,
  compareFloor,
  coveringCoverageAtom,
  coverageAtomsRetainedBytes,
  coverageAtomsStats,
  overlayCoverageAtoms,
  trimCoverageAtomsOutsideCell,
};
