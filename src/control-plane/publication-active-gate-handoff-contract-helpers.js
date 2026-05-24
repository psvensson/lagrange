import {NUM, TYPEOF} from '../constants/index.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_INTEGER,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_JOINED_LIST_SEPARATORS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_STATUS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER,
  PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
} from './publication-active-gate-handoff-contract-constants.js';

function isPublicationActiveGateHandoffRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizePublicationActiveGateHandoffNodeId(value) {
  const normalizedValue = String(
    value || PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).trim();
  return normalizedValue.length > NUM.ZERO ? normalizedValue : null;
}

function coercePublicationActiveGateHandoffNodeIdValues(values) {
  if (Array.isArray(values)) {
    return values;
  }
  if (typeof values !== TYPEOF.STRING) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return PUBLICATION_ACTIVE_GATE_HANDOFF_JOINED_LIST_SEPARATORS.reduce(
    (fragments, separator) =>
      fragments.flatMap((fragment) => fragment.split(separator)),
    [values],
  );
}

function normalizePublicationActiveGateHandoffNodeIdList(
  values = PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
) {
  return Object.freeze(
    [
      ...new Set(
        coercePublicationActiveGateHandoffNodeIdValues(values)
          .map((value) =>
            normalizePublicationActiveGateHandoffNodeId(value),
          )
          .filter((value) => value !== null),
      ),
    ].sort((left, right) => left.localeCompare(right)),
  );
}

function normalizePublicationActiveGateHandoffText(value) {
  const normalizedValue = String(
    value || PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).trim();
  return normalizedValue.length > NUM.ZERO ?
    normalizedValue :
    PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT;
}

function normalizePublicationActiveGateHandoffInteger(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
}

function normalizePublicationActiveGateHandoffDebtCount(
  value,
  nodeIds = PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
) {
  const normalizedValue = normalizePublicationActiveGateHandoffInteger(value);
  return Math.max(
    NUM.ZERO,
    normalizedValue === null ? NUM.ZERO : normalizedValue,
    normalizePublicationActiveGateHandoffNodeIdList(nodeIds).length,
  );
}

function normalizePublicationActiveGateHandoffStateMarker(value) {
  return String(
    value || PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).trim().toLowerCase();
}

function hasPublicationActiveGateHandoffStaleMarker(...values) {
  return values
    .map((value) => normalizePublicationActiveGateHandoffStateMarker(value))
    .some((value) =>
      value === PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER.STALE ||
      value === PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER.STALE_USABLE ||
      value === PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER.BEHIND,
    );
}

function resolvePublicationActiveGateHandoffFirstInteger(...values) {
  for (const value of values) {
    const normalizedValue =
      normalizePublicationActiveGateHandoffInteger(value);
    if (normalizedValue !== null) {
      return normalizedValue;
    }
  }
  return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_INTEGER;
}

function resolvePublicationActiveGateHandoffPublicationEpoch(
  publicationConvergence = null,
) {
  const publicationEpoch = Number(
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
    ],
  );
  return Number.isFinite(publicationEpoch) ?
    Math.floor(publicationEpoch) :
    PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH;
}

function resolvePublicationActiveGateHandoffPublicationRevision(
  publicationConvergence = null,
) {
  return resolvePublicationActiveGateHandoffFirstInteger(
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_REVISION
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SOURCE_SNAPSHOT_VERSION
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SOURCE_SNAPSHOT_VERSION_SNAKE
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UPDATEDAT
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UPDATED_AT
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
    ],
  );
}

function resolvePublicationActiveGateHandoffPublicationStatus(
  publicationConvergence = null,
) {
  return String(
    publicationConvergence?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATUS] ||
      publicationConvergence?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_STATUS
      ] ||
      publicationConvergence?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION
      ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATUS] ||
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).toUpperCase();
}

function resolvePublicationActiveGateHandoffQuorumCount(targetNodeIds = []) {
  if (targetNodeIds.length === NUM.ZERO) {
    return NUM.ZERO;
  }
  return Math.floor(targetNodeIds.length / NUM.TWO) + NUM.ONE;
}

export {
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffNodeId,
  coercePublicationActiveGateHandoffNodeIdValues,
  normalizePublicationActiveGateHandoffNodeIdList,
  normalizePublicationActiveGateHandoffText,
  normalizePublicationActiveGateHandoffInteger,
  normalizePublicationActiveGateHandoffDebtCount,
  normalizePublicationActiveGateHandoffStateMarker,
  hasPublicationActiveGateHandoffStaleMarker,
  resolvePublicationActiveGateHandoffFirstInteger,
  resolvePublicationActiveGateHandoffPublicationEpoch,
  resolvePublicationActiveGateHandoffPublicationRevision,
  resolvePublicationActiveGateHandoffPublicationStatus,
  resolvePublicationActiveGateHandoffQuorumCount,
};
