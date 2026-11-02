// Dialogs: page setup, word count, styles, preferences, theme, spacing, indentation, borders, watermark, shortcuts, info.
import { E, Prefs, savePrefs, me } from './state.js';
import { h, icon, toast, dialog, field, select, numInput, toggle, segmented, tabs, palette, openMenu, closeMenus, kbdLabel, fmtFull, fmtNum, pickFile, readFile, avatar } from './ui.js';
import { PAPER, MARGINS, marginPreset, STYLE_KEYS, STYLE_NAMES, DEFAULT_STYLES, resolvedStyle, px2cm, cm2px } from './docmodel.js';
import { FONTS, ensureFont } from './fonts.js';
import { Theme, ACCENTS } from './theme.js';
import { selBlocks, setIndentPx, setLineHeight, setSpace, setBlockBorder } from './format.js';
import { shrink } from './images.js';

const colorButton = (label, value, onChange, reset) => {
  let v = value;
  const sw = h('span', { style: { width: '18px', height: '18px', borderRadius: '50%', boxShadow: 'inset 0 0 0 1px var(--line2)', flex: 'none' } });
  const b = h('button', { type: 'button', class: 'btn btn-ghost', style: { justifyContent: 'flex-start', color: 'var(--tx)', width: '100%' } }, sw, label);
  const set = c => { v = c; sw.style.background = c || 'repeating-linear-gradient(45deg,#fff 0 4px,#e0e0e0 4px 8px)'; };
  set(v);
  b.onclick = () => openMenu(b, [{ el: palette({ value: v, reset, onPick: c => { set(c); onChange(c); closeMenus(0); } }) }], { cls: 'pop' });
  return b;
};

/* ---------------- Page setup ---------------- */
export async function pageSetup() {
  const p = JSON.parse(JSON.stringify(E.doc.page));
  let pageless = !!p.pageless;
  const prev = h('div', { class: 'pg-prev' }, h('i'));
  const sizeSel = select(Object.entries(PAPER).map(([k, v]) => [k, `${v.n} (${v.d})`]), p.size);
  const orientSeg = segmented([['portrait', 'Potret', 'crop_portrait'], ['landscape', 'Lanskap', 'crop_landscape']], p.orient, v => { p.orient = v; draw(); });
  const m = {};
  for (const k of ['t', 'b', 'l', 'r']) m[k] = numInput(+p.margins[k].toFixed(2), { min: 0, max: 15, step: .1 });
  const preset = select([['', 'Kustom'], ...MARGINS.map(([k, n, v]) => [k, `${n} (${v.map(x => String(x).replace('.', ',')).join(' / ')} cm)`])], marginPreset(p.margins));
  preset.onchange = () => {
    const P = MARGINS.find(x => x[0] === preset.value)?.[2];
    if (P) { m.t.value = P[0]; m.b.value = P[1]; m.l.value = P[2]; m.r.value = P[3]; draw(); }
  };
  Object.values(m).forEach(i => i.addEventListener('input', () => { preset.value = ''; draw(); }));
  sizeSel.onchange = draw;
  let color = p.color || '#ffffff';
  const colorB = colorButton('Warna halaman', color, c => color = c || '#ffffff');
  const borderT = toggle('Garis tepi halaman', !!p.border);
  const hfIn = numInput(+(p.hfDist ?? 1.27).toFixed(2), { min: 0, max: 10, step: .1 });
  const def = toggle('Jadikan default untuk dokumen baru', false);
  function draw() {
    const pp = PAPER[sizeSel.value];
    let w = pp.mm ? pp.mm[0] : pp.w * 25.4, hh = pp.mm ? pp.mm[1] : pp.h * 25.4;
    if (p.orient === 'landscape') [w, hh] = [hh, w];
    const k = 150 / Math.max(w, hh);
    prev.style.width = w * k + 'px'; prev.style.height = hh * k + 'px';
    const mm = x => (parseFloat(x.value) || 0) * 10 * k;
    Object.assign(prev.firstChild.style, { top: mm(m.t) + 'px', bottom: mm(m.b) + 'px', left: mm(m.l) + 'px', right: mm(m.r) + 'px' });
  }
  draw();
  const pagesPane = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 170px', gap: '20px', alignItems: 'start' } },
    h('div', { style: { display: 'grid', gap: '14px' } },
      field('Orientasi', orientSeg), field('Ukuran kertas', sizeSel), field('Preset margin', preset),
      h('div', { class: 'grid4' }, field('Atas (cm)', m.t), field('Bawah (cm)', m.b), field('Kiri (cm)', m.l), field('Kanan (cm)', m.r)),
      field('Jarak header & footer dari tepi kertas (cm)', hfIn),
      h('div', { class: 'grid2' }, colorB, borderT), def),
    h('div', { style: { display: 'grid', placeItems: 'center', minHeight: '180px' } }, prev));
  const plSeg = segmented([['pages', 'Halaman', 'description'], ['pageless', 'Tanpa halaman', 'article']], pageless ? 'pageless' : 'pages', v => pageless = v === 'pageless');
  const pane2 = h('div', { style: { display: 'grid', gap: '14px' } }, plSeg,
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Format tanpa halaman menghilangkan pemisah halaman sehingga teks mengalir terus — cocok untuk dokumen web, catatan, atau tabel lebar. Header, footer, dan watermark tidak ditampilkan dalam format ini.'));
  const ok = await dialog({
    title: 'Penyiapan halaman', width: 640,
    body: tabs([['Halaman', pagesPane], ['Format', pane2]]),
    buttons: [{ label: 'Batal', value: false }, { label: 'OK', primary: true, value: true }],
  });
  if (!ok) return;
  E.hist.before();
  const pg = E.doc.page;
  pg.size = sizeSel.value; pg.orient = p.orient; pg.color = color; pg.pageless = pageless;
  for (const k of ['t', 'b', 'l', 'r']) pg.margins[k] = Math.max(0, Math.min(15, parseFloat(m[k].value) || 0));
  pg.hfDist = Math.max(0, Math.min(10, parseFloat(hfIn.value) || 0));
  pg.border = borderT.input.checked ? (pg.border || { w: 1, color: '#5f6368', style: 'solid', offset: 24 }) : null;
  if (def.input.checked) { Prefs.pageDefault = { size: pg.size, orient: pg.orient, margins: { ...pg.margins }, color: pg.color, pageless: pg.pageless }; savePrefs(); }
  E.changed();
  E.applyView();
}

/* ---------------- Word count ---------------- */
export function countText(text) {
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-_.@]*/gu) || []).length;
  return { words, chars: text.replace(/\n/g, '').length, charsNoSp: text.replace(/\s/g, '').length };
}
export function wordCountDialog() {
  const all = countText(E.body.innerText || '');
  const sel = E.range()?.toString();
  const s = sel ? countText(sel) : null;
  const row = (l, v, sv) => h('tr', null, h('td', null, l), h('td', null, sv != null ? `${fmtNum(sv)} dari ${fmtNum(v)}` : fmtNum(v)));
  const t = toggle('Tampilkan jumlah kata saat mengetik', Prefs.wordCount, v => { Prefs.wordCount = v; savePrefs(); E.updateStatus(); });
  dialog({
    title: 'Jumlah kata', width: 400,
    body: h('div', null, h('table', { class: 'wc-tab' },
      row('Halaman', E.doc.page.pageless ? 1 : E.pageCount),
      row('Kata', all.words, s?.words), row('Karakter', all.chars, s?.chars), row('Karakter tanpa spasi', all.charsNoSp, s?.charsNoSp),
      row('Paragraf', [...E.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')].filter(x => x.textContent.trim()).length),
      row('Perkiraan waktu baca', Math.max(1, Math.round(all.words / 200)) + ' menit')), h('div', { style: { height: '14px' } }), t),
    buttons: [{ label: 'OK', primary: true }],
  });
}

/* ---------------- Paragraph styles ---------------- */
export async function stylesDialog(start = 'normal') {
  const styles = JSON.parse(JSON.stringify(E.doc.styles || {}));
  let key = start;
  const fontSel = select(FONTS.map(f => [f.n, f.n]), 'Arial');
  const size = numInput(11, { min: 4, max: 200, step: .5 });
  let color = '#000000';
  const colorB = colorButton('Warna teks', color, c => { color = c || '#000000'; upd(); });
  const bold = toggle('Tebal', false), ital = toggle('Miring', false);
  const lh = select([['1', 'Tunggal'], ['1.15', '1,15'], ['1.5', '1,5'], ['2', 'Ganda']], '1.15');
  const sb = numInput(0, { min: 0, max: 200, step: 1 }), sa = numInput(0, { min: 0, max: 200, step: 1 });
  const prev = h('div', { style: { padding: '16px 18px', borderRadius: '12px', background: '#fff', color: '#000', border: '1px solid var(--line)', minHeight: '76px', overflow: 'hidden' } });
  const list = h('div', { style: { display: 'grid', gap: '2px', alignContent: 'start' } });
  const read = () => {
    const s = styles[key] ||= {};
    s.font = fontSel.value; s.size = parseFloat(size.value) || 11; s.color = color; s.bold = bold.input.checked; s.italic = ital.input.checked;
    s.lh = parseFloat(lh.value); s.sb = parseFloat(sb.value) || 0; s.sa = parseFloat(sa.value) || 0;
  };
  const load = () => {
    const r = resolvedStyle(styles, key);
    fontSel.value = r.font || 'Arial'; size.value = r.size; color = r.color || '#000000';
    colorB.querySelector('span').style.background = color;
    bold.input.checked = !!r.bold; ital.input.checked = !!r.italic;
    lh.value = String(r.lh ?? 1.15); if (!lh.value) lh.value = '1.15';
    sb.value = r.sb ?? 0; sa.value = r.sa ?? 0;
    [...list.children].forEach(b => b.classList.toggle('hov', b.dataset.k === key));
    upd();
  };
  const upd = () => { ensureFont(fontSel.value); Object.assign(prev.style, { fontFamily: `"${fontSel.value}", Arial`, fontSize: (parseFloat(size.value) || 11) + 'pt', color, fontWeight: bold.input.checked ? 700 : 400, fontStyle: ital.input.checked ? 'italic' : 'normal', lineHeight: lh.value }); prev.textContent = STYLE_NAMES[key] + ' — Contoh teks dokumen yang menggunakan gaya ini.'; };
  [fontSel, size, lh, sb, sa, bold.input, ital.input].forEach(i => i.addEventListener('input', () => { read(); upd(); }));
  [fontSel, lh, bold.input, ital.input].forEach(i => i.addEventListener('change', () => { read(); upd(); }));
  for (const k of STYLE_KEYS) list.append(h('button', { class: 'mi', dataset: { k }, style: { border: 0, background: 'none', width: '100%' }, onclick: () => { read(); key = k; load(); } }, h('span', { class: 'mi-l' }, STYLE_NAMES[k])));
  load();
  const ok = await dialog({
    title: 'Gaya paragraf', width: 720,
    body: h('div', { style: { display: 'grid', gridTemplateColumns: '170px 1fr', gap: '18px' } }, list,
      h('div', { style: { display: 'grid', gap: '12px' } },
        h('div', { class: 'grid2' }, field('Font', fontSel), field('Ukuran (pt)', size)),
        h('div', { class: 'grid2' }, colorB, h('div', { class: 'row' }, bold, ital)),
        h('div', { class: 'grid4' }, field('Spasi baris', lh), field('Sebelum (pt)', sb), field('Sesudah (pt)', sa), h('div')),
        prev)),
    buttons: [{ label: 'Setel ulang semua', value: 'reset' }, { spacer: true }, { label: 'Batal', value: null }, { label: 'Simpan gaya', primary: true, value: 'ok', action: () => { read(); return 'ok'; } }],
  });
  if (!ok) return;
  E.hist.before();
  E.doc.styles = ok === 'reset' ? {} : styles;
  E.applyDocStyles();
  E.changed();
  toast(ok === 'reset' ? 'Gaya dikembalikan ke bawaan' : 'Gaya paragraf diperbarui');
}
export function saveStylesAsDefault() { Prefs.styleDefault = JSON.parse(JSON.stringify(E.doc.styles || {})); savePrefs(); toast('Gaya ini akan dipakai untuk dokumen baru'); }

/* ---------------- Spacing & indent ---------------- */
export async function customSpacing() {
  const b = selBlocks()[0];
  if (!b) return;
  const cs = getComputedStyle(b);
  const lhv = b.style.lineHeight ? parseFloat(b.style.lineHeight) : Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100) / 100 || 1.15;
  const lh = numInput(lhv, { min: .5, max: 5, step: .05 });
  const sb = numInput(Math.round(parseFloat(cs.marginTop) * .75), { min: 0, max: 200, step: 1 });
  const sa = numInput(Math.round(parseFloat(cs.marginBottom) * .75), { min: 0, max: 200, step: 1 });
  const ok = await dialog({ title: 'Spasi khusus', width: 420, body: h('div', { style: { display: 'grid', gap: '12px' } }, field('Spasi baris (kelipatan)', lh), h('div', { class: 'grid2' }, field('Sebelum paragraf (pt)', sb), field('Sesudah paragraf (pt)', sa))), buttons: [{ label: 'Batal', value: false }, { label: 'Terapkan', primary: true, value: true }] });
  if (!ok) return;
  setLineHeight(parseFloat(lh.value) || 1.15);
  setSpace('before', parseFloat(sb.value) || 0);
  setSpace('after', parseFloat(sa.value) || 0);
}
export async function indentDialog() {
  const b = selBlocks()[0];
  if (!b) return;
  const cs = getComputedStyle(b);
  const left = numInput(+px2cm(parseFloat(cs.marginLeft) || 0).toFixed(2), { min: 0, max: 20, step: .1 });
  const right = numInput(+px2cm(parseFloat(cs.marginRight) || 0).toFixed(2), { min: 0, max: 20, step: .1 });
  const ti = parseFloat(cs.textIndent) || 0;
  const special = select([['none', 'Tidak ada'], ['first', 'Baris pertama'], ['hanging', 'Gantung']], ti > 0 ? 'first' : ti < 0 ? 'hanging' : 'none');
  const by = numInput(+px2cm(Math.abs(ti)).toFixed(2) || 1.27, { min: 0, max: 10, step: .1 });
  const ok = await dialog({ title: 'Opsi indentasi', width: 440, body: h('div', { style: { display: 'grid', gap: '12px' } }, h('div', { class: 'grid2' }, field('Kiri (cm)', left), field('Kanan (cm)', right)), h('div', { class: 'grid2' }, field('Indentasi khusus', special), field('Sebesar (cm)', by))), buttons: [{ label: 'Batal', value: false }, { label: 'Terapkan', primary: true, value: true }] });
  if (!ok) return;
  const L = cm2px(parseFloat(left.value) || 0), R = cm2px(parseFloat(right.value) || 0), B = cm2px(parseFloat(by.value) || 0);
  const first = special.value === 'first' ? B : special.value === 'hanging' ? -B : 0;
  setIndentPx({ left: special.value === 'hanging' ? L + B : L, right: R, first });
}
export async function bordersDialog() {
  const sides = new Set(['all']);
  const sideSeg = h('div', { class: 'seg' }, [['all', 'Semua', 'border_outer'], ['top', 'Atas', 'border_top'], ['bottom', 'Bawah', 'border_bottom'], ['left', 'Kiri', 'border_left'], ['right', 'Kanan', 'border_right'], ['none', 'Tidak ada', 'border_clear']].map(([k, l, ic]) => {
    const b = h('button', { type: 'button', class: sides.has(k) ? 'on' : '', 'data-tip': l }, icon(ic, 'sm'));
    b.onclick = () => {
      if (k === 'all' || k === 'none') { sides.clear(); if (k === 'all') sides.add('all'); }
      else { sides.delete('all'); sides.has(k) ? sides.delete(k) : sides.add(k); }
      [...sideSeg.children].forEach((c, i) => c.classList.toggle('on', sides.has(['all', 'top', 'bottom', 'left', 'right', 'none'][i]) || (i === 5 && !sides.size)));
    };
    return b;
  }));
  const width = select([['0.5', '½ pt'], ['1', '1 pt'], ['1.5', '1½ pt'], ['2.25', '2¼ pt'], ['3', '3 pt'], ['4.5', '4½ pt']], '1');
  const style = select([['solid', 'Garis'], ['dashed', 'Putus-putus'], ['dotted', 'Titik-titik'], ['double', 'Ganda']], 'solid');
  const pad = numInput(4, { min: 0, max: 40, step: 1 });
  let color = '#000000', shade = null;
  const ok = await dialog({
    title: 'Border & bayangan', width: 480,
    body: h('div', { style: { display: 'grid', gap: '14px' } }, field('Posisi border', sideSeg), h('div', { class: 'grid2' }, field('Ketebalan', width), field('Gaya garis', style)),
      h('div', { class: 'grid2' }, colorButton('Warna border', color, c => color = c || '#000000'), field('Jarak ke teks (pt)', pad)),
      colorButton('Warna latar (bayangan)', shade, c => shade = c, 'Tidak ada')),
    buttons: [{ label: 'Batal', value: false }, { label: 'Terapkan', primary: true, value: true }],
  });
  if (!ok) return;
  setBlockBorder({ sides: [...sides], width: width.value, style: style.value, color, pad: pad.value, shade });
}

/* ---------------- Watermark ---------------- */
export async function watermarkDialog() {
  const wm = E.doc.page.wm || {};
  let mode = wm.type || 'text';
  const txt = h('input', { class: 'tx', value: wm.text || 'RAHASIA', placeholder: 'Teks watermark' });
  const size = numInput(wm.size || 72, { min: 12, max: 200, step: 2 });
  const op = h('input', { type: 'range', min: 5, max: 80, value: Math.round((wm.opacity ?? .3) * 100), style: { width: '100%', accentColor: 'var(--accent)' } });
  const diag = toggle('Diagonal', wm.diag !== false);
  let color = wm.color || '#9aa0a6';
  let asset = wm.asset || null;
  const imgName = h('span', { class: 'muted small' }, asset ? 'Gambar dipilih' : 'Belum ada gambar');
  const scale = numInput(wm.scale || 60, { min: 10, max: 100, step: 5 });
  const textPane = h('div', { style: { display: 'grid', gap: '12px' } }, field('Teks', txt), h('div', { class: 'grid2' }, field('Ukuran (pt)', size), colorButton('Warna', color, c => color = c || '#9aa0a6')), diag);
  const imgPane = h('div', { style: { display: 'grid', gap: '12px' } },
    h('div', { class: 'row' }, h('button', { class: 'btn btn-tonal', onclick: async () => { const [f] = await pickFile('image/*'); if (!f) return; asset = E.addAsset(await shrink(await readFile(f), f.type)); imgName.textContent = f.name; } }, icon('upload'), 'Pilih gambar'), imgName),
    field('Lebar (% halaman)', scale));
  const seg = segmented([['text', 'Teks', 'title'], ['image', 'Gambar', 'image']], mode, v => { mode = v; textPane.hidden = v !== 'text'; imgPane.hidden = v !== 'image'; });
  textPane.hidden = mode !== 'text'; imgPane.hidden = mode !== 'image';
  const ok = await dialog({
    title: 'Watermark', width: 480,
    body: h('div', { style: { display: 'grid', gap: '14px' } }, seg, textPane, imgPane, field('Transparansi', op)),
    buttons: [{ label: 'Hapus watermark', value: 'remove' }, { spacer: true }, { label: 'Batal', value: null }, { label: 'Terapkan', primary: true, value: 'ok' }],
  });
  if (!ok) return;
  E.hist.before();
  if (ok === 'remove') E.doc.page.wm = null;
  else if (mode === 'image' && asset) E.doc.page.wm = { type: 'image', asset, scale: +scale.value || 60, opacity: op.value / 100 };
  else E.doc.page.wm = { type: 'text', text: txt.value || 'RAHASIA', size: +size.value || 72, color, opacity: op.value / 100, diag: diag.input.checked };
  E.changed();
}

/* ---------------- Preferences ---------------- */
export async function prefsDialog() {
  const name = h('input', { class: 'tx', value: Prefs.name, placeholder: 'Nama Anda' });
  const t = k => toggle({ smartQuotes: 'Gunakan tanda kutip cerdas (“ ”)', autoLink: 'Deteksi tautan otomatis', autoList: 'Deteksi daftar & judul otomatis (- , 1. , # )', autoCorrect: 'Penggantian otomatis (-- → —, (c) → ©, -> → →)', spell: 'Periksa ejaan', wordCount: 'Tampilkan jumlah kata saat mengetik', ruler: 'Tampilkan penggaris' }[k], Prefs[k]);
  const items = ['smartQuotes', 'autoLink', 'autoList', 'autoCorrect', 'spell', 'wordCount', 'ruler'].map(k => [k, t(k)]);
  const ok = await dialog({
    title: 'Preferensi', width: 520,
    body: h('div', { style: { display: 'grid', gap: '14px' } }, field('Nama (untuk komentar dan saran)', name), h('div', { class: 'menu-sep' }), ...items.map(x => x[1]),
      h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Dokumen disimpan di penyimpanan browser perangkat ini. Gunakan Berkas › Download untuk mencadangkan.')),
    buttons: [{ label: 'Batal', value: false }, { label: 'OK', primary: true, value: true }],
  });
  if (!ok) return;
  Prefs.name = name.value.trim();
  for (const [k, el] of items) Prefs[k] = el.input.checked;
  savePrefs();
  if (E.doc) { E.view.ruler = Prefs.ruler; E.applyView?.(); E.refreshAvatar?.(); E.updateStatus?.(); }
  return true;
}

/* ---------------- Theme ---------------- */
export function themeDialog() {
  const p = Theme.p;
  const pv = (mode) => {
    const d = mode === 'dark';
    return h('div', { class: 'pv', style: { background: mode === 'system' ? 'linear-gradient(90deg,#eef2f7 50%,#0c0f14 50%)' : d ? '#0c0f14' : '#eef2f7' } },
      h('div', { style: { position: 'absolute', left: '8px', right: '8px', top: '8px', height: '14px', borderRadius: '6px', background: d ? 'rgba(40,44,52,.9)' : 'rgba(255,255,255,.9)' } }),
      h('div', { style: { position: 'absolute', left: '28%', right: '28%', top: '28px', bottom: '-6px', borderRadius: '3px', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.2)' } }));
  };
  const modes = h('div', { class: 'theme-grid' }, [['light', 'Terang'], ['dark', 'Gelap'], ['system', 'Ikuti sistem']].map(([k, l]) => h('button', { class: 'theme-opt' + (p.mode === k ? ' on' : ''), onclick: e => { Theme.set({ mode: k }); [...modes.children].forEach(c => c.classList.toggle('on', c === e.currentTarget)); } }, pv(k), l)));
  const accents = h('div', { class: 'acc-row' }, ACCENTS.map(([k, l, c]) => h('button', { class: 'acc' + (p.accent === k ? ' on' : ''), style: { background: c, color: c }, title: l, 'aria-label': l, onclick: e => { Theme.set({ accent: k }); [...accents.children].forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, p.accent === k ? h('span', { class: 'ms', style: { color: '#fff', fontSize: '18px' } }, 'check') : null)));
  accents.addEventListener('click', () => [...accents.children].forEach(x => x.replaceChildren(x.classList.contains('on') ? h('span', { class: 'ms', style: { color: '#fff', fontSize: '18px' } }, 'check') : '')));
  const glass = segmented([['liquid', 'Liquid glass', 'water_drop'], ['frost', 'Kaca buram', 'blur_on'], ['solid', 'Solid', 'rectangle']], p.glass, v => Theme.set({ glass: v }));
  const bg = segmented([['aurora', 'Aurora'], ['soft', 'Lembut'], ['plain', 'Polos']], p.bg, v => Theme.set({ bg: v }));
  const paper = toggle('Halaman gelap saat tema gelap (mode baca malam)', p.paperDark, v => Theme.set({ paperDark: v }));
  dialog({
    title: 'Tema & tampilan', width: 520,
    body: h('div', { style: { display: 'grid', gap: '18px' } }, field('Mode', modes), field('Warna aksen', accents), field('Material antarmuka', glass), field('Latar belakang', bg), paper),
    buttons: [{ label: 'Selesai', primary: true }],
  });
}

/* ---------------- Shortcuts / about / info ---------------- */
export function shortcutsDialog(CMD) {
  const groups = { 'Umum': ['save', 'print', 'open', 'find', 'replace', 'menusearch', 'shortcuts', 'wordcount'], 'Edit': ['undo', 'redo', 'pasteplain', 'selectall', 'link', 'comment'], 'Format teks': ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'sizeup', 'sizedown', 'clearfmt'], 'Paragraf': ['st-normal', 'st-h1', 'st-h2', 'st-h3', 'align-left', 'align-center', 'align-right', 'align-justify', 'bullets', 'numbers', 'checklist', 'indent', 'outdent'], 'Sisipkan': ['pagebreak', 'footnote'], 'Alat': ['voice', 'versions'] };
  const grid = h('div', { class: 'kb-grid' });
  for (const [g, ids] of Object.entries(groups)) {
    grid.append(h('div', { class: 'kb-h' }, g));
    for (const id of ids) { const c = CMD[id]; if (!c?.kbd) continue; grid.append(h('div', null, c.label), h('div', null, kbdLabel(c.kbd))); }
  }
  grid.append(h('div', { class: 'kb-h' }, 'Pemformatan otomatis'), h('div', null, 'Judul'), h('div', null, '# + spasi'), h('div', null, 'Daftar berbutir'), h('div', null, '- + spasi'), h('div', null, 'Daftar bernomor'), h('div', null, '1. + spasi'), h('div', null, 'Checklist'), h('div', null, '[] + spasi'), h('div', null, 'Garis horizontal'), h('div', null, '--- + Enter'));
  dialog({ title: 'Pintasan keyboard', width: 560, body: grid, buttons: [{ label: 'Tutup', primary: true }] });
}
export function aboutDialog() {
  dialog({
    title: 'Tentang Amatu Docs', width: 460,
    body: h('div', { style: { display: 'grid', gap: '12px', justifyItems: 'center', textAlign: 'center' } },
      h('img', { src: 'assets/icon.svg', alt: '', style: { width: '72px', height: '72px', filter: 'drop-shadow(0 8px 18px rgba(42,86,214,.35))' } }),
      h('div', { style: { fontSize: '20px', fontWeight: 600 } }, 'Amatu Docs'),
      h('div', { class: 'muted' }, 'Pengolah dokumen di browser dengan halaman nyata, komentar, mode menyarankan, histori versi, dan ekspor ke Word (.docx) serta PDF.'),
      h('div', { class: 'muted small' }, 'Semua dokumen tersimpan secara lokal di perangkat ini dan tidak dikirim ke server.')),
    buttons: [{ label: 'Tutup', primary: true }],
  });
}
export function docInfoDialog() {
  const d = E.doc, c = countText(E.body.innerText || '');
  const row = (l, v) => h('tr', null, h('td', null, l), h('td', null, v));
  dialog({
    title: 'Detail dokumen', width: 440,
    body: h('table', { class: 'wc-tab' }, row('Judul', d.title), row('Pemilik', me()), row('Dibuat', fmtFull(d.created)), row('Terakhir diubah', fmtFull(d.modified)),
      row('Ukuran kertas', PAPER[d.page.size]?.n + (d.page.orient === 'landscape' ? ' (lanskap)' : '')), row('Halaman', d.page.pageless ? 'Tanpa halaman' : E.pageCount), row('Kata', fmtNum(c.words)),
      row('Komentar', d.comments.filter(x => !x.resolved).length + ' terbuka'), row('Lokasi', 'Perangkat ini (browser)')),
    buttons: [{ label: 'Tutup', primary: true }],
  });
}
export { avatar, DEFAULT_STYLES };
