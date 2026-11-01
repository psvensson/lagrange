// SVG status grid shared by every comparative benchmark page. A cell shows its
// admission status word; non-valid cells carry their reason codes in the cell's
// <title> and the page's tables. No value is ever drawn for a missing measurement.
import {CLAIM_CELL_STATUS} from './benchmark-claim-admission.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const NON_NUMERIC_STATUSES = Object.freeze(Object.values(CLAIM_CELL_STATUS));

const STATUS_COLOR = Object.freeze({
  [CLAIM_CELL_STATUS.VALID_OBSERVED]: '#15803d',
  [CLAIM_CELL_STATUS.PRODUCT_FAILURE]: '#c2410c',
  [CLAIM_CELL_STATUS.INVALID_MEASUREMENT]: '#b91c1c',
  [CLAIM_CELL_STATUS.BLOCKED]: '#6d28d9',
  [CLAIM_CELL_STATUS.UNSUPPORTED]: '#475569',
  [CLAIM_CELL_STATUS.NOT_MEASURED]: '#94a3b8',
});

const LABEL_WIDTH = 330;
const CELL_WIDTH = 150;
const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 70;
const SECTION_GAP = 34;
const PAD = 16;

function escapeXml(value) {
  const xmlMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'};
  return stringReplace(String(value ?? ''), /[&<>"']/gu, (c) => xmlMap[c]);
}

/**
 * Format an observed number. A status word passes through; a missing value is
 * rendered as `not-measured`, never as 0.
 * @param {number|string|null|undefined} value
 * @param {number} digits
 * @return {string}
 */
function formatNum(value, digits = 2) {
  if (typeof value === 'number' && numberIsFinite(value)) return numberToFixed(value, digits);
  if (typeof value === 'string' && arrayIncludes(NON_NUMERIC_STATUSES, value)) return value;
  return CLAIM_CELL_STATUS.NOT_MEASURED;
}

function cellTitle(cell) {
  const reasons = cell.reasons.length > 0 ? `: ${arrayJoin(cell.reasons, ', ')}` : '';
  return `${cell.claimKey} ${cell.status}${reasons}`;
}

function renderSvgCell(cell, x, y) {
  const color = STATUS_COLOR[cell.status];
  return `<g><title>${escapeXml(cellTitle(cell))}</title>` +
    `<rect x="${x + 2}" y="${y + 3}" width="${CELL_WIDTH - 4}" height="${ROW_HEIGHT - 6}" ` +
    `rx="4" fill="${color}" fill-opacity="0.15" stroke="${color}"/>` +
    `<text x="${x + CELL_WIDTH / 2}" y="${y + ROW_HEIGHT / 2 + 4}" text-anchor="middle" ` +
    `font-size="11" fill="${color}">${escapeXml(cell.status)}</text></g>`;
}

function renderSvgSection(section, top) {
  const parts = [`<text x="${PAD}" y="${top + 18}" font-size="14" font-weight="600">` +
    `${escapeXml(section.heading)}</text>`];
  section.columns.forEach((col, i) => {
    parts.push(`<text x="${PAD + LABEL_WIDTH + i * CELL_WIDTH + CELL_WIDTH / 2}" ` +
      `y="${top + 40}" text-anchor="middle" font-size="11" fill="#334155">` +
      `${escapeXml(col.label)}</text>`);
  });
  section.rows.forEach((row, r) => {
    const y = top + 48 + r * ROW_HEIGHT;
    parts.push(`<text x="${PAD}" y="${y + ROW_HEIGHT / 2 + 4}" font-size="11">` +
      `${escapeXml(row.label)}</text>`);
    section.columns.forEach((col, i) => {
      const cell = row.cells[col.key];
      if (cell) parts.push(renderSvgCell(cell, PAD + LABEL_WIDTH + i * CELL_WIDTH, y));
    });
  });
  return {svg: arrayJoin(parts, ''), height: 48 + section.rows.length * ROW_HEIGHT + SECTION_GAP};
}

/**
 * Render a page's sections as one SVG status grid.
 * @param {{title: string, sections: Array<Object>}} page
 * @return {string}
 */
function renderStatusGridSvg(page) {
  const maxColumns = Math.max(1, ...arrayMap(page.sections, (s) => s.columns.length));
  const width = PAD * 2 + LABEL_WIDTH + maxColumns * CELL_WIDTH;
  let top = HEADER_HEIGHT;
  const bodies = [];
  for (const section of page.sections) {
    const rendered = renderSvgSection(section, top);
    bodies.push(rendered.svg);
    top += rendered.height;
  }
  const legend = arrayJoin(arrayMap(NON_NUMERIC_STATUSES, (status, i) =>
    `<text x="${PAD + i * 150}" y="52" font-size="11" fill="${STATUS_COLOR[status]}">` +
    `${escapeXml(status)}</text>`), '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${top}" ` +
    `viewBox="0 0 ${width} ${top}" font-family="sans-serif">` +
    '<rect width="100%" height="100%" fill="#ffffff"/>' +
    `<text x="${PAD}" y="28" font-size="18" font-weight="700">${escapeXml(page.title)}</text>` +
    `${legend}${arrayJoin(bodies, '')}</svg>\n`;
}

export {
  NON_NUMERIC_STATUSES,
  STATUS_COLOR,
  escapeXml,
  formatNum,
  renderStatusGridSvg,
};
