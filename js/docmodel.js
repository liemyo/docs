// Document model: defaults, paper sizes, paragraph styles.
import { fontCss } from './fonts.js';
import { Prefs } from './state.js';

export const PAPER = {
  letter: { n: 'Letter', d: '21,6 × 27,9 cm', w: 8.5, h: 11 },
  legal: { n: 'Legal', d: '21,6 × 35,6 cm', w: 8.5, h: 14 },
  folio: { n: 'F4 / Folio', d: '21,6 × 33 cm', w: 8.5, h: 13 },
  a3: { n: 'A3', d: '29,7 × 42 cm', mm: [297, 420] },
  a4: { n: 'A4', d: '21 × 29,7 cm', mm: [210, 297] },
  a5: { n: 'A5', d: '14,8 × 21 cm', mm: [148, 210] },
  b4: { n: 'B4', d: '25 × 35,3 cm', mm: [250, 353] },
  b5: { n: 'B5', d: '17,6 × 25 cm', mm: [176, 250] },
  tabloid: { n: 'Tabloid', d: '27,9 × 43,2 cm', w: 11, h: 17 },
  executive: { n: 'Executive', d: '18,4 × 26,7 cm', w: 7.25, h: 10.5 },
  statement: { n: 'Statement', d: '14 × 21,6 cm', w: 5.5, h: 8.5 },
};
export function paperPx(key) {
  const p = PAPER[key] || PAPER.a4;
  return p.mm ? { w: Math.round(p.mm[0] / 25.4 * 96), h: Math.round(p.mm[1] / 25.4 * 96) } : { w: Math.round(p.w * 96), h: Math.round(p.h * 96) };
}
// Margin presets in cm: [top, bottom, left, right]
export const MARGINS = [
  ['normal', 'Normal', [2.54, 2.54, 2.54, 2.54]],
  ['narrow', 'Sempit', [1.27, 1.27, 1.27, 1.27]],
  ['moderate', 'Sedang', [2.54, 2.54, 1.91, 1.91]],
  ['wide', 'Lebar', [2.54, 2.54, 5.08, 5.08]],
  ['skripsi', 'Skripsi (4-3-3-4)', [4, 3, 4, 3]],
  ['surat', 'Surat dinas', [2, 2, 3, 2]],
];
export const marginPreset = m => MARGINS.find(([, , v]) => v.every((x, i) => Math.abs(x - [m.t, m.b, m.l, m.r][i]) < .005))?.[0] || '';
export const cm2px = v => v * 96 / 2.54;
export const px2cm = v => v * 2.54 / 96;

export const STYLE_KEYS = ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
export const STYLE_NAMES = { normal: 'Teks normal', title: 'Judul', subtitle: 'Subjudul', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6', quote: 'Kutipan', code: 'Blok kode' };
export const DEFAULT_STYLES = {
  normal: { font: 'Arial', size: 11, color: '#000000', bold: false, italic: false, lh: 1.15, sb: 0, sa: 0 },
  title: { size: 26, sb: 0, sa: 3 },
  subtitle: { size: 15, color: '#666666', sb: 0, sa: 16 },
  h1: { size: 20, sb: 20, sa: 6 },
  h2: { size: 16, sb: 18, sa: 6 },
  h3: { size: 14, color: '#434343', sb: 16, sa: 4 },
  h4: { size: 12, color: '#666666', sb: 14, sa: 4 },
  h5: { size: 11, color: '#666666', sb: 12, sa: 4 },
  h6: { size: 11, color: '#666666', italic: true, sb: 12, sa: 4 },
};
export function resolvedStyle(styles, key) {
  const n = { ...DEFAULT_STYLES.normal, ...(styles?.normal || {}) };
  if (key === 'normal') return n;
  return { font: n.font, color: n.color, lh: n.lh, bold: false, italic: false, ...DEFAULT_STYLES[key], ...(styles?.[key] || {}) };
}
export function styleVars(styles) {
  const v = {};
  for (const k of STYLE_KEYS) {
    const s = { ...DEFAULT_STYLES[k], ...(styles?.[k] || {}) };
    const p = k === 'normal' ? 'n' : k;
    if (s.font) v[`--${p}-font`] = fontCss(s.font);
    if (s.size) v[`--${p}-size`] = s.size + 'pt';
    if (s.color) v[`--${p}-color`] = s.color;
    if (s.bold != null) v[`--${p}-weight`] = s.bold ? '700' : '400';
    if (s.italic != null) v[`--${p}-style`] = s.italic ? 'italic' : 'normal';
    if (s.sb != null) v[`--${p}-sb`] = s.sb + 'pt';
    if (s.sa != null) v[`--${p}-sa`] = s.sa + 'pt';
    if (s.lh) v[`--${p}-lh`] = s.lh;
  }
  return v;
}
export function applyStyleVars(el, styles) {
  for (const [k, val] of Object.entries(styleVars(styles))) el.style.setProperty(k, val);
}

export function defaultPage() {
  return {
    size: 'a4', orient: 'portrait', margins: { t: 2.54, b: 2.54, l: 2.54, r: 2.54 }, color: '#ffffff', pageless: false,
    header: { html: '', first: '' }, footer: { html: '', first: '' }, firstDiff: false, hfDist: 1.27,
    wm: null, border: null,
    ...(Prefs.pageDefault ? JSON.parse(JSON.stringify(Prefs.pageDefault)) : {}),
  };
}
export function normalizeDoc(d) {
  const p = defaultPage();
  d.page = { ...p, ...(d.page || {}) };
  d.page.margins = { ...p.margins, ...(d.page.margins || {}) };
  d.page.header = { html: '', first: '', ...(d.page.header || {}) };
  d.page.footer = { html: '', first: '', ...(d.page.footer || {}) };
  d.styles ||= Prefs.styleDefault ? JSON.parse(JSON.stringify(Prefs.styleDefault)) : {};
  d.comments ||= [];
  d.footnotes ||= {};
  d.assets ||= {};
  d.drawings ||= {};
  d.charts ||= {};
  d.citations ||= [];
  d.citeStyle ||= 'apa';
  d.summary ||= '';
  d.lang ||= 'id';
  d.title ??= 'Dokumen tanpa judul';
  return d;
}
export function newDoc(o = {}) {
  const now = Date.now();
  return normalizeDoc({
    id: 'd' + now.toString(36) + Math.random().toString(36).slice(2, 7),
    title: o.title || 'Dokumen tanpa judul', html: o.html || '<p><br></p>',
    created: now, modified: now, opened: now, starred: false, trashed: 0,
    page: o.page, styles: o.styles, assets: o.assets, footnotes: o.footnotes, preview: '', words: 0,
  });
}
