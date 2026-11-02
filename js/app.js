// App shell: routing between home and editor, document-level actions.
import { E, Prefs } from './state.js';
import { h, icon, toast, dialog, fmtWhen, closeMenus } from './ui.js';
import { Theme, installRefraction } from './theme.js';
import { Store } from './store.js';
import { newDoc } from './docmodel.js';
import { mountHome } from './home.js';
import { openEditor } from './editor.js';
import { themeDialog, prefsDialog } from './dialogs.js';
import { importFile, openShared } from './io.js';
import * as Share from './sharing.js';

Theme.apply();
installRefraction();
const root = document.getElementById('app');
let current = null, busy = false, linkKey = Share.shareKey();

const go = id => { location.hash = '#/d/' + id; };
const app = {
  async newDoc() { const d = newDoc(); await Store.put(d); go(d.id); },
  async importFiles(files) {
    let last = null;
    for (const f of files) {
      try { toast(`Membuka ${f.name}…`, { ms: 1500 }); last = await importFile(f); }
      catch (e) { console.error(e); toast(`Gagal membuka ${f.name}: ${e.message || 'format tidak didukung'}`); }
    }
    if (last) go(last);
  },
  async copyDoc() {
    await E.save();
    const src = E.doc;
    const d = newDoc({ title: 'Salinan ' + src.title, html: src.html, page: JSON.parse(JSON.stringify(src.page)), styles: JSON.parse(JSON.stringify(src.styles)), assets: { ...src.assets }, footnotes: { ...src.footnotes } });
    Object.assign(d, { drawings: src.drawings, charts: src.charts, citations: src.citations, citeStyle: src.citeStyle, preview: src.preview });
    await Store.put(d);
    toast('Salinan dibuat', { action: 'Buka', onAction: () => go(d.id) });
  },
  async trashDoc() {
    const id = E.doc.id, title = E.doc.title;
    await E.save();
    await Store.patch(id, { trashed: Date.now() });
    location.hash = '#/';
    toast(`"${title}" dipindahkan ke sampah`, { action: 'Urungkan', onAction: async () => { await Store.patch(id, { trashed: 0 }); go(id); } });
  },
  async openDialog() {
    const docs = (await Store.list()).filter(d => !d.trashed).sort((a, b) => (b.opened || 0) - (a.opened || 0));
    const q = h('input', { class: 'tx', placeholder: 'Telusuri dokumen', autofocus: true });
    const list = h('div', { class: 'open-list' });
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const res = docs.filter(d => !s || (d.title || '').toLowerCase().includes(s));
      list.replaceChildren(...res.map(d => h('div', { class: 'dl-r', onclick: () => { closeAll(); go(d.id); } }, h('div', { class: 'dl-n' }, icon('article'), h('span', null, d.title || 'Tanpa judul')), h('div', { class: 'muted' }, fmtWhen(d.opened || d.modified)))));
      if (!res.length) list.append(h('div', { class: 'ol-empty' }, 'Tidak ada dokumen'));
    };
    let closeAll = () => {};
    q.addEventListener('input', draw);
    draw();
    dialog({
      title: 'Buka dokumen', width: 560, body: h('div', null, q, list),
      onOpen: (box, close) => { closeAll = () => close(null); },
      buttons: [{ label: 'Unggah dari perangkat', action: async c => { const { pickFile } = await import('./ui.js'); const f = await pickFile('.docx,.html,.htm,.txt,.md,.json'); if (f.length) { c(null); app.importFiles(f); } return false; } }, { spacer: true }, { label: 'Batal', value: null }],
    });
  },
};

async function route() {
  if (busy) return;
  busy = true;
  try {
    closeMenus(0);
    document.querySelectorAll('.float-bar, .tip').forEach(x => x.remove());
    const hash = location.hash;
    if (current) { await current.destroy?.(); current = null; }
    const share = hash.match(/^#\/s\/(.+)$/);
    if (share) {
      root.replaceChildren();
      const id = await openShared(share[1]);
      history.replaceState(null, '', id ? '#/d/' + id : '#/');
      busy = false;
      return route();
    }
    if (linkKey) {   // ?share=<key>: open the shared document (cached under its own id)
      const id = await Share.openLink(linkKey);
      linkKey = null;
      history.replaceState(null, '', location.pathname + location.search + '#/d/' + id);
      busy = false;
      return route();
    }
    const m = hash.match(/^#\/d\/([\w-]+)/);
    if (m) current = Share.attach(await openEditor(root, m[1], app));
    else {
      document.title = 'Amatu Docs';
      current = mountHome(root, {
        openDoc: go,
        openTheme: themeDialog,
        openPrefs: async () => { if (await prefsDialog()) route(); },
        importFiles: app.importFiles,
      });
    }
  } catch (e) {
    console.error(e);
    toast('Terjadi kesalahan: ' + (e.message || e));
  } finally { busy = false; }
}
addEventListener('hashchange', route);
route();

if (!Prefs.name) document.documentElement.dataset.firstRun = '1';
