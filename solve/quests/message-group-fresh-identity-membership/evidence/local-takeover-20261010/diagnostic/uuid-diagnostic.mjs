// Explicit diagnostic adapter, NOT the package-lock uuid implementation.
// Only v4 generation and simple canonical validation are needed in this fixture.
import {randomUUID} from 'node:crypto';
export const v4 = () => randomUUID();
export const validate = (value) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
