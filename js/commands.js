// Command registry, menu bar definitions, keyboard map and the menu search palette.
import { E, Prefs, savePrefs } from './state.js';
import { h, icon, toast, openMenu, closeMenus, palette, kbdLabel, ask, confirmDlg, pickFile } from './ui.js';
import * as F from './format.js';
import * as T from './tables.js';
import * as I from './images.js';
import * as L from './links.js';
import * as R from './review.js';
import * as P from './panels.js';
import * as D from './dialogs.js';
import * as N from './insert.js';
import * as IO from './io.js';
import { openFind } from './find.js';
import { toggleVoice } from './voice.js';
import { goHF, pageNumbersDialog } from './hf.js';
import { FONTS, fontCss } from './fonts.js';
import { STYLE_NAMES, PAPER, MARGINS, marginPreset } from './docmodel.js';
import * as Lock from './lock.js';
import { Theme } from './theme.js';

export const CMD = {};
const def = (id, o) => (CMD[id] = o);
export function run(id, arg) {
  const c = CMD[id];
  if (!c) return;
  if (c.enabled && !c.enabled()) return;
  return c.run(arg);
}
const q = c => { try { return document.queryCommandState(c); } catch { return false; } };
const editing = () => E.canEdit();
const inTable = () => !!T.curCell();

/* ---- Edit ---- */
def('undo', { label: 'Urungkan', icon: 'undo', kbd: 'Mod+Z', run: () => E.hist.undo(), enabled: () => E.hist.u.length > 0 && editing() });
def('redo', { label: 'Ulangi', icon: 'redo', kbd: 'Mod+Shift+Z', alt: ['Mod+Y'], run: () => E.hist.redo(), enabled: () => E.hist.r.length > 0 && editing() });
def('cut', { label: 'Potong', icon: 'content_cut', kbdShow: 'Mod+X', run: () => { E.restoreSel(); if (!document.execCommand('cut')) toast(`Gunakan ${kbdLabel('Mod+X')} untuk memotong`); } });
def('copy', { label: 'Salin', icon: 'content_copy', kbdShow: 'Mod+C', run: () => { E.restoreSel(); if (!document.execCommand('copy')) toast(`Gunakan ${kbdLabel('Mod+C')} untuk menyalin`); } });
def('paste', { label: 'Tempel', icon: 'content_paste', kbdShow: 'Mod+V', run: async () => { try { const t = await navigator.clipboard.readText(); E.restoreSel(); E.insertText(t); } catch { toast(`Gunakan ${kbdLabel('Mod+V')} untuk menempel`); } } });
def('pasteplain', { label: 'Tempel tanpa format', icon: 'content_paste_go', kbd: 'Mod+Shift+V', run: async () => { try { const t = await navigator.clipboard.readText(); E.restoreSel(); E.insertPlain(t); } catch { E._plainPaste = true; toast(`Tekan ${kbdLabel('Mod+V')} sekarang untuk menempel tanpa format`); } } });
def('selectall', { label: 'Pilih semua', icon: 'select_all', kbdShow: 'Mod+A', run: () => { E.body.focus(); const r = document.createRange(); r.selectNodeContents(E.body); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, passthrough: true });
def('delete', { label: 'Hapus', icon: 'backspace', run: () => { E.restoreSel(); document.execCommand('delete'); } });
def('find', { label: 'Cari', icon: 'search', kbd: 'Mod+F', global: true, run: () => openFind(false) });
def('replace', { label: 'Cari dan ganti', icon: 'find_replace', kbd: 'Mod+H', alt: ['Mod+Shift+H'], global: true, run: () => openFind(true) });

/* ---- File ---- */
def('new', { label: 'Dokumen baru', icon: 'note_add', run: () => E.app.newDoc() });
def('open', { label: 'Buka', icon: 'folder_open', kbd: 'Mod+O', global: true, run: () => E.app.openDialog() });
def('import', { label: 'Impor file…', icon: 'upload_file', run: async () => { const f = await pickFile('.docx,.html,.htm,.txt,.md,.json'); if (f.length) E.app.importFiles(f); } });
def('copydoc', { label: 'Buat salinan', icon: 'file_copy', run: () => E.app.copyDoc() });
def('share', { label: 'Bagikan', icon: 'person_add', run: () => IO.shareDialog() });
def('rename', { label: 'Ganti nama', icon: 'drive_file_rename_outline', run: () => { E.ui.title.focus(); E.ui.title.select(); } });
def('trash', { label: 'Pindahkan ke sampah', icon: 'delete', run: async () => { if (await confirmDlg('Pindahkan ke sampah?', 'Dokumen dapat dipulihkan dari Sampah di beranda selama 30 hari.', 'Pindahkan')) E.app.trashDoc(); } });
def('versions', { label: 'Lihat histori versi', icon: 'history', kbd: 'Mod+Alt+Shift+H', run: () => P.togglePanel('versions') });
def('nameversion', { label: 'Beri nama versi saat ini', icon: 'bookmark_add', run: () => P.nameVersion() });
def('docinfo', { label: 'Detail', icon: 'info', run: () => D.docInfoDialog() });
def('pagesetup', { label: 'Penyiapan halaman', icon: 'description', run: () => D.pageSetup() });
/* ---- Layout (kertas & margin) ---- */
const setPage = fn => { E.hist.before(); fn(E.doc.page); E.changed(); E.applyView(); };
for (const [k, n, v] of MARGINS) def('mg-' + k, { label: `${n}  ·  ${v.map(x => String(x).replace('.', ',')).join(' / ')} cm`, icon: 'margin', checked: () => marginPreset(E.doc.page.margins) === k, enabled: editing, run: () => setPage(p => { [p.margins.t, p.margins.b, p.margins.l, p.margins.r] = v; }) });
for (const [k, v] of Object.entries(PAPER)) def('ps-' + k, { label: `${v.n}  ·  ${v.d}`, checked: () => E.doc.page.size === k, enabled: editing, run: () => setPage(p => { p.size = k; }) });
def('mg-custom', { label: 'Margin kustom…', icon: 'tune', enabled: editing, run: () => D.pageSetup() });
def('lock-set', { label: () => E.doc?.lock ? 'Ubah kata sandi…' : 'Kunci dengan kata sandi…', icon: 'lock', enabled: () => editing() && !(E.doc?.share && !E.doc.share.owner), run: () => Lock.setDialog() });
def('lock-now', { label: 'Kunci sekarang', icon: 'lock_clock', enabled: () => !!E.doc?.lock, run: () => Lock.lockNow() });
def('lock-off', { label: 'Hapus kata sandi…', icon: 'lock_open', enabled: () => !!E.doc?.lock && editing(), run: () => Lock.removeDialog() });
def('print', { label: 'Cetak', icon: 'print', kbd: 'Mod+P', global: true, run: () => IO.printDoc(false) });
def('save', { label: 'Simpan', icon: 'save', kbd: 'Mod+S', global: true, run: () => { E.save(); toast('Semua perubahan tersimpan di perangkat ini'); } });
for (const [k, l] of [['docx', 'Microsoft Word (.docx)'], ['pdf', 'Dokumen PDF (.pdf)'], ['html', 'Halaman web (.html)'], ['md', 'Markdown (.md)'], ['txt', 'Teks biasa (.txt)'], ['json', 'Cadangan Amatu Docs (.json)']]) {
  def('dl-' + k, { label: l, run: async () => { if (k === 'pdf') return IO.printDoc(true); await E.save(); IO.exportDoc(E.doc, E.serialize(), k); } });
}

/* ---- View ---- */
def('mode-edit', { label: 'Mengedit', icon: 'edit', desc: 'Edit dokumen secara langsung', run: () => E.setMode('edit'), checked: () => E.mode === 'edit' });
def('mode-suggest', { label: 'Menyarankan', icon: 'rate_review', desc: 'Pengeditan menjadi saran yang dapat diterima atau ditolak', run: () => E.setMode('suggest'), checked: () => E.mode === 'suggest' });
def('mode-view', { label: 'Melihat', icon: 'visibility', desc: 'Baca atau cetak dokumen akhir', run: () => E.setMode('view'), checked: () => E.mode === 'view' });
def('pageless', { label: 'Tampilkan tata letak cetak', icon: 'description', checked: () => !E.doc.page.pageless, run: () => E.togglePageless() });
def('ruler', { label: 'Tampilkan penggaris', icon: 'straighten', checked: () => E.view.ruler, run: () => { E.view.ruler = !E.view.ruler; Prefs.ruler = E.view.ruler; savePrefs(); E.applyView(); } });
def('outline', { label: 'Tampilkan garis besar', icon: 'toc', kbd: 'Mod+Alt+A', checked: () => E.view.outline, run: () => P.toggleOutline() });
def('np', { label: 'Tampilkan karakter non-cetak', icon: 'format_paragraph', kbd: 'Mod+Shift+P', checked: () => E.view.np, run: () => { E.view.np = !E.view.np; E.body.classList.toggle('show-np', E.view.np); E.paginate(); } });
def('focus', { label: 'Mode fokus', icon: 'center_focus_strong', checked: () => E.root.classList.contains('focus'), run: () => E.toggleFocus() });
def('fullscreen', { label: 'Layar penuh', icon: 'fullscreen', checked: () => !!document.fullscreenElement, run: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); } });
def('compact', { label: 'Sembunyikan menu', icon: 'keyboard_arrow_up', kbd: 'Mod+Shift+F', checked: () => E.ui.top.classList.contains('compact'), run: () => E.toggleCompact() });
def('theme', { label: 'Tema & tampilan…', icon: 'palette', run: () => D.themeDialog() });
def('darkpaper', { label: 'Halaman gelap (mode malam)', icon: 'dark_mode', checked: () => !!Theme.p.paperDark, enabled: () => Theme.dark, run: () => Theme.set({ paperDark: !Theme.p.paperDark }) });
for (const z of [50, 75, 90, 100, 125, 150, 200]) def('zoom-' + z, { label: z + '%', checked: () => !E.zoomFit && Math.round(E.zoom * 100) === z, run: () => E.setZoom(z / 100) });
def('zoom-fit', { label: 'Sesuaikan lebar', checked: () => E.zoomFit, run: () => E.setZoom('fit') });
def('zoomin', { label: 'Perbesar', icon: 'zoom_in', kbd: 'Mod+Alt+=', run: () => E.setZoom(Math.min(3, Math.round((E.zoom + .1) * 10) / 10)) });
def('zoomout', { label: 'Perkecil', icon: 'zoom_out', kbd: 'Mod+Alt+-', run: () => E.setZoom(Math.max(.3, Math.round((E.zoom - .1) * 10) / 10)) });

/* ---- Insert ---- */
def('img-upload', { label: 'Unggah dari komputer', icon: 'upload', run: async () => { const f = await pickFile('image/*', true); E.restoreSel(); I.insertFiles(f); }, enabled: editing });
def('img-url', { label: 'Dengan URL', icon: 'link', run: () => I.insertByUrl(), enabled: editing });
def('img-camera', { label: 'Kamera', icon: 'photo_camera', run: () => I.insertFromCamera(), enabled: editing });
def('drawing', { label: 'Gambar baru', icon: 'draw', run: () => N.drawingDialog(), enabled: editing });
def('hr', { label: 'Garis horizontal', icon: 'horizontal_rule', run: () => N.hRule(), enabled: editing });
def('chars', { label: 'Karakter khusus', icon: 'special_character', run: () => N.specialChars(), enabled: editing });
def('equation', { label: 'Persamaan', icon: 'function', kbd: 'Mod+Alt+E', run: () => N.equationDialog(), enabled: editing });
def('datechip', { label: 'Chip tanggal', icon: 'calendar_month', run: () => N.insertDateChip(), enabled: editing });
def('datetime', { label: 'Tanggal & waktu…', icon: 'schedule', run: () => N.dateTimeDialog(), enabled: editing });
def('footnote', { label: 'Catatan kaki', icon: 'format_list_numbered', kbd: 'Mod+Alt+F', run: () => N.insertFootnote(), enabled: editing });
def('header', { label: 'Header', icon: 'vertical_align_top', kbd: 'Mod+Alt+O', run: () => goHF('header'), enabled: editing });
def('footer', { label: 'Footer', icon: 'vertical_align_bottom', kbd: 'Mod+Alt+B', run: () => goHF('footer'), enabled: editing });
def('pagenumbers', { label: 'Nomor halaman…', icon: 'tag', run: () => pageNumbersDialog(), enabled: editing });
def('pagebreak', { label: 'Pemisah halaman', icon: 'insert_page_break', kbd: 'Mod+Enter', run: () => N.pageBreak(), enabled: editing });
def('link', { label: 'Tautan', icon: 'link', kbd: 'Mod+K', run: () => L.linkDialog(), enabled: editing });
def('comment', { label: 'Komentar', icon: 'add_comment', kbd: 'Mod+Alt+M', run: () => R.addComment() });
def('bookmark', { label: 'Bookmark', icon: 'bookmark', run: () => L.insertBookmark(), enabled: editing });
def('toc-num', { label: 'Dengan nomor halaman', icon: 'format_list_numbered', run: () => N.insertToc('numbers'), enabled: editing });
def('toc-link', { label: 'Dengan tautan biru', icon: 'link', run: () => N.insertToc('links'), enabled: editing });
def('watermark', { label: 'Watermark…', icon: 'branding_watermark', run: () => D.watermarkDialog(), enabled: editing });
for (const [k, l, ic] of [['column', 'Kolom', 'bar_chart'], ['bar', 'Batang', 'align_horizontal_left'], ['line', 'Garis', 'show_chart'], ['pie', 'Lingkaran', 'pie_chart']]) def('chart-' + k, { label: l, icon: ic, run: () => N.chartDialog(k), enabled: editing });

/* ---- Format: text ---- */
def('bold', { label: 'Tebal', icon: 'format_bold', kbd: 'Mod+B', run: () => E.exec('bold'), active: () => q('bold'), enabled: editing });
def('italic', { label: 'Miring', icon: 'format_italic', kbd: 'Mod+I', run: () => E.exec('italic'), active: () => q('italic'), enabled: editing });
def('underline', { label: 'Garis bawah', icon: 'format_underlined', kbd: 'Mod+U', run: () => E.exec('underline'), active: () => q('underline'), enabled: editing });
def('strike', { label: 'Coret', icon: 'strikethrough_s', kbd: 'Mod+Shift+X', alt: ['Alt+Shift+5'], run: () => E.exec('strikeThrough'), active: () => q('strikeThrough'), enabled: editing });
def('superscript', { label: 'Superskrip', icon: 'superscript', kbd: 'Mod+.', run: () => E.exec('superscript'), active: () => q('superscript'), enabled: editing });
def('subscript', { label: 'Subskrip', icon: 'subscript', kbd: 'Mod+,', run: () => E.exec('subscript'), active: () => q('subscript'), enabled: editing });
def('sizeup', { label: 'Perbesar ukuran font', icon: 'text_increase', kbd: 'Mod+Shift+.', run: () => F.stepSize(1), enabled: editing });
def('sizedown', { label: 'Perkecil ukuran font', icon: 'text_decrease', kbd: 'Mod+Shift+,', run: () => F.stepSize(-1), enabled: editing });
for (const [k, l] of [['lower', 'huruf kecil'], ['upper', 'HURUF BESAR'], ['title', 'Huruf Judul'], ['sentence', 'Huruf kalimat']]) def('case-' + k, { label: l, run: () => F.changeCase(k), enabled: editing });
def('clearfmt', { label: 'Hapus format', icon: 'format_clear', kbd: 'Mod+\\', alt: ['Mod+Space'], run: () => F.clearFormatting(), enabled: editing });
def('paintformat', { label: 'Salin format', icon: 'format_paint', run: () => E.paint ? F.endPaint() : F.capturePaint(false), active: () => !!E.paint, enabled: editing });

/* ---- Format: paragraph ---- */
for (const k of ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code']) {
  const kb = { normal: 'Mod+Alt+0', h1: 'Mod+Alt+1', h2: 'Mod+Alt+2', h3: 'Mod+Alt+3', h4: 'Mod+Alt+4', h5: 'Mod+Alt+5', h6: 'Mod+Alt+6' }[k];
  def('st-' + k, { label: STYLE_NAMES[k], kbd: kb, run: () => F.setStyle(k), checked: () => F.currentStyle() === k, enabled: editing });
}
for (const [k, l, ic, kb] of [['left', 'Rata kiri', 'format_align_left', 'Mod+Shift+L'], ['center', 'Rata tengah', 'format_align_center', 'Mod+Shift+E'], ['right', 'Rata kanan', 'format_align_right', 'Mod+Shift+R'], ['justify', 'Rata kiri-kanan', 'format_align_justify', 'Mod+Shift+J']]) {
  def('align-' + k, { label: l, icon: ic, kbd: kb, run: () => F.align(k), checked: () => F.currentAlign() === k, enabled: editing });
}
def('indent', { label: 'Tambah indentasi', icon: 'format_indent_increase', kbd: 'Mod+]', run: () => F.indent(1), enabled: editing });
def('outdent', { label: 'Kurangi indentasi', icon: 'format_indent_decrease', kbd: 'Mod+[', run: () => F.indent(-1), enabled: editing });
def('indentopts', { label: 'Opsi indentasi…', icon: 'format_indent_increase', run: () => D.indentDialog(), enabled: editing });
def('bullets', { label: 'Daftar berbutir', icon: 'format_list_bulleted', kbd: 'Mod+Shift+8', run: () => F.toggleList('bullet'), active: () => !!F.inTag('ul') && !F.inTag('ul').classList.contains('checklist'), enabled: editing });
def('numbers', { label: 'Daftar bernomor', icon: 'format_list_numbered', kbd: 'Mod+Shift+7', run: () => F.toggleList('number'), active: () => !!F.inTag('ol'), enabled: editing });
def('checklist', { label: 'Checklist', icon: 'checklist', kbd: 'Mod+Shift+9', run: () => F.toggleList('check'), active: () => !!F.inTag('ul.checklist'), enabled: editing });
def('restartnum', { label: 'Mulai ulang penomoran', icon: 'restart_alt', run: () => F.restartNumbering(), enabled: () => editing() && !!F.inTag('ol') });
for (const v of [1, 1.15, 1.5, 2]) def('lh-' + v, { label: { 1: 'Tunggal', 1.15: '1,15', 1.5: '1,5', 2: 'Ganda' }[v], checked: () => Math.abs((F.currentLineHeight() || 0) - v) < .01, run: () => F.setLineHeight(v), enabled: editing });
def('sb-toggle', { label: () => F.hasSpace('before') ? 'Hapus spasi sebelum paragraf' : 'Tambahkan spasi sebelum paragraf', run: () => F.setSpace('before', F.hasSpace('before') ? 0 : 10), enabled: editing });
def('sa-toggle', { label: () => F.hasSpace('after') ? 'Hapus spasi setelah paragraf' : 'Tambahkan spasi setelah paragraf', run: () => F.setSpace('after', F.hasSpace('after') ? 0 : 10), enabled: editing });
def('spacing-custom', { label: 'Spasi khusus…', run: () => D.customSpacing(), enabled: editing });
for (const n of [1, 2, 3]) def('cols-' + n, { label: n === 1 ? 'Satu kolom' : `${n} kolom`, icon: n === 1 ? 'view_agenda' : n === 2 ? 'view_column_2' : 'view_week', checked: () => F.currentColumns() === n, run: () => F.setColumns(n), enabled: editing });
def('dropcap', { label: 'Drop cap', icon: 'format_size', checked: () => !!F.blockOf(E.range()?.startContainer)?.classList?.contains('dropcap'), run: () => F.toggleDropCap(), enabled: editing });
def('borders', { label: 'Border & bayangan…', icon: 'border_style', run: () => D.bordersDialog(), enabled: editing });
def('styles', { label: 'Ubah gaya paragraf…', icon: 'style', run: () => D.stylesDialog(F.currentStyle() === 'quote' || F.currentStyle() === 'code' ? 'normal' : F.currentStyle()) });
def('styles-default', { label: 'Simpan sebagai gaya default saya', icon: 'bookmark_added', run: () => D.saveStylesAsDefault() });
def('styles-reset', { label: 'Setel ulang gaya', icon: 'restart_alt', run: () => { E.hist.before(); E.doc.styles = {}; E.applyDocStyles(); E.changed(); toast('Gaya dikembalikan ke bawaan'); }, enabled: editing });
def('orient-portrait', { label: 'Potret', icon: 'crop_portrait', checked: () => E.doc.page.orient !== 'landscape', run: () => { E.hist.before(); E.doc.page.orient = 'portrait'; E.changed(); }, enabled: editing });
def('orient-landscape', { label: 'Lanskap', icon: 'crop_landscape', checked: () => E.doc.page.orient === 'landscape', run: () => { E.hist.before(); E.doc.page.orient = 'landscape'; E.changed(); }, enabled: editing });

/* ---- Tables ---- */
const tb = (id, label, ic, fn) => def(id, { label, icon: ic, run: fn, enabled: () => editing() && inTable() });
tb('t-row-above', 'Sisipkan baris di atas', 'add_row_above', () => T.insertRow(false));
tb('t-row-below', 'Sisipkan baris di bawah', 'add_row_below', () => T.insertRow(true));
tb('t-col-left', 'Sisipkan kolom di kiri', 'add_column_left', () => T.insertCol(false));
tb('t-col-right', 'Sisipkan kolom di kanan', 'add_column_right', () => T.insertCol(true));
tb('t-del-row', 'Hapus baris', 'delete_sweep', () => T.deleteRow());
tb('t-del-col', 'Hapus kolom', 'delete_sweep', () => T.deleteCol());
tb('t-del', 'Hapus tabel', 'delete', () => T.deleteTable());
tb('t-merge', 'Gabungkan sel', 'cell_merge', () => T.mergeCells());
tb('t-unmerge', 'Pisahkan sel', 'call_split', () => T.unmergeCell());
tb('t-dist', 'Ratakan lebar kolom', 'view_column', () => T.distributeCols());
tb('t-header', 'Jadikan baris judul', 'table_rows', () => T.toggleHeaderRow());
tb('t-sort-asc', 'Urutkan tabel A → Z', 'arrow_downward', () => T.sortTable(1));
tb('t-sort-desc', 'Urutkan tabel Z → A', 'arrow_upward', () => T.sortTable(-1));
tb('t-props', 'Properti tabel…', 'tune', () => T.tableProps());
for (const [k, l] of [['top', 'Atas'], ['middle', 'Tengah'], ['bottom', 'Bawah']]) tb('t-va-' + k, 'Perataan vertikal: ' + l, 'vertical_align_' + (k === 'middle' ? 'center' : k), () => T.cellVAlign(k));

/* ---- Tools ---- */
def('spell', { label: 'Pemeriksaan ejaan', icon: 'spellcheck', checked: () => Prefs.spell, run: () => { Prefs.spell = !Prefs.spell; savePrefs(); E.body.spellcheck = Prefs.spell; E.body.blur(); E.body.focus(); toast(Prefs.spell ? 'Pemeriksaan ejaan aktif' : 'Pemeriksaan ejaan nonaktif'); } });
def('wordcount', { label: 'Jumlah kata', icon: 'format_list_numbered_rtl', kbd: 'Mod+Shift+C', global: true, run: () => D.wordCountDialog() });
def('review', { label: 'Tinjau saran perubahan', icon: 'rate_review', kbd: 'Mod+Alt+Shift+U', run: () => P.togglePanel('suggest') });
def('comments', { label: 'Semua komentar', icon: 'comment', run: () => P.togglePanel('comments') });
def('citations', { label: 'Kutipan & daftar pustaka', icon: 'format_quote', run: () => P.togglePanel('cite') });
def('voice', { label: 'Ketik dengan suara', icon: 'mic', kbd: 'Mod+Shift+S', run: () => toggleVoice() });
def('sort-asc', { label: 'Urutkan paragraf A → Z', icon: 'sort_by_alpha', run: () => F.sortBlocks(1), enabled: editing });
def('sort-desc', { label: 'Urutkan paragraf Z → A', icon: 'sort_by_alpha', run: () => F.sortBlocks(-1), enabled: editing });
def('prefs', { label: 'Preferensi', icon: 'settings', run: () => D.prefsDialog() });
def('lang-id', { label: 'Bahasa Indonesia', checked: () => E.doc.lang !== 'en', run: () => E.setLang('id') });
def('lang-en', { label: 'English', checked: () => E.doc.lang === 'en', run: () => E.setLang('en') });

/* ---- Help ---- */
def('shortcuts', { label: 'Pintasan keyboard', icon: 'keyboard', kbd: 'Mod+/', global: true, run: () => D.shortcutsDialog(CMD) });
def('menusearch', { label: 'Telusuri menu', icon: 'search', kbd: 'Alt+/', global: true, run: () => menuSearch() });
def('about', { label: 'Tentang Amatu Docs', icon: 'info', run: () => D.aboutDialog() });

/* ---------------- Menus ---------------- */
export function item(id, extra) {
  if (id === '-') return { sep: true };
  const c = CMD[id];
  if (!c) return null;
  return { label: typeof c.label === 'function' ? c.label() : c.label, icon: c.icon, kbd: c.kbd || c.kbdShow, desc: c.desc, run: () => run(id), enabled: c.enabled, checked: c.checked, ...extra };
}
const I_ = (...ids) => ids.map(x => typeof x === 'string' ? item(x) : x);
const sub = (label, ic, items, extra) => ({ label, icon: ic, sub: () => I_(...(typeof items === 'function' ? items() : items)), ...extra });

export function tableGrid(onPick) {
  const g = h('div', { class: 'tgrid' });
  const lbl = h('div', { class: 'tgrid-l' }, '1 × 1');
  for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) {
    const cell = h('i', { dataset: { r, c } });
    g.append(cell);
  }
  g.addEventListener('mouseover', e => {
    const t = e.target.closest('i'); if (!t) return;
    const R = +t.dataset.r, C = +t.dataset.c;
    g.querySelectorAll('i').forEach(x => x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C));
    lbl.textContent = `${C + 1} × ${R + 1}`;
  });
  g.addEventListener('click', e => { const t = e.target.closest('i'); if (!t) return; closeMenus(0); onPick(+t.dataset.r + 1, +t.dataset.c + 1); });
  return h('div', null, g, lbl);
}
export function bulletStyles() {
  const S = [['disc', '●  ○  ■'], ['"➢  "', '➢  ■  ●'], ['"→  "', '→  ●  ○'], ['"★  "', '★  ○  ■'], ['"❖  "', '❖  ➢  ■'], ['"–  "', '–  –  –'], ['"✓  "', '✓  ●  ○'], ['square', '■  ○  ●']];
  return S.map(([v, l]) => ({ label: l, style: { letterSpacing: '2px' }, run: () => F.setListStyle('bullet', v) }));
}
export function numberStyles() {
  const S = [['decimal', '1.  a.  i.'], ['upper-alpha', 'A.  B.  C.'], ['lower-alpha', 'a.  b.  c.'], ['upper-roman', 'I.  II.  III.'], ['lower-roman', 'i.  ii.  iii.'], ['decimal-leading-zero', '01.  02.  03.']];
  return [...S.map(([v, l]) => ({ label: l, run: () => F.setListStyle('number', v) })), { sep: true }, item('restartnum')];
}
export function fontItems() {
  const recent = Prefs.recentFonts.filter(n => FONTS.some(f => f.n === n));
  const mk = f => ({ label: f.n, style: { fontFamily: fontCss(f.n) }, checked: () => F.currentFont() === f.n, run: () => F.setFont(f.n) });
  return [...(recent.length ? [{ head: 'Terbaru' }, ...recent.map(n => mk(FONTS.find(f => f.n === n))), { sep: true }] : []), ...FONTS.map(mk)];
}
export function styleItems() {
  const prev = { normal: {}, title: { fontSize: '22px' }, subtitle: { fontSize: '15px', color: 'var(--tx3)' }, h1: { fontSize: '19px' }, h2: { fontSize: '17px' }, h3: { fontSize: '15.5px', color: 'var(--tx2)' }, h4: { fontSize: '14.5px', color: 'var(--tx3)' }, h5: { fontSize: '14px', color: 'var(--tx3)' }, h6: { fontSize: '14px', fontStyle: 'italic', color: 'var(--tx3)' }, quote: { fontStyle: 'italic' }, code: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '13px' } };
  const st = k => ({
    label: STYLE_NAMES[k], style: prev[k], checked: () => F.currentStyle() === k, kbd: CMD['st-' + k]?.kbd, run: () => F.setStyle(k),
    ...(k !== 'quote' && k !== 'code' ? { sub: [{ label: `Terapkan "${STYLE_NAMES[k]}"`, run: () => F.setStyle(k) }, { label: `Perbarui "${STYLE_NAMES[k]}" agar cocok`, run: () => F.updateStyleFromSelection(k) }], subCls: '' } : {}),
  });
  const items = ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code'].map(st);
  return [...items, { sep: true }, sub('Opsi', 'tune', ['styles', 'styles-default', 'styles-reset'])];
}
export function zoomItems() { return I_('zoom-fit', '-', 'zoom-50', 'zoom-75', 'zoom-90', 'zoom-100', 'zoom-125', 'zoom-150', 'zoom-200'); }
export function spacingItems() { return I_('lh-1', 'lh-1.15', 'lh-1.5', 'lh-2', '-', 'sb-toggle', 'sa-toggle', '-', 'spacing-custom'); }
export function imageItems() { return I_('img-upload', 'img-url', 'img-camera', '-', 'drawing'); }
export function modeItems() { return I_('mode-edit', 'mode-suggest', 'mode-view'); }
export function tableItems() {
  return I_('t-row-above', 't-row-below', 't-col-left', 't-col-right', '-', 't-del-row', 't-del-col', 't-del', '-', 't-merge', 't-unmerge', 't-dist', 't-header', '-',
    sub('Perataan vertikal sel', 'vertical_align_center', ['t-va-top', 't-va-middle', 't-va-bottom']),
    { label: 'Warna latar sel', icon: 'format_color_fill', enabled: () => editing() && inTable(), sub: () => [{ el: palette({ value: '', reset: 'Tidak ada', onPick: c => { closeMenus(0); T.cellBg(c); } }) }], subCls: 'pop' },
    sub('Urutkan tabel', 'sort', ['t-sort-asc', 't-sort-desc']), '-', 't-props');
}

export const MENUS = [
  { id: 'file', label: 'Berkas', items: () => I_(
    sub('Baru', 'add', ['new', { label: 'Dari template', icon: 'library_books', run: () => { location.hash = '#/'; } }]), 'open', 'import', 'copydoc', '-',
    'share', '-',
    sub('Download', 'download', ['dl-docx', 'dl-pdf', 'dl-html', 'dl-md', 'dl-txt', 'dl-json']), '-',
    'rename', 'trash', '-',
    sub('Histori versi', 'history', ['nameversion', 'versions']), '-',
    'docinfo', sub('Bahasa', 'language', ['lang-id', 'lang-en']), '-',
    sub('Keamanan', 'lock', ['lock-set', 'lock-now', 'lock-off']), '-',
    'pagesetup', 'print') },
  { id: 'edit', label: 'Edit', items: () => I_('undo', 'redo', '-', 'cut', 'copy', 'paste', 'pasteplain', '-', 'selectall', 'delete', '-', 'replace') },
  { id: 'view', label: 'Tampilan', items: () => I_(sub('Mode', 'edit', ['mode-edit', 'mode-suggest', 'mode-view']), '-', 'pageless', 'ruler', 'outline', 'np', '-', sub('Zoom', 'zoom_in', ['zoom-fit', '-', 'zoom-50', 'zoom-75', 'zoom-90', 'zoom-100', 'zoom-125', 'zoom-150', 'zoom-200', '-', 'zoomin', 'zoomout']), '-', 'focus', 'fullscreen', 'compact', '-', 'theme', 'darkpaper') },
  { id: 'insert', label: 'Sisipkan', items: () => I_(
    sub('Gambar', 'image', ['img-upload', 'img-url', 'img-camera']),
    { label: 'Tabel', icon: 'table', enabled: editing, sub: () => [{ el: () => tableGrid((r, c) => T.insertTable(r, c)) }], subCls: 'pop' },
    sub('Gambar bebas', 'draw', ['drawing']),
    sub('Diagram', 'insert_chart', ['chart-column', 'chart-bar', 'chart-line', 'chart-pie']),
    'hr', '-',
    'chars', 'equation', '-',
    sub('Smart chip', 'alternate_email', ['datechip']), 'datetime', '-',
    'footnote', sub('Header & footer', 'call_to_action', ['header', 'footer']), sub('Nomor halaman', 'tag', [{ label: 'Di footer, kanan', icon: 'vertical_align_bottom', run: () => quickNumbers('footer') }, { label: 'Di header, kanan', icon: 'vertical_align_top', run: () => quickNumbers('header') }, '-', 'pagenumbers']),
    sub('Pemisah', 'insert_page_break', ['pagebreak']), '-',
    'link', 'comment', 'bookmark', sub('Daftar isi', 'toc', ['toc-num', 'toc-link']), '-', 'watermark') },
  { id: 'format', label: 'Format', items: () => I_(
    sub('Teks', 'format_bold', ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', '-', 'sizeup', 'sizedown', '-', { label: 'Kapitalisasi', icon: 'match_case', sub: () => I_('case-lower', 'case-upper', 'case-title', 'case-sentence') }]),
    { label: 'Gaya paragraf', icon: 'format_paragraph', sub: styleItems },
    sub('Perataan & indentasi', 'format_align_left', ['align-left', 'align-center', 'align-right', 'align-justify', '-', 'indent', 'outdent', '-', 'indentopts']),
    sub('Spasi baris & paragraf', 'format_line_spacing', spacingItems().map(x => x)),
    sub('Kolom', 'view_column', ['cols-1', 'cols-2', 'cols-3']),
    { label: 'Butir & penomoran', icon: 'format_list_bulleted', sub: () => [{ label: 'Daftar berbutir', icon: 'format_list_bulleted', sub: bulletStyles }, { label: 'Daftar bernomor', icon: 'format_list_numbered', sub: numberStyles }, item('checklist')] },
    '-',
    sub('Header & footer', 'call_to_action', ['header', 'footer']), 'pagenumbers', sub('Orientasi halaman', 'screen_rotation', ['orient-portrait', 'orient-landscape']), '-',
    { label: 'Tabel', icon: 'table', sub: tableItems },
    'borders', 'dropcap', '-',
    'paintformat', 'clearfmt') },
  { id: 'layout', label: 'Tata letak', items: () => I_(
    sub('Margin', 'margin', [...MARGINS.map(([k]) => 'mg-' + k), '-', 'mg-custom']),
    sub('Orientasi', 'screen_rotation', ['orient-portrait', 'orient-landscape']),
    sub('Ukuran kertas', 'description', [...Object.keys(PAPER).map(k => 'ps-' + k), '-', { label: 'Ukuran & warna lainnya…', icon: 'tune', run: () => D.pageSetup() }]),
    sub('Kolom', 'view_column', ['cols-1', 'cols-2', 'cols-3']),
    sub('Pemisah', 'insert_page_break', ['pagebreak']), '-',
    sub('Header & footer', 'call_to_action', ['header', 'footer']), 'pagenumbers', 'watermark', '-',
    'pageless', 'ruler', '-',
    'pagesetup') },
  { id: 'tools', label: 'Alat', items: () => I_('spell', 'wordcount', '-', 'review', 'comments', 'citations', '-', 'voice', sub('Urutkan paragraf', 'sort_by_alpha', ['sort-asc', 'sort-desc']), '-', 'prefs') },
  { id: 'help', label: 'Bantuan', items: () => I_('menusearch', 'shortcuts', '-', 'about') },
];
function quickNumbers(pos) {
  if (!editing()) return;
  E.hist.before();
  const pg = E.doc.page;
  const line = '<p style="text-align:right"><span class="fld" data-f="page" contenteditable="false">1</span></p>';
  if (!/data-f="page"/.test(pg[pos].html || '')) pg[pos].html = (pg[pos].html || '') + line;
  E.changed();
  toast('Nomor halaman ditambahkan');
}

/* ---------------- Keyboard map ---------------- */
export const KBD = new Map();
for (const [id, c] of Object.entries(CMD)) for (const k of [c.kbd, ...(c.alt || [])].filter(Boolean)) KBD.set(k, id);

/* ---------------- Menu search palette ---------------- */
function flatten(items, path, out) {
  for (const it of items) {
    if (!it || it.sep || it.head || it.el) continue;
    const label = typeof it.label === 'string' ? it.label : '';
    if (it.sub) { const s = typeof it.sub === 'function' ? it.sub() : it.sub; flatten(s, [...path, label], out); if (!it.run) continue; }
    if (label) out.push({ ...it, path: [...path, label].join(' › ') });
  }
  return out;
}
export function menuSearch() {
  const all = [];
  for (const m of MENUS) flatten(m.items(), [m.label], all);
  const inp = h('input', { class: 'tx', placeholder: 'Telusuri menu (mis. tabel, PDF, spasi)', 'aria-label': 'Telusuri menu' });
  const list = h('div', { style: { maxHeight: '360px', overflow: 'auto', marginTop: '6px' } });
  let sel = 0, rows = [];
  const draw = () => {
    const s = inp.value.trim().toLowerCase();
    const res = s ? all.filter(x => x.path.toLowerCase().includes(s)).slice(0, 40) : [];
    sel = 0;
    rows = res.map((x, i) => h('div', { class: 'mi' + (i === 0 ? ' hov' : '') + (x.enabled && !x.enabled() ? ' dis' : ''), onclick: () => { closeMenus(0); x.run?.(); } }, h('span', { class: 'mi-ic' }, x.icon ? icon(x.icon) : null), h('span', { class: 'mi-l' }, x.path), x.kbd ? h('span', { class: 'mi-k' }, kbdLabel(x.kbd)) : null));
    list.replaceChildren(...(rows.length ? rows : s ? [h('div', { class: 'ol-empty' }, 'Tidak ada menu yang cocok')] : [h('div', { class: 'ol-empty' }, 'Ketik nama perintah untuk menjalankannya')]));
  };
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); rows[sel]?.classList.remove('hov'); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(1, rows.length); rows[sel]?.classList.add('hov'); rows[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[sel]?.click(); }
  });
  draw();
  const anchor = E.ui?.search || { x: innerWidth / 2 - 220, y: 120 };
  openMenu(anchor, [{ el: h('div', { style: { width: '440px', maxWidth: 'calc(100vw - 48px)' } }, inp, list) }], { cls: 'pop', focus: false });
  requestAnimationFrame(() => inp.focus());
}
export { ask };
