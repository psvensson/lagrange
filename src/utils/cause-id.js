import {v4 as uuidv4} from 'uuid';
import {NUM, TYPEOF} from '../constants/index.js';

function normalizeCauseId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === NUM.ZERO) {
    return null;
  }

  return trimmed;
}

function getOrCreateCauseId(causeId) {
  return normalizeCauseId(causeId) || uuidv4();
}

export {getOrCreateCauseId, normalizeCauseId};

