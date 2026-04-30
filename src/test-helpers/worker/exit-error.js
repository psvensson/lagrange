const LOCAL_STR_EXITERROR = 'ExitError';

/**
 * Shared error used by test helper workers to intercept `process.exit(code)`.
 *
 * This file exists to avoid duplicated class declarations in multiple worker
 * entrypoints (which breaks the "Code Path Uniqueness" property test).
 */

export class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.name = LOCAL_STR_EXITERROR;
    this.code = code;
  }
}

