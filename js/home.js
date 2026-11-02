// Home screen: template gallery and document list.
import { h, icon, toast, openMenu, toggleMenu, closeMenus, fmtWhen, fmtFull, ask, confirmDlg, pickFile, avatar, debounce } from './ui.js';
import { Store } from './store.js';
import { TEMPLATES } from './templates.js';
import { newDoc, paperPx, cm2px, applyStyleVars } from './docmodel.js';
import { Prefs, savePrefs, me } from './state.js';
import { ensureFontsIn, ensureFont } from './fonts.js';

const BLANK_SVG = '<svg viewBox="0 0 48 48"><path d="M24 10v28M10 24h28" stroke="url(#bg)" stroke-width="4" stroke-linecap="round"/><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset=".5" stop-color="#ea4335"/><stop offset="1" stop-color="#fbbc04"/></linearGradient></defs></svg>';
const EMPTY_SVG = '<svg viewBox="0 0 120 100" fill="none"><rect x="30" y="14" width="56" height="72" rx="6" fill="var(--glass3)" stroke="var(--line2)"/><rect x="38" y="8" width="56" height="72" rx="6" fill="var(--paper)" stroke="var(--line2)"/><rect x="47" y="24" width="30" height="4" rx="2" fill="var(--accent)" opacity=".8"/><rect x="47" y="34" width="38" height="3" rx="1.5" fill="var(--line2)"/><rect x="47" y="42" width="34" height="3" rx="1.5" fill="var(--line2)"/><rect x="47" y="50" width="38" height="3" rx="1.5" fill="var(--line2)"/><rect x="47" y="58" width="22" height="3" rx="1.5" fill="var(--line2)"/></svg>';

export function renderThumb(html, page, styles, w) {
  const pp = paperPx(page?.size || 'a4');
  let W = pp.w, H = pp.h;
  if (page?.orient === 'landscape') [W, H] = [H, W];
  const m = page?.margins || { t: 2.54, b: 2.54, l: 2.54, r: 2.54 };
  const outer = h('div', { class: 'thumb' });
  const inner = h('div', { class: 'thumb-page doc-root', style: { width: W + 'px', height: H + 'px', padding: `${cm2px(m.t)}px ${cm2px(m.r)}px 0 ${cm2px(m.l)}px`, overflow: 'hidden', background: page?.color || '#fff' } });
  applyStyleVars(inner, styles);
  inner.innerHTML = html;
  inner.querySelectorAll('img').forEach(i => { const s = h('span', { style: { display: 'inline-block', width: '160px', height: '100px', background: '#e8eaed', borderRadius: '4px' } }); i.replaceWith(s); });
  inner.querySelectorAll('hr.pb').forEach(x => { let n = x; while (n.nextSibling) n.nextSibling.remove(); x.remove(); });
  ensureFontsIn(html);
  for (const s of Object.values(styles || {})) if (s?.font) ensureFont(s.font);
  outer.append(inner);
  const fit = () => { const cw = outer.clientWidth || w || 150; inner.style.transform = `scale(${cw / W})`; };
  requestAnimationFrame(fit);
  new ResizeObserver(fit).observe(outer);
  return outer;
}

export function mountHome(root, { openDoc, openTheme, openPrefs, importFiles }) {
  let docs = [], q = '', filter = 'all';
  let view = Prefs.homeView || 'grid', sort = Prefs.homeSort || 'modified';
  const el = h('div', { class: 'home' });

  const search = h('input', { type: 'search', placeholder: 'Telusuri dokumen', 'aria-label': 'Telusuri dokumen' });
  const clear = h('button', { class: 'ib sm', 'aria-label': 'Hapus penelusuran', style: { visibility: 'hidden' }, onclick: () => { search.value = ''; q = ''; clear.style.visibility = 'hidden'; render(); search.focus(); } }, icon('close'));
  search.addEventListener('input', debounce(() => { q = search.value.trim().toLowerCase(); clear.style.visibility = q ? 'visible' : 'hidden'; render(); }, 120));

  const top = h('header', { class: 'h-top glass refract' },
    h('a', { class: 'brand', href: '#/' }, h('img', { src: 'assets/icon.svg', alt: '' }), h('span', null, 'Amatu'), h('b', null, 'Docs')),
    h('label', { class: 'h-search' }, icon('search'), search, clear),
    h('div', { class: 'h-right' },
      h('button', { class: 'ib hide-xs', 'data-tip': 'Buka file dari perangkat', onclick: openFile }, icon('folder_open')),
      h('button', { class: 'ib', 'data-tip': 'Tema & tampilan', onclick: openTheme }, icon('palette')),
      h('button', { class: 'ib round', 'data-tip': me(), onclick: openPrefs, style: { width: '40px', height: '40px' } }, avatar(me()))));

  const tplRow = h('div', { class: 'tpl-row' });
  const tplToggle = h('button', { class: 'btn-text', onclick: () => { tplSec.classList.toggle('all'); tplToggle.lastChild.textContent = tplSec.classList.contains('all') ? 'unfold_less' : 'unfold_more'; } }, 'Galeri template ', icon('unfold_more', 'sm'));
  const tplSec = h('section', { class: 'h-tpl glass' }, h('div', { class: 'wrap' }, h('div', { class: 'sec-h' }, h('h2', null, 'Mulai dokumen baru'), tplToggle), tplRow));

  let lastCat = null;
  for (const t of TEMPLATES) {
    if (t.cat && t.cat !== lastCat) { tplRow.append(h('div', { class: 'tpl-cat' }, t.cat)); lastCat = t.cat; }
    const thumb = t.id === 'blank' ? h('div', { class: 'thumb blank', html: BLANK_SVG }) : renderThumb(t.html(), t.page, t.styles);
    tplRow.append(h('button', { class: 'tpl', onclick: () => fromTemplate(t) }, thumb,
      h('div', null, h('div', { class: 'tpl-n' }, t.name), t.sub ? h('div', { class: 'tpl-s' }, t.sub) : null)));
  }
  // Put the blank doc and the first templates in the first visible row.
  const cats = [...tplRow.querySelectorAll('.tpl-cat')];
  cats.forEach(c => tplRow.append(c)); // moved to end while collapsed; reorder on expand
  tplToggle.addEventListener('click', () => {
    const all = tplSec.classList.contains('all');
    tplRow.replaceChildren();
    let lc = null;
    for (const [i, t] of TEMPLATES.entries()) {
      if (all && t.cat && t.cat !== lc) { tplRow.append(cats.find(c => c.textContent === t.cat)); lc = t.cat; }
      tplRow.append(tplBtns[i]);
    }
  });
  const tplBtns = [...tplRow.querySelectorAll('.tpl')];

  const listTitle = h('h2');
  const filterBtn = h('button', { class: 'btn btn-ghost', style: { height: '34px', color: 'var(--tx2)' } });
  const viewBtn = h('button', { class: 'ib' });
  const sortBtn = h('button', { class: 'ib', 'data-tip': 'Opsi urutan' }, icon('sort_by_alpha'));
  const listBox = h('div');
  const docsSec = h('section', { class: 'wrap h-docs' },
    h('div', { class: 'sec-h' }, listTitle, filterBtn, viewBtn, sortBtn, h('button', { class: 'ib', 'data-tip': 'Buka file', onclick: openFile }, icon('upload_file'))),
    listBox);

  filterBtn.onclick = () => toggleMenu(filterBtn, [
    { label: 'Semua dokumen', icon: 'description', checked: () => filter === 'all', run: () => { filter = 'all'; render(); } },
    { label: 'Berbintang', icon: 'star', checked: () => filter === 'starred', run: () => { filter = 'starred'; render(); } },
    { sep: true },
    { label: 'Sampah', icon: 'delete', checked: () => filter === 'trash', run: () => { filter = 'trash'; render(); } },
  ]);
  viewBtn.onclick = () => { view = view === 'grid' ? 'list' : 'grid'; Prefs.homeView = view; savePrefs(); render(); };
  sortBtn.onclick = () => toggleMenu(sortBtn, [
    { head: 'Urutkan menurut' },
    { label: 'Terakhir diubah', checked: () => sort === 'modified', run: () => setSort('modified') },
    { label: 'Terakhir dibuka', checked: () => sort === 'opened', run: () => setSort('opened') },
    { label: 'Judul', checked: () => sort === 'title', run: () => setSort('title') },
    { label: 'Tanggal dibuat', checked: () => sort === 'created', run: () => setSort('created') },
  ], { align: 'right' });
  const setSort = s => { sort = s; Prefs.homeSort = s; savePrefs(); render(); };

  const fab = h('button', { class: 'fab', 'aria-label': 'Dokumen baru', onclick: () => fromTemplate(TEMPLATES[0]) }, icon('add'));
  el.append(top, tplSec, docsSec, fab);
  root.replaceChildren(el);

  // Drag & drop import
  let dragN = 0, hint = null;
  const dz = e => e.dataTransfer?.types?.includes('Files');
  el.addEventListener('dragenter', e => { if (!dz(e)) return; e.preventDefault(); if (dragN++ === 0) { hint = h('div', { class: 'drop-hint' }, 'Lepaskan untuk membuka file (.docx, .html, .txt, .md)'); document.body.append(hint); } });
  el.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; hint?.remove(); } });
  el.addEventListener('dragover', e => { if (dz(e)) e.preventDefault(); });
  el.addEventListener('drop', e => { if (!dz(e)) return; e.preventDefault(); dragN = 0; hint?.remove(); importFiles([...e.dataTransfer.files]); });

  async function load() {
    docs = await Store.list();
    const cutoff = Date.now() - 30 * 864e5;
    for (const d of docs.filter(d => d.trashed && d.trashed < cutoff)) { await Store.remove(d.id); }
    docs = docs.filter(d => !(d.trashed && d.trashed < cutoff));
    render();
  }

  function render() {
    listTitle.textContent = q ? 'Hasil penelusuran' : filter === 'trash' ? 'Sampah' : filter === 'starred' ? 'Berbintang' : 'Dokumen terbaru';
    filterBtn.replaceChildren(filter === 'trash' ? 'Sampah' : filter === 'starred' ? 'Berbintang' : 'Semua dokumen', icon('arrow_drop_down', 'sm'));
    viewBtn.replaceChildren(icon(view === 'grid' ? 'view_list' : 'grid_view'));
    viewBtn.dataset.tip = view === 'grid' ? 'Tampilan daftar' : 'Tampilan petak';
    let list = docs.filter(d => filter === 'trash' ? d.trashed : !d.trashed && (filter !== 'starred' || d.starred));
    if (q) list = list.filter(d => (d.title || '').toLowerCase().includes(q) || (d.preview || '').replace(/<[^>]+>/g, ' ').toLowerCase().includes(q));
    const key = sort;
    list.sort((a, b) => key === 'title' ? (a.title || '').localeCompare(b.title || '', 'id') : (b[key] || 0) - (a[key] || 0));
    if (!list.length) {
      listBox.replaceChildren(h('div', { class: 'empty glass', html: EMPTY_SVG },
        h('h3', null, q ? 'Tidak ada dokumen yang cocok' : filter === 'trash' ? 'Sampah kosong' : filter === 'starred' ? 'Belum ada dokumen berbintang' : 'Belum ada dokumen'),
        h('div', null, q ? 'Coba kata kunci lain.' : filter === 'trash' ? 'Dokumen di sampah dihapus permanen setelah 30 hari.' : 'Pilih template di atas atau buka file dari perangkat Anda.')));
      return;
    }
    const when = d => key === 'opened' ? 'Dibuka ' + fmtWhen(d.opened) : key === 'created' ? 'Dibuat ' + fmtWhen(d.created) : 'Diubah ' + fmtWhen(d.modified);
    if (view === 'grid') {
      listBox.replaceChildren(h('div', { class: 'doc-grid' }, list.map(d => {
        const more = h('button', { class: 'ib sm', 'aria-label': 'Opsi lainnya', onclick: e => { e.stopPropagation(); toggleMenu(more, () => cardMenu(d), { align: 'right' }); } }, icon('more_vert'));
        return h('div', { class: 'dcard glass', tabindex: '0', role: 'button', 'aria-label': d.title, onclick: () => open(d), onkeydown: e => { if (e.key === 'Enter') open(d); } },
          d.locked ? h('div', { class: 'thumb lk-thumb' }, icon('lock', 'fill')) : renderThumb(d.preview || '', d.page, d.styles),
          h('div', { class: 'dcard-f' }, h('div', { class: 'dcard-t', title: d.title }, d.title || 'Tanpa judul'),
            h('div', { class: 'dcard-m' }, icon(d.locked ? 'lock' : 'article'), d.starred ? icon('star', 'fill star-on xs') : null, h('span', { title: fmtFull(d.modified) }, when(d))), more));
      })));
    } else {
      listBox.replaceChildren(h('div', { class: 'dlist glass' },
        h('div', { class: 'dl-h' }, h('div', null, 'Nama'), h('div', null, 'Terakhir dibuka'), h('div', null, 'Terakhir diubah'), h('div')),
        list.map(d => {
          const more = h('button', { class: 'ib sm', 'aria-label': 'Opsi lainnya', onclick: e => { e.stopPropagation(); toggleMenu(more, () => cardMenu(d), { align: 'right' }); } }, icon('more_vert'));
          return h('div', { class: 'dl-r', onclick: () => open(d) },
            h('div', { class: 'dl-n' }, icon(d.locked ? 'lock' : 'article'), d.starred ? icon('star', 'fill star-on xs') : null, h('span', null, d.title || 'Tanpa judul')),
            h('div', { class: 'muted' }, fmtWhen(d.opened)), h('div', { class: 'muted' }, fmtWhen(d.modified)), more);
        })));
    }
  }

  function cardMenu(d) {
    if (d.trashed) return [
      { label: 'Pulihkan', icon: 'restore_from_trash', run: async () => { await Store.patch(d.id, { trashed: 0 }); toast('Dokumen dipulihkan'); load(); } },
      { label: 'Hapus selamanya', icon: 'delete_forever', run: async () => { if (await confirmDlg('Hapus selamanya?', `"${d.title}" akan dihapus permanen dan tidak dapat dipulihkan.`, 'Hapus selamanya', true)) { await Store.remove(d.id); load(); } } },
    ];
    return [
      { label: 'Ganti nama', icon: 'drive_file_rename_outline', run: async () => { const t = await ask({ title: 'Ganti nama', label: 'Masukkan nama baru untuk dokumen', value: d.title, ok: 'Simpan' }); if (t?.trim()) { await Store.patch(d.id, { title: t.trim() }); load(); } } },
      { label: d.starred ? 'Hapus bintang' : 'Beri bintang', icon: 'star', run: async () => { await Store.patch(d.id, { starred: !d.starred }); load(); } },
      { label: 'Buat salinan', icon: 'content_copy', run: async () => { const full = await Store.get(d.id); const c = newDoc({ ...full, title: 'Salinan ' + full.title }); Object.assign(c, { comments: full.comments, footnotes: full.footnotes, assets: full.assets, drawings: full.drawings, charts: full.charts, citations: full.citations, preview: full.preview, lock: full.lock }); await Store.put(c); toast('Salinan dibuat'); load(); } },
      { label: 'Buka di tab baru', icon: 'open_in_new', run: () => window.open(location.pathname + '#/d/' + d.id, '_blank') },
      { sep: true },
      { label: 'Hapus', icon: 'delete', run: async () => { await Store.patch(d.id, { trashed: Date.now() }); toast(`"${d.title}" dipindahkan ke sampah`, { action: 'Urungkan', onAction: async () => { await Store.patch(d.id, { trashed: 0 }); load(); } }); load(); } },
    ];
  }

  function open(d) {
    if (d.trashed) { toast('Pulihkan dokumen ini dari sampah untuk membukanya'); return; }
    openDoc(d.id);
  }
  async function fromTemplate(t) {
    const d = newDoc({ title: t.id === 'blank' ? 'Dokumen tanpa judul' : t.name, html: t.html(), page: t.page ? JSON.parse(JSON.stringify(t.page)) : undefined, styles: t.styles ? JSON.parse(JSON.stringify(t.styles)) : undefined });
    await Store.put(d);
    openDoc(d.id);
  }
  async function openFile() {
    const files = await pickFile('.docx,.html,.htm,.txt,.md,.markdown,.json', true);
    if (files.length) importFiles(files);
  }

  const off = Store.onChange(() => load());
  load();
  search.focus({ preventScroll: true });
  return { destroy() { off(); closeMenus(0); } };
}
