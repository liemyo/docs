// Live share links of Amatu Docs: "Lihat saja" / "Bisa mengedit" links to one server copy (see live.js),
// the guest route (?share=<key>), syncing the open editor, and the Bagikan dialog.
import { E, Prefs } from './state.js';
import { h, icon, toast, dialog } from './ui.js';
import { Store } from './store.js';
import { newDoc, normalizeDoc } from './docmodel.js';
import { renderEquations } from './insert.js';
import { setSaveState } from './chrome.js';
import { Live, rpc, account, shareKey, linkFor, errText, merge3, mergeLines } from './live.js';

export { shareKey };
const KEYS = ['title', 'page', 'styles', 'footnotes', 'comments', 'drawings', 'charts', 'citations', 'citeStyle', 'lang'];
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

// ---------- document on the server ----------
export function payload() {
  const d = E.doc;
  const o = { html: E.serialize() };
  for (const k of KEYS) o[k] = clone(d[k]);
  const used = JSON.stringify(o);   // assets referenced from the body, header/footer, watermark, footnotes…
  o.assets = Object.fromEntries(Object.entries(d.assets || {}).filter(([k]) => used.includes(k)));
  return o;
}
const blocks = html => {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  return [...t.content.childNodes].map(n => (n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 ? n.textContent.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) : '')).filter(Boolean);
};
const byId = a => Object.fromEntries((a || []).map(c => [c.id, c]));
// Paragraph-level merge of the body; comments merge per comment.
export const mergeDocs = (b, m, t) => merge3(b || {}, m, t, {
  html: (bb, mm, tt) => mergeLines(blocks(bb), blocks(mm), blocks(tt)).join(''),
  comments: (bb, mm, tt) => {
    const r = merge3(byId(bb), byId(mm), byId(tt));
    const order = [...(mm || []), ...(tt || [])].map(c => c.id).filter((id, i, a) => a.indexOf(id) === i && r[id]);
    return order.map(id => r[id]);
  },
});

function applyDoc(x) {
  const d = E.doc;
  if (!d || E.dead || !x) return;
  for (const k of KEYS) if (x[k] !== undefined) d[k] = clone(x[k]);
  d.assets = { ...d.assets, ...(x.assets || {}) };
  normalizeDoc(d);
  if (document.activeElement !== E.ui.title) E.ui.title.value = d.title;
  document.title = d.title + ' - Amatu Docs';
  if ((x.html || '') !== E.serialize()) {
    const s = E.hist.snap();
    E.body.innerHTML = E.hydrate(x.html);
    E.hist.apply({ html: E.body.innerHTML, sel: document.activeElement === E.body ? s.sel : null });
    renderEquations();
  }
  E.applyDocStyles();
  E.renderCards();
  E.changed();
}

// ---------- open through a link ----------
// The server copy is cached on this device as an ordinary document with its own id.
export async function openLink(key) {
  const id = 'sh-' + key.slice(0, 16).replace(/[^\w-]/g, '_');
  let d = await Store.get(id);
  if (!d) { d = newDoc({ title: 'Memuat…' }); d.id = id; }
  if (d.share?.key !== key) d.share = { key, role: 'view', owner: false, rev: 0, clean: true };
  await Store.put(d);
  return id;
}

// ---------- editor session ----------
let patched = false, internal = false;
function patch() {
  if (patched) return;
  patched = true;
  const save = E.save;
  E.save = async () => { if (E.doc?.share?.revoked && !E.doc.share.owner) return; await save(); if (E.live && !internal) E.live.changed(); };
  const setMode = E.setMode;
  E.setMode = m => { if (E.lockView && m !== 'view') { toast('Anda hanya dapat melihat dokumen ini'); return; } setMode(m); };
}
const persistSoon = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(async () => { if (!E.doc || E.dead) return; internal = true; try { await E.save(); } finally { internal = false; } }, 800); }; })();

function setRole(s) {
  const view = !!(s && !s.owner && (s.role === 'view' || s.revoked));
  const was = E.lockView;
  E.lockView = view;
  if (view && E.mode !== 'view') E.setMode('view');
  if (was && !view && E.mode === 'view' && !E.doc?.trashed) E.setMode('edit');   // link turned out to be an edit link
  if (E.ui.title) E.ui.title.readOnly = view;
  let b = E.ui.badge;
  if (!s) { b?.remove(); E.ui.badge = null; return; }
  if (!b || !b.isConnected) { b = E.ui.badge = h('button', { class: 'share-badge', onclick: () => shareDialog() }); E.ui.saved.after(b); }
  const [ic, tx, tip, cls] = s.revoked ? ['link_off', 'Tautan tidak berlaku', 'Pemilik mematikan atau mengganti tautan ini', 'bad']
    : s.owner ? ['group', 'Dibagikan', 'Dokumen ini dibagikan dengan tautan', 'own']
      : s.role === 'edit' ? ['edit', 'Bisa mengedit', 'Anda membuka tautan edit', 'edit'] : ['visibility', 'Hanya melihat', 'Anda membuka tautan lihat saja', 'view'];
  b.className = 'share-badge ' + cls;
  b.replaceChildren(icon(ic), h('span', { class: 't' }, tx));
  b.dataset.tip = tip;
}
function status(st, info, e) {
  if (st === 'revoked') {
    const d = E.doc;
    if (d?.share && !d.share.owner) {   // the owner withdrew the link: drop the copy cached on this device
      d.share.revoked = true; setRole(d.share);
      E.live?.stop(); E.live = null;
      E.body.innerHTML = '<p>Tautan ini tidak berlaku lagi. Minta tautan baru kepada pemilik dokumen.</p>';
      Store.remove(d.id).catch(() => { });
      E.dirty = false;
    }
    toast(errText({ code: 'notfound' }));
  }
  if (st === 'denied' || st === 'error') toast(errText(e || { code: 'denied' }));
  E.liveState = {
    synced: ['cloud_done', 'Tersinkron', 'Tersimpan di server berbagi' + (info?.by ? ' · terakhir diubah oleh ' + info.by : '')],
    saving: ['sync', 'Menyinkronkan…'], pending: ['sync', 'Menyinkronkan…'],
    offline: ['cloud_off', 'Offline', 'Tidak terhubung. Perubahan disimpan di perangkat dan dikirim saat online.'],
    revoked: ['link_off', 'Tautan tidak berlaku'], denied: ['block', 'Ditolak'], error: ['error', 'Gagal sinkron'],
  }[st] || E.liveState;
  setSaveState('saved');
}

// Called after openEditor(); returns the editor handle with a destroy() that also ends the live session.
export function attach(handle) {
  if (!handle || !E.doc) return handle;
  patch();
  start();
  const destroy = handle.destroy;
  handle.destroy = async () => { if (E.live && !E.live.clean) await E.live.save().catch(() => { }); stop(); return destroy.call(handle); };
  return handle;
}
function stop() { E.live?.stop(); E.live = null; E.liveState = null; E.lockView = false; }
function start() {
  stop();
  const s = E.doc.share;
  setRole(s && s.role ? s : null);
  if (!s?.key) return;
  const doc = E.doc;
  const mine = () => E.doc === doc && !E.dead;
  const live = new Live(s.key, {
    payload: () => (mine() ? payload() : null),
    merge: mergeDocs,
    apply: x => { if (mine()) applyDoc(x); },
    busy: () => !!(E.hist.grp || E.previewing || E.hfEditing),
    status: (st, info, e) => { if (mine()) status(st, info, e); },
    role: info => { if (!mine()) return; Object.assign(doc.share, { role: info.role, by: info.by, ownerName: info.owner, owner: s.owner || false }); setRole(doc.share); },
    name: () => E.doc?.title || '',
    by: () => account()?.u || Prefs.name || 'Tamu',
    persist: st => { if (mine()) { Object.assign(doc.share, st); persistSoon(); } },
  }, s);
  E.live = live;
  live.start().catch(e => status(e.code === 'notfound' ? 'revoked' : 'offline', null, e));
}

// ---------- Bagikan dialog ----------
export async function shareDialog() {
  await E.save();
  const doc = E.doc, acc = account();
  const body = h('div', { class: 'share-dlg' });
  const copyRow = (label, desc, url, on, onToggle, onReset) => {
    const inp = h('input', { class: 'tx', readonly: true, value: on ? url : 'Tautan dimatikan', disabled: !on, onfocus: e => e.target.select() });
    return h('div', { class: 'share-row' + (on ? '' : ' off') },
      h('div', { class: 'share-head' }, h('div', null, h('div', { style: { fontWeight: 600 } }, label), h('div', { class: 'muted small' }, desc)),
        onToggle ? h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: on, onchange: e => onToggle(e.target.checked) }), h('span')) : null),
      h('div', { class: 'share-link' }, inp,
        h('button', { class: 'btn btn-tonal', disabled: !on, onclick: () => { navigator.clipboard?.writeText(url).then(() => toast('Tautan disalin')); } }, icon('content_copy'), 'Salin'),
        onReset && on ? h('button', { class: 'ib', 'data-tip': 'Buat tautan baru (tautan lama berhenti berfungsi)', onclick: onReset }, icon('autorenew')) : null));
  };
  const note = (ic, title, text, ...more) => h('div', { class: 'row share-note', style: { alignItems: 'flex-start' } },
    h('div', { class: 'av', style: { background: 'var(--acc-soft)', color: 'var(--acc-tx)', boxShadow: 'none' } }, icon(ic)),
    h('div', null, h('div', { style: { fontWeight: 600 } }, title), h('div', { class: 'muted small' }, text), ...more));
  const files = async () => { const IO = await import('./io.js'); return h('div', { class: 'row', style: { flexWrap: 'wrap' } },
    h('button', { class: 'btn btn-ghost', onclick: () => IO.exportDoc(doc, E.serialize(), 'docx') }, icon('download'), 'Unduh .docx'),
    acc || doc.share ? null : h('button', { class: 'btn btn-ghost', onclick: () => IO.copyLinkDialog() }, icon('link'), 'Tautan salinan')); };

  const render = async () => {
    const s = doc.share;
    const parts = [];
    if (s && !s.owner) {
      parts.push(note(s.role === 'edit' ? 'edit' : 'visibility', s.role === 'edit' ? 'Anda dapat mengedit dokumen ini' : 'Anda hanya dapat melihat dokumen ini',
        `Dibagikan oleh ${s.ownerName || 'pemilik'}. Perubahan tersimpan langsung untuk semua yang membuka tautan.`),
      copyRow('Tautan ini', 'Teruskan hanya ke orang yang Anda percaya.', linkFor('docs', s.key), true));
    } else if (!acc) {
      parts.push(note('login', 'Masuk ke Portal AMATU untuk membuat tautan berbagi', 'Tautan "Lihat saja" dan "Bisa mengedit" disimpan di akun AMATU Anda. Tanpa akun, Anda tetap bisa mengirim tautan salinan.'));
    } else if (!s) {
      parts.push(note('group_add', 'Bagikan dengan tautan', 'Dokumen diunggah ke server AMATU. Anda mendapat dua tautan: "Lihat saja" dan "Bisa mengedit". Perubahan tersinkron otomatis untuk semua yang membukanya.'),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: create }, icon('link'), 'Buat tautan berbagi')));
    } else {
      parts.push(
        copyRow('Lihat saja', 'Siapa pun yang memiliki tautan dapat membaca dokumen, tanpa mengubahnya.', linkFor('docs', s.vkey), s.view_on !== false, on => set({ p_view: on }), () => set({ p_reset: 'view' })),
        copyRow('Bisa mengedit', 'Siapa pun yang memiliki tautan dapat mengedit seluruh dokumen.', linkFor('docs', s.ekey), s.edit_on !== false, on => set({ p_edit: on }), () => set({ p_reset: 'edit' })),
        h('div', { class: 'row' }, h('span', { class: 'muted small', style: { flex: 1 } }, s.by ? `Terakhir diubah oleh ${s.by}` : ''),
          h('button', { class: 'btn btn-danger', onclick: stopSharing }, icon('link_off'), 'Berhenti berbagi')));
    }
    parts.push(await files());
    body.replaceChildren(...parts);
  };
  async function create() {
    try {
      const r = await rpc('amt_share_create', { p_token: acc.t, p_app: 'docs', p_doc: doc.id, p_name: doc.title, p_data: payload() });
      doc.share = { owner: true, id: r.id, key: r.okey, vkey: r.vkey, ekey: r.ekey, view_on: r.view_on, edit_on: r.edit_on, role: 'edit', rev: r.existing ? 0 : r.rev, clean: !r.existing };
      await Store.put(doc);
      start();
      render();
      toast('Tautan berbagi dibuat');
    } catch (e) { toast(errText(e)); }
  }
  async function set(args) {
    try {
      const r = await rpc('amt_share_set', { p_token: acc.t, p_id: doc.share.id, p_view: null, p_edit: null, p_reset: null, p_delete: false, ...args });
      Object.assign(doc.share, { vkey: r.vkey, ekey: r.ekey, view_on: r.view_on, edit_on: r.edit_on, key: r.okey });
      await Store.put(doc);
      render();
      if (args.p_reset) toast('Tautan baru dibuat. Tautan lama tidak berfungsi lagi.');
    } catch (e) { toast(errText(e)); }
  }
  async function stopSharing() {
    try {
      await rpc('amt_share_set', { p_token: acc.t, p_id: doc.share.id, p_view: null, p_edit: null, p_reset: null, p_delete: true });
      stop();
      doc.share = null;
      await Store.put(doc);
      setRole(null);
      setSaveState('saved');
      render();
      toast('Berhenti berbagi. Kedua tautan tidak berfungsi lagi.');
    } catch (e) { toast(errText(e)); }
  }
  if (acc && !doc.share) rpc('amt_share_mine', { p_token: acc.t, p_app: 'docs', p_doc: doc.id }).then(r => {
    if (r && !doc.share) { doc.share = { owner: true, id: r.id, key: r.okey, vkey: r.vkey, ekey: r.ekey, view_on: r.view_on, edit_on: r.edit_on, role: 'edit', rev: 0, clean: false }; Store.put(doc); start(); render(); }
  }).catch(() => { });
  await render();
  dialog({ title: `Bagikan "${doc.title}"`, width: 560, body, buttons: [{ label: 'Selesai', primary: true }] });
}
