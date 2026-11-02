// Editor chrome: title bar, menu bar, toolbar, status bar, and their live state.
import { E, Prefs, me } from './state.js';
import { h, icon, openMenu, toggleMenu, closeMenus, menuAnchor, palette, avatar, toHex, fmtNum } from './ui.js';
import { CMD, run, MENUS, fontItems, styleItems, zoomItems, spacingItems, imageItems, modeItems, bulletStyles, numberStyles } from './commands.js';
import * as F from './format.js';
import { STYLE_NAMES } from './docmodel.js';
import { countText } from './dialogs.js';

const noFocus = el => { el.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }); return el; };
function B(id, ic) {
  const c = CMD[id];
  const b = noFocus(h('button', { class: 'ib', 'data-tip': c.label, 'data-kbd': c.kbd || c.kbdShow || null, 'aria-label': c.label, dataset: { cmd: id } }, icon(ic || c.icon)));
  b.onclick = () => run(id);
  return b;
}
function drop(cls, tip, items, opts) {
  const b = noFocus(h('button', { class: 'tb-drop ' + cls, 'data-tip': tip, 'aria-haspopup': 'true' }, h('span', { class: 'l' }), icon('arrow_drop_down')));
  b.onclick = () => toggleMenu(b, items, opts);
  return b;
}
function split(id, items, tip) {
  const a = noFocus(h('button', { class: 'ib arr', 'data-tip': tip, 'aria-label': tip }, icon('arrow_drop_down')));
  a.onclick = () => toggleMenu(a, items);
  return h('div', { class: 'split' }, B(id), a);
}
const sep = () => h('div', { class: 'tb-sep' });

function colorBtn(kind) {
  const fg = kind === 'fore';
  const bar = h('span', { class: 'bar' });
  const b = noFocus(h('button', { class: 'ib cbtn', 'data-tip': fg ? 'Warna teks' : 'Warna sorotan', 'aria-label': fg ? 'Warna teks' : 'Warna sorotan' }, icon(fg ? 'format_color_text' : 'ink_highlighter'), bar));
  b.onclick = () => toggleMenu(b, [{
    el: () => palette({
      value: E.ui[kind], reset: fg ? null : 'Tidak ada',
      onPick: c => { closeMenus(0); E.exec(fg ? 'foreColor' : 'hiliteColor', c || (fg ? '#000000' : 'transparent')); },
    }),
  }], { cls: 'pop' });
  E.ui[kind + 'Bar'] = bar;
  return b;
}

export function buildEditor() {
  const ui = E.ui = {};
  const root = h('div', { class: 'ed', dataset: { mode: 'edit' } });

  ui.title = h('input', { class: 'ed-title', spellcheck: 'false', 'aria-label': 'Nama dokumen', maxlength: 200 });
  ui.star = h('button', { class: 'ib sm', 'data-tip': 'Beri bintang', 'aria-label': 'Beri bintang', onclick: () => E.toggleStar() }, icon('star'));
  ui.lockB = h('button', { class: 'ib sm', hidden: true, 'data-tip': 'Dikunci dengan kata sandi', 'aria-label': 'Kunci dokumen' }, icon('lock', 'fill'));
  ui.lockB.onclick = () => toggleMenu(ui.lockB, () => ['lock-now', 'lock-set', 'lock-off'].map(id => ({ label: typeof CMD[id].label === 'function' ? CMD[id].label() : CMD[id].label, icon: CMD[id].icon, enabled: CMD[id].enabled, run: () => run(id) })));
  ui.saved = h('span', { class: 'ed-saved', 'data-tip': 'Semua perubahan tersimpan di perangkat ini' }, icon('cloud_done'), h('span', { class: 't' }, 'Tersimpan'));
  ui.menubar = h('nav', { class: 'menubar', role: 'menubar' }, MENUS.map(m => {
    const b = h('button', { role: 'menuitem', 'aria-haspopup': 'true' }, m.label);
    b.addEventListener('mousedown', e => e.preventDefault());
    b.onclick = () => toggleMenu(b, m.items);
    b.addEventListener('mouseenter', () => { const a = menuAnchor(); if (a && a !== b && a.parentElement === ui.menubar) openMenu(b, m.items); });
    return b;
  }));
  ui.av = h('button', { class: 'ib round hide-sm', style: { width: '42px', height: '42px' }, 'data-tip': me(), onclick: () => run('prefs') }, avatar(me()));
  const actions = h('div', { class: 'ed-act' },
    noFocus(h('button', { class: 'ib hide-sm', 'data-tip': 'Histori versi', onclick: () => run('versions') }, icon('history'))),
    noFocus(h('button', { class: 'ib', 'data-tip': 'Buka histori komentar', onclick: () => run('comments') }, icon('comment'))),
    h('button', { class: 'btn btn-primary share', onclick: () => run('share') }, icon('lock_open'), h('span', { class: 't' }, 'Bagikan')),
    ui.av);

  // Toolbar
  ui.search = noFocus(h('button', { class: 'tb-search', 'data-tip': 'Telusuri menu', 'data-kbd': 'Alt+/', onclick: () => run('menusearch') }, icon('search'), h('span', { class: 'hide-sm' }, 'Menu')));
  ui.zoom = drop('tb-zoom', 'Zoom', zoomItems);
  ui.style = drop('tb-style', 'Gaya', styleItems);
  ui.font = drop('tb-font', 'Font', fontItems, { width: 240 });
  ui.sizeIn = h('input', { 'aria-label': 'Ukuran font', inputmode: 'decimal' });
  ui.sizeIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const v = parseFloat(ui.sizeIn.value.replace(',', '.')); closeMenus(0); if (v > 0) F.setFontSize(v); else E.restoreSel(); }
    if (e.key === 'Escape') { closeMenus(0); E.restoreSel(); }
  });
  ui.sizeIn.addEventListener('focus', () => { ui.sizeIn.select(); openMenu(ui.sizeIn, F.SIZES.map(s => ({ label: String(s), run: () => F.setFontSize(s) })), { focus: false, width: 80 }); });
  const size = h('div', { class: 'tb-size' }, B('sizedown', 'remove'), ui.sizeIn, B('sizeup', 'add'));
  ui.align = noFocus(h('button', { class: 'ib', 'data-tip': 'Perataan', 'aria-label': 'Perataan' }, icon('format_align_left')));
  ui.align.onclick = () => toggleMenu(ui.align, () => ['align-left', 'align-center', 'align-right', 'align-justify'].map(id => ({ label: CMD[id].label, icon: CMD[id].icon, kbd: CMD[id].kbd, checked: CMD[id].checked, run: () => run(id) })));
  const lh = noFocus(h('button', { class: 'ib', 'data-tip': 'Spasi baris & paragraf', 'aria-label': 'Spasi baris & paragraf' }, icon('format_line_spacing')));
  lh.onclick = () => toggleMenu(lh, spacingItems);
  const img = noFocus(h('button', { class: 'ib', 'data-tip': 'Sisipkan gambar', 'aria-label': 'Sisipkan gambar' }, icon('add_photo_alternate')));
  img.onclick = () => toggleMenu(img, imageItems);
  ui.mode = drop('tb-mode', 'Mode', modeItems, { align: 'right' });

  const groups = [
    ['g-hist', [B('undo'), B('redo'), B('print'), B('spell'), B('paintformat')]],
    ['g-zoom', [ui.zoom]],
    ['g-style', [ui.style]],
    ['g-font', [ui.font]],
    ['g-size', [size]],
    ['g-fmt', [B('bold'), B('italic'), B('underline'), colorBtn('fore'), colorBtn('hilite')]],
    ['g-ins', [B('link'), B('comment'), img]],
    ['g-para', [ui.align, lh]],
    ['g-list', [B('checklist'), split('bullets', bulletStyles, 'Gaya butir'), split('numbers', numberStyles, 'Gaya penomoran')]],
    ['g-ind', [B('outdent'), B('indent')]],
    ['g-clear', [B('clearfmt')]],
  ];
  ui.groups = [];
  const tb = ui.toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Format' }, ui.search, sep());
  groups.forEach(([id, kids], i) => {
    const g = h('div', { class: 'tb-g', dataset: { g: id } }, kids);
    ui.groups.push(g);
    tb.append(g);
    if (i < groups.length - 1) tb.append(sep());
  });
  ui.more = noFocus(h('button', { class: 'ib tb-more', 'data-tip': 'Lainnya', 'aria-label': 'Lainnya' }, icon('more_vert')));
  ui.more.onclick = () => {
    const hidden = ui.groups.filter(g => g.classList.contains('hidden'));
    const box = h('div', { class: 'tb-pop' });
    hidden.forEach(g => { g.classList.remove('hidden'); box.append(g); });
    toggleMenu(ui.more, [{ el: box }], { cls: 'pop', align: 'right', onClose: () => { hidden.forEach(g => { g.classList.add('hidden'); ui.groupSlots.get(g).after(g); }); } });
  };
  ui.compactBtn = noFocus(h('button', { class: 'ib', 'data-tip': 'Sembunyikan menu', 'data-kbd': 'Mod+Shift+F', onclick: () => E.toggleCompact() }, icon('keyboard_arrow_up')));
  tb.append(h('div', { class: 'tb-right' }, ui.more, ui.mode, ui.compactBtn));
  ui.groupSlots = new Map(ui.groups.map(g => { const slot = document.createComment(''); g.before(slot); return [g, slot]; }));

  ui.top = h('header', { class: 'ed-top glass refract' },
    h('div', { class: 'ed-r1' },
      h('a', { class: 'ed-logo', href: '#/', 'data-tip': 'Beranda Docs', 'aria-label': 'Beranda Docs' }, h('img', { src: 'assets/icon.svg', alt: '' })),
      h('div', { class: 'ed-tw' }, h('div', { class: 'ed-trow' }, ui.title, ui.star, ui.lockB, ui.saved), ui.menubar),
      actions),
    tb);

  // Canvas
  E.canvas = h('div', { class: 'canvas', tabindex: '-1' });
  E.inner = h('div', { class: 'canvas-inner' });
  E.ruler = h('div', { class: 'ruler glass' });
  E.zoomer = h('div', { class: 'zoomer' });
  E.pages = h('div', { class: 'pages' });
  E.bg = h('div', { class: 'sheets-bg' });
  E.fg = h('div', { class: 'sheets-fg' });
  E.body = h('div', { class: 'doc-body doc-root', contenteditable: 'true', spellcheck: Prefs.spell ? 'true' : 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Isi dokumen' });
  E.cmtCol = h('div', { class: 'cmt-col' });
  E.pages.append(E.bg, E.body, E.fg);
  E.zoomer.append(E.pages);
  E.inner.append(E.ruler, E.zoomer, E.cmtCol);
  E.canvas.append(E.inner);

  // Status bar
  ui.stPage = h('button', { class: 'st', 'data-tip': 'Buka garis besar', onclick: () => run('outline') });
  ui.stWords = h('button', { class: 'st', 'data-tip': 'Jumlah kata', onclick: () => run('wordcount') });
  ui.stLang = h('button', { class: 'st hide-sm', 'data-tip': 'Bahasa dokumen' });
  ui.stLang.onclick = () => toggleMenu(ui.stLang, () => [{ label: 'Bahasa Indonesia', checked: () => E.doc.lang !== 'en', run: () => E.setLang('id') }, { label: 'English', checked: () => E.doc.lang === 'en', run: () => E.setLang('en') }], { side: 'above' });
  ui.vRead = noFocus(h('button', { class: 'ib hide-sm', 'data-tip': 'Mode baca', onclick: () => E.toggleRead() }, icon('chrome_reader_mode')));
  ui.vPrint = noFocus(h('button', { class: 'ib hide-sm', 'data-tip': 'Tata letak cetak', onclick: () => E.togglePageless(false) }, icon('description')));
  ui.vWeb = noFocus(h('button', { class: 'ib hide-sm', 'data-tip': 'Tanpa halaman', onclick: () => E.togglePageless(true) }, icon('web')));
  ui.zSlider = h('input', { type: 'range', class: 'zslider', min: 30, max: 200, step: 5, 'aria-label': 'Zoom' });
  ui.zSlider.addEventListener('input', () => E.setZoom(ui.zSlider.value / 100));
  ui.zLabel = h('button', { class: 'st', 'data-tip': 'Zoom' });
  ui.zLabel.onclick = () => toggleMenu(ui.zLabel, zoomItems, { side: 'above', align: 'right' });
  ui.status = h('footer', { class: 'status glass refract' }, ui.stPage, h('div', { class: 'tb-sep hide-sm' }), ui.stWords, h('div', { class: 'tb-sep hide-sm' }), ui.stLang, h('div', { class: 'tb-sep hide-sm' }), ui.vRead, ui.vPrint, ui.vWeb, h('div', { class: 'tb-sep hide-sm' }),
    noFocus(h('button', { class: 'ib hide-sm', 'aria-label': 'Perkecil', onclick: () => run('zoomout') }, icon('remove'))), ui.zSlider, noFocus(h('button', { class: 'ib hide-sm', 'aria-label': 'Perbesar', onclick: () => run('zoomin') }, icon('add'))), ui.zLabel);
  ui.wc = h('div', { class: 'wc-chip glass', hidden: true, onclick: () => run('wordcount') });
  ui.focusExit = h('button', { class: 'btn btn-tonal focus-exit glass', onclick: () => E.toggleFocus(false) }, icon('close_fullscreen'), 'Keluar mode fokus');

  root.append(E.canvas, ui.top, ui.status, ui.wc, ui.focusExit);
  E.root = root;
  return root;
}

export function refreshAvatar() {
  const ui = E.ui;
  ui.av.replaceChildren(avatar(me()));
  ui.av.dataset.tip = me();
}

export function setSaveState(s) {
  const el = E.ui.saved;
  if (!el) return;
  const live = E.live && s !== 'error' && E.liveState;   // shared document: show the sync state instead
  if (live) {
    el.classList.toggle('saving', live[0] === 'sync');
    el.replaceChildren(icon(live[0]), h('span', { class: 't' }, live[1]));
    el.dataset.tip = live[2] || live[1];
    return;
  }
  el.classList.toggle('saving', s === 'saving');
  el.replaceChildren(icon(s === 'saving' ? 'sync' : s === 'error' ? 'cloud_off' : 'cloud_done'), h('span', { class: 't' }, s === 'saving' ? 'Menyimpan…' : s === 'error' ? 'Gagal menyimpan' : 'Tersimpan'));
}

export function updateToolbar(o = {}) {
  const ui = E.ui;
  if (!ui.toolbar || !E.doc) return;
  for (const b of ui.toolbar.querySelectorAll('[data-cmd]')) {
    const c = CMD[b.dataset.cmd];
    b.classList.toggle('on', !!c.active?.());
    b.classList.toggle('dis', c.enabled ? !c.enabled() : false);
  }
  ui.style.querySelector('.l').textContent = STYLE_NAMES[F.currentStyle()] || 'Teks normal';
  const font = F.currentFont();
  ui.font.querySelector('.l').textContent = font;
  ui.font.querySelector('.l').style.fontFamily = '';
  if (document.activeElement !== ui.sizeIn) ui.sizeIn.value = String(o.size ?? F.currentSize()).replace('.', ',');
  ui.zoom.querySelector('.l').textContent = E.zoomFit ? 'Pas' : Math.round(E.zoom * 100) + '%';
  ui.align.firstChild.textContent = CMD['align-' + F.currentAlign()].icon;
  try {
    const fc = toHex(document.queryCommandValue('foreColor'));
    E.ui.fore = fc; ui.foreBar.style.color = fc || '#000';
    const bc = toHex(document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor'));
    E.ui.hilite = bc; ui.hiliteBar.style.color = bc && bc !== 'transparent' && bc !== '#ffffff' ? bc : 'transparent';
  } catch {}
  const m = { edit: ['edit', 'Mengedit'], suggest: ['rate_review', 'Menyarankan'], view: ['visibility', 'Melihat'] }[E.mode];
  ui.mode.replaceChildren(icon(m[0], 'sm'), h('span', { class: 'l' }, m[1]), icon('arrow_drop_down'));
  ui.star.replaceChildren(icon('star', E.doc.starred ? 'fill star-on' : ''));
  ui.star.dataset.tip = E.doc.starred ? 'Hapus bintang' : 'Beri bintang';
  ui.lockB.hidden = !E.doc.lock;
}

export function updateStatus() {
  const ui = E.ui;
  if (!ui.status || !E.doc) return;
  const total = E.doc.page.pageless ? 1 : E.pageCount;
  const cur = Math.min(total, (E.caretPage?.() ?? E.scrollPage?.() ?? 0) + 1);
  ui.stPage.textContent = E.doc.page.pageless ? 'Tanpa halaman' : `Halaman ${cur} dari ${total}`;
  const c = E._wc || { words: 0 };
  const sel = E.range()?.toString();
  const sw = sel && sel.length > 1 ? countText(sel).words : 0;
  ui.stWords.textContent = sw ? `${fmtNum(sw)} dari ${fmtNum(c.words)} kata` : `${fmtNum(c.words)} kata`;
  ui.stLang.textContent = E.doc.lang === 'en' ? 'English' : 'Bahasa Indonesia';
  ui.zLabel.textContent = Math.round(E.zoom * 100) + '%';
  if (document.activeElement !== ui.zSlider) ui.zSlider.value = Math.round(E.zoom * 100);
  ui.vPrint.classList.toggle('on', !E.doc.page.pageless && !E.root.classList.contains('reading'));
  ui.vWeb.classList.toggle('on', !!E.doc.page.pageless);
  ui.vRead.classList.toggle('on', E.root.classList.contains('reading'));
  ui.wc.hidden = !Prefs.wordCount;
  if (Prefs.wordCount) ui.wc.textContent = sw ? `${fmtNum(sw)} dari ${fmtNum(c.words)} kata` : `${fmtNum(c.words)} kata`;
}

// Hide trailing toolbar groups into a "more" popover when space runs out.
export function layoutToolbar() {
  const ui = E.ui;
  if (!ui.toolbar) return;
  closeMenus(0);
  ui.groups.forEach(g => g.classList.remove('hidden'));
  ui.toolbar.querySelectorAll('.tb-sep').forEach(s => s.classList.remove('hidden'));
  ui.more.classList.remove('show');
  const fits = () => ui.toolbar.scrollWidth <= ui.toolbar.clientWidth + 1;
  if (fits()) return;
  ui.more.classList.add('show');
  for (let i = ui.groups.length - 1; i >= 1 && !fits(); i--) {
    ui.groups[i].classList.add('hidden');
    const s = ui.groups[i].previousElementSibling;
    if (s?.classList.contains('tb-sep')) s.classList.add('hidden');
  }
}
export { MENUS };
