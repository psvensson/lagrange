import {v4 as uuidv4} from 'uuid';

function normalizeCauseId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function getOrCreateCauseId(causeId) {
  return normalizeCauseId(causeId) || uuidv4();
}

export {getOrCreateCauseId, normalizeCauseId};

