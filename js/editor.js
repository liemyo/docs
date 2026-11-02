// Editor core: lifecycle, history, selection, input pipeline, layout and persistence.
import { E, Prefs, savePrefs, me } from './state.js';
import * as Lock from './lock.js';
import { h, icon, toast, debounce, keyOf, openMenu, closeMenus, menuOpen, dialogOpen, dataURLtoBlob, esc } from './ui.js';
import { Store } from './store.js';
import { normalizeDoc, applyStyleVars, newDoc } from './docmodel.js';
import { ensureFontsIn, ensureFont } from './fonts.js';
import { buildEditor, updateToolbar, setSaveState, updateStatus, layoutToolbar, refreshAvatar } from './chrome.js';
import { paginateNow, caretPage, pageAtY } from './paginate.js';
import { CMD, run, KBD, item, tableItems } from './commands.js';
import * as F from './format.js';
import * as T from './tables.js';
import * as Img from './images.js';
import * as L from './links.js';
import * as R from './review.js';
import * as P from './panels.js';
import * as N from './insert.js';
import { sanitize, textToHtml } from './sanitize.js';
import { onSpace, onEnter, smartQuote, fixAfterParagraph } from './autoformat.js';
import { initRuler, drawRuler, updateMarkers } from './ruler.js';
import { refreshFind, findOpen, closeFind } from './find.js';
import { enterHF, exitHF } from './hf.js';
import { countText } from './dialogs.js';

const INLINE = /^(SPAN|B|I|U|S|A|STRONG|EM|SUB|SUP|BR|IMG|FONT|CODE|MARK|INS|DEL|STRIKE)$/;
const BLOCKY = /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|DIV)$/;
const off = [];
const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };

/* ---------------- History ---------------- */
const H = E.hist = {
  u: [], r: [], grp: null, t: 0, max: 250,
  snap() { return { html: E.body.innerHTML, sel: selPath() }; },
  push(s) { this.u.push(s); if (this.u.length > this.max) this.u.shift(); this.r.length = 0; },
  typing(kind) {
    if (this.grp !== kind) { this.flush(); this.push(this.snap()); this.grp = kind; }
    clearTimeout(this.t);
    this.t = setTimeout(() => this.flush(), 900);
  },
  flush() { clearTimeout(this.t); this.grp = null; },
  before() { if (E.previewing) return; this.flush(); this.push(this.snap()); },
  undo() { this.flush(); const s = this.u.pop(); if (!s) return; this.r.push(this.snap()); this.apply(s); },
  redo() { this.flush(); const s = this.r.pop(); if (!s) return; this.u.push(this.snap()); this.apply(s); },
  apply(s) { Img.deselect(); E.body.innerHTML = s.html; setSelPath(s.sel); E.changed(); E.updateToolbar(); },
  reset() { this.u = []; this.r = []; this.flush(); },
};
function nodePath(n) {
  const p = [];
  while (n && n !== E.body) { const par = n.parentNode; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.childNodes, n)); n = par; }
  return n === E.body ? p : null;
}
function nodeAt(p) { let n = E.body; for (const i of p) { n = n?.childNodes[i]; if (!n) return null; } return n; }
function selPath() {
  const s = getSelection();
  if (!s.rangeCount || !E.body.contains(s.anchorNode)) return null;
  return { a: nodePath(s.anchorNode), ao: s.anchorOffset, f: nodePath(s.focusNode), fo: s.focusOffset };
}
function setSelPath(p) {
  if (!p?.a || !p.f) return;
  const a = nodeAt(p.a), f = nodeAt(p.f);
  if (!a || !f) return;
  const mx = n => n.nodeType === 3 ? n.data.length : n.childNodes.length;
  try { E.body.focus({ preventScroll: true }); getSelection().setBaseAndExtent(a, Math.min(p.ao, mx(a)), f, Math.min(p.fo, mx(f))); } catch {}
}

/* ---------------- Selection helpers ---------------- */
E.canEdit = () => E.mode !== 'view' && !E.previewing && !!E.doc;
E.range = () => {
  const s = getSelection();
  if (s.rangeCount) {
    const r = s.getRangeAt(0);
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    if (el?.closest?.('[contenteditable="true"]') && E.root?.contains(el)) return r;
  }
  return E.lastRange?.startContainer?.isConnected ? E.lastRange : null;
};
E.restoreSel = () => {
  const ed = E.lastEd?.isConnected ? E.lastEd : E.body;
  if (document.activeElement !== ed) ed.focus({ preventScroll: true });
  const lr = E.lastRange;
  if (lr && lr.startContainer.isConnected && ed.contains(lr.startContainer)) {
    const s = getSelection();
    const cur = s.rangeCount ? s.getRangeAt(0) : null;
    if (!cur || cur.compareBoundaryPoints(Range.START_TO_START, lr) !== 0 || cur.compareBoundaryPoints(Range.END_TO_END, lr) !== 0) { s.removeAllRanges(); s.addRange(lr); }
  }
};

/* ---------------- Commands ---------------- */
E.exec = (cmd, val = null) => {
  if (!cmd || !E.canEdit()) return;
  E.restoreSel();
  H.before();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, val);
  E.changed();
  E.updateToolbar();
};
E.insertText = text => {
  if (!E.canEdit() || !text) return;
  E.restoreSel();
  if (E.mode === 'suggest') { R.insert(text); return; }
  H.typing('ins');
  document.execCommand('insertText', false, text);
};
E.insertPlain = text => {
  text = String(text).replace(/\r\n?/g, '\n');
  if (!text.includes('\n')) return E.insertText(text);
  if (E.mode === 'suggest') return R.insert(text.replace(/\n+/g, ' '));
  E.insertHTML(textToHtml(text));
};
E.insertHTML = html => {
  if (!E.canEdit()) return;
  E.restoreSel();
  const r = E.range();
  if (!r) return;
  H.before();
  insertFragment(r, html);
  postInsert();
  if (E.lastEd && E.lastEd !== E.body && E.lastEd.isConnected) E.lastEd.dispatchEvent(new Event('input', { bubbles: true }));
  E.changed();
};
function insertFragment(r, html) {
  r.deleteContents();
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const frag = tpl.content;
  const nodes = [...frag.childNodes];
  if (!nodes.length) return;
  const s = getSelection();
  const hasBlock = nodes.some(n => n.nodeType === 1 && BLOCKY.test(n.tagName));
  const caretAfter = n => { const rr = document.createRange(); rr.setStartAfter(n); rr.collapse(true); s.removeAllRanges(); s.addRange(rr); };
  if (!hasBlock) { const last = nodes[nodes.length - 1]; r.insertNode(frag); caretAfter(last); return; }
  const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const container = startEl.closest('td, th, .hf-in, .fn-text, .doc-body') || E.body;
  let blk = startEl === container ? container.childNodes[r.startOffset] || null : startEl;
  while (blk && blk.parentNode !== container) blk = blk.parentNode;
  if (!blk) { container.append(frag); caretAfter(nodes[nodes.length - 1]); return; }
  if (/^(UL|OL|TABLE|HR|DIV)$/.test(blk.tagName || '') || blk.nodeType !== 1) {
    blk.after(frag);
    const next = nodes[nodes.length - 1];
    placeAfterBlock(next);
    return;
  }
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(blk, blk.childNodes.length);
  const rest = tail.extractContents();
  const nb = blk.cloneNode(false);
  nb.removeAttribute('id');
  nb.append(rest);
  blk.after(nb);
  nb.before(frag);
  const empty = el => !el.textContent.replace(/​/g, '') && !el.querySelector('img, .eq, .chip, sup.fn, hr, table');
  if (empty(blk)) blk.remove();
  const lastIns = nodes[nodes.length - 1];
  if (empty(nb)) {
    if (lastIns.nodeType === 1 && /^(P|H[1-6])$/.test(lastIns.tagName)) { nb.remove(); placeEnd(lastIns); return; }
    nb.innerHTML = '<br>';
  }
  s.removeAllRanges();
  const rr = document.createRange();
  rr.setStart(nb, 0); rr.collapse(true);
  s.addRange(rr);
}
function placeAfterBlock(el) {
  let n = el.nextElementSibling;
  if (!n || !/^(P|H[1-6])$/.test(n.tagName)) { n = document.createElement('p'); n.innerHTML = '<br>'; el.after(n); }
  const r = document.createRange(); r.setStart(n, 0); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function placeEnd(el) {
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function postInsert() {
  for (const img of E.body.querySelectorAll('img[src^="data:"]')) {
    const id = E.addAsset(img.getAttribute('src'));
    img.dataset.asset = id;
    img.src = E.assetURL(id);
  }
  E.body.querySelectorAll('font[size="7"]').forEach(f => f.removeAttribute('size'));
  normalizeBody();
  N.renderEquations();
  ensureFontsIn(E.body.innerHTML.slice(0, 200000));
}

/* ---------------- Assets ---------------- */
E.addAsset = dataUrl => {
  for (const [k, v] of Object.entries(E.doc.assets)) if (v === dataUrl) return k;
  const id = 'a' + Math.random().toString(36).slice(2, 10);
  E.doc.assets[id] = dataUrl;
  return id;
};
E.assetURL = id => {
  if (E.assets.has(id)) return E.assets.get(id);
  const d = E.doc?.assets?.[id];
  if (!d) return '';
  const u = URL.createObjectURL(dataURLtoBlob(d));
  E.assets.set(id, u);
  return u;
};
E.hydrate = html => {
  const t = document.createElement('template');
  t.innerHTML = html || '<p><br></p>';
  t.content.querySelectorAll('img[data-asset]').forEach(i => i.setAttribute('src', E.assetURL(i.dataset.asset)));
  const d = document.createElement('div'); d.append(t.content);
  return d.innerHTML;
};
E.serialize = () => {
  const c = E.body.cloneNode(true);
  c.querySelectorAll('[style]').forEach(el => { el.style.removeProperty('--pg'); if (!el.getAttribute('style')) el.removeAttribute('style'); });
  c.querySelectorAll('img[data-asset]').forEach(i => i.setAttribute('src', ''));
  c.querySelectorAll('.eq').forEach(x => x.replaceChildren());
  c.querySelectorAll('.cell-sel, .on, .sel').forEach(x => { x.classList.remove('cell-sel', 'on', 'sel'); if (!x.className) x.removeAttribute('class'); });
  return c.innerHTML;
};
function makePreview(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const kids = [...t.content.children].slice(0, 40);
  let out = '';
  for (const k of kids) { k.querySelectorAll('img').forEach(i => i.removeAttribute('src')); out += k.outerHTML; if (out.length > 16000) break; }
  return out;
}

/* ---------------- Change pipeline ---------------- */
let pagPending = false;
E.paginate = () => {
  if (pagPending) return;
  pagPending = true;
  requestAnimationFrame(() => { pagPending = false; E.paginateNow(); });
};
E.paginateNow = () => {
  if (!E.doc || E.dead) return;
  paginateNow();
  if (N.renderTocs()) paginateNow();
};
const saveSoon = debounce(() => E.save(), 700);
const uiSoon = debounce(() => {
  if (E.dead) return;
  E._wc = countText(E.body.innerText || '');
  updateStatus();
  P.refreshOutline();
  R.renderCards();
  refreshFind();
  if (E.doc.citations.length) P.updateCitations();
  if (E.view.panel === 'suggest') P.refreshPanel();
}, 320);
E.changed = () => {
  if (!E.doc || E.previewing) return;
  E.dirty = true;
  setSaveState('saving');
  saveSoon();
  E.paginate();
  uiSoon();
};
E.save = async () => {
  if (!E.doc || E.previewing) return;
  saveSoon.cancel();
  N.gcFootnotes();
  const html = E.serialize();
  E.doc.html = html;
  if (E.dirty) E.doc.modified = Date.now();
  E.doc.preview = makePreview(html);
  E.doc.words = E._wc?.words ?? countText(E.body.innerText || '').words;
  E.doc.title = E.doc.title || 'Dokumen tanpa judul';
  try {
    await Store.put(E.doc);
    E.dirty = false;
    setSaveState('saved');
    P.maybeAutoVersion();
  } catch (e) {
    console.error(e);
    setSaveState('error');
    toast('Gagal menyimpan. Penyimpanan browser mungkin penuh — unduh salinan dokumen Anda.');
  }
};
E.updateToolbar = o => updateToolbar(o);
E.updateStatus = () => updateStatus();
E.renderCards = () => R.renderCards();
E.openPanel = k => P.openPanel(k);
E.refreshPanel = () => P.refreshPanel();
E.refreshAvatar = () => refreshAvatar();
E.wordCount = () => E._wc || countText(E.body.innerText || '');
E.caretPage = () => caretPage();
E.scrollPage = () => {
  const y = (E.canvas.scrollTop + E.canvas.clientHeight / 2 - E.zoomer.offsetTop) / E.zoom;
  return pageAtY(y);
};
E.drawEdit = img => N.drawingDialog(img);
E.chartEdit = img => N.chartDialog(img);

/* ---------------- Layout, zoom, view ---------------- */
E.applyDocStyles = () => {
  applyStyleVars(E.body, E.doc.styles);
  applyStyleVars(E.fg, E.doc.styles);
  for (const s of Object.values(E.doc.styles || {})) if (s?.font) ensureFont(s.font);
  E.paginate();
};
E.layout = () => {
  if (!E.geo || E.dead) return;
  const g = E.geo;
  if (E.zoomFit && !E.printing) {
    const lp = E.left ? E.left.offsetWidth + 24 : 0, rp = E.right ? E.right.offsetWidth + 24 : 0;
    const avail = E.canvas.clientWidth - lp - rp - (innerWidth < 760 ? 16 : 48);
    E.zoom = Math.max(.3, Math.min(2, avail / g.PW));
    if (!g.pageless && innerWidth >= 760) E.zoom = Math.min(E.zoom, 1);
  }
  const z = E.zoom;
  const focus = E.root.classList.contains('focus');
  document.documentElement.style.setProperty('--hdr-h', (focus ? 0 : E.ui.top.offsetHeight + 8) + 'px');
  const W = g.PW * z, Hh = (parseFloat(E.pages.style.height) || g.PH) * z;
  E.pages.style.transform = z === 1 ? '' : `scale(${z})`;
  E.zoomer.style.width = W + 'px';
  E.zoomer.style.height = Hh + 'px';
  const cw = E.canvas.clientWidth;
  const lp = E.left ? E.left.offsetWidth + 24 : 0;
  const rp = E.right ? E.right.offsetWidth + 24 : 0;
  const cmtW = 324;
  const hasCards = !!(E.draft || E.doc.comments.some(c => !c.resolved) || E.body.querySelector('.sg'));
  let left = Math.max(lp + 16, (cw - W) / 2);
  let fits = cw - rp - (left + W) >= cmtW;
  if (hasCards && !fits) { const l2 = cw - rp - cmtW - W; if (l2 >= lp + 16) { left = l2; fits = true; } }
  if (left + W + 16 > cw - rp) left = Math.max(lp + 16, cw - rp - W - 16);
  left = Math.max(innerWidth < 760 ? 8 : 12, left);
  E.view.cmtFits = fits || (cw - rp - lp - W - 32 >= cmtW);
  E.zoomer.style.marginLeft = left + 'px';
  E.cmtCol.style.left = left + W + 18 + 'px';
  E.inner.style.width = Math.max(cw, left + W + (hasCards && fits ? cmtW : 0) + 16) + 'px';
  drawRuler();
  R.renderCards();
  Img.position();
  updateStatus();
};
E.setZoom = v => {
  const frac = (E.canvas.scrollTop + E.canvas.clientHeight / 3) / Math.max(1, E.canvas.scrollHeight);
  if (v === 'fit') E.zoomFit = true;
  else { E.zoomFit = false; E.zoom = Math.max(.3, Math.min(3, v)); }
  if (E.doc.page.pageless) E.paginateNow();
  E.layout();
  E.canvas.scrollTop = frac * E.canvas.scrollHeight - E.canvas.clientHeight / 3;
  updateToolbar();
};
E.applyView = () => {
  E.root.classList.toggle('no-ruler', !E.view.ruler);
  E.root.classList.toggle('pageless', !!E.doc.page.pageless);
  E.body.classList.toggle('show-np', E.view.np);
  E.paginateNow();
  E.layout();
};
E.togglePageless = force => {
  const v = force ?? !E.doc.page.pageless;
  if (!!E.doc.page.pageless === v) return;
  H.before();
  E.doc.page.pageless = v;
  E.changed();
  E.applyView();
};
E.setMode = m => {
  if (E.mode === m) return;
  if (m !== 'view' && E.doc.trashed) { toast('Dokumen di sampah hanya dapat dilihat'); return; }
  exitHF();
  E.mode = m;
  E.root.dataset.mode = m;
  E.body.contentEditable = m === 'view' || E.previewing ? 'false' : 'true';
  E.fg.querySelectorAll('.fn-text').forEach(t => t.contentEditable = m === 'view' ? 'false' : 'true');
  Img.deselect();
  R.renderCards();
  updateToolbar();
  toast({ edit: 'Mode mengedit', suggest: 'Mode menyarankan — perubahan Anda menjadi saran', view: 'Mode melihat — dokumen tidak dapat diubah' }[m]);
};
E.toggleFocus = force => {
  const on = force ?? !E.root.classList.contains('focus');
  E.root.classList.toggle('focus', on);
  if (!on && E.root.classList.contains('reading')) { E.root.classList.remove('reading'); if (E._modeBeforeRead) E.setMode(E._modeBeforeRead); }
  E.layout();
};
E.toggleRead = () => {
  const on = !E.root.classList.contains('reading');
  if (on) { E._modeBeforeRead = E.mode; E.root.classList.add('reading'); E.setMode('view'); E.toggleFocus(true); }
  else { E.toggleFocus(false); }
  updateStatus();
};
E.toggleCompact = () => {
  const c = E.ui.top.classList.toggle('compact');
  E.ui.compactBtn.replaceChildren(icon(c ? 'keyboard_arrow_down' : 'keyboard_arrow_up'));
  E.ui.compactBtn.dataset.tip = c ? 'Tampilkan menu' : 'Sembunyikan menu';
  requestAnimationFrame(() => { layoutToolbar(); E.layout(); });
};
E.toggleStar = async () => {
  E.doc.starred = !E.doc.starred;
  await Store.patch(E.doc.id, { starred: E.doc.starred });
  updateToolbar();
  toast(E.doc.starred ? 'Ditambahkan ke Berbintang' : 'Dihapus dari Berbintang');
};
E.setLang = l => { E.doc.lang = l; E.body.lang = l === 'en' ? 'en' : 'id'; E.changed(); updateStatus(); };
E.scrollToEl = (el, top) => {
  const r = el.getBoundingClientRect(), cr = E.canvas.getBoundingClientRect();
  const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 0;
  const target = top ? hdr + 50 : (cr.height - hdr) / 3 + hdr;
  E.canvas.scrollBy({ top: r.top - cr.top - target, behavior: 'smooth' });
};
E.copyFromVersion = async v => {
  const d = newDoc({ title: 'Salinan ' + E.doc.title, html: v.html, page: v.page, styles: v.styles, assets: E.doc.assets, footnotes: v.footnotes });
  await Store.put(d);
  toast('Salinan dibuat', { action: 'Buka', onAction: () => { location.hash = '#/d/' + d.id; } });
};

/* ---------------- Normalization ---------------- */
function normalizeBody() {
  const b = E.body;
  if (!b.firstElementChild && !b.textContent.trim()) {
    b.innerHTML = '<p><br></p>';
    const r = document.createRange(); r.setStart(b.firstChild, 0); r.collapse(true);
    if (document.activeElement === b) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    return;
  }
  const bad = [...b.childNodes].some(n => n.nodeType === 3 ? n.data.trim() : n.nodeType === 1 && INLINE.test(n.tagName));
  if (!bad) return;
  const s = getSelection();
  const sv = s.rangeCount ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
  let p = null;
  for (const n of [...b.childNodes]) {
    const inl = n.nodeType === 3 || (n.nodeType === 1 && INLINE.test(n.tagName));
    if (inl) {
      if (n.nodeType === 3 && !n.data.trim() && !p) { n.remove(); continue; }
      if (!p) { p = document.createElement('p'); n.before(p); }
      p.append(n);
    } else p = null;
  }
  if (sv && sv[0]?.isConnected && sv[2]?.isConnected) try { s.setBaseAndExtent(...sv); } catch {}
}

/* ---------------- Input events ---------------- */
function onBeforeInput(e) {
  const t = e.inputType;
  if (t === 'historyUndo') { e.preventDefault(); H.undo(); return; }
  if (t === 'historyRedo') { e.preventDefault(); H.redo(); return; }
  if (!E.canEdit()) { e.preventDefault(); return; }
  if (Img.selected() && (t.startsWith('insert') || t.startsWith('delete'))) Img.deselect();
  if (E.mode === 'suggest' && R.beforeInput(e)) return;
  if (t === 'insertText' && Prefs.smartQuotes && (e.data === '"' || e.data === "'")) {
    e.preventDefault();
    H.typing('ins');
    document.execCommand('insertText', false, smartQuote(e.data));
    return;
  }
  H.typing(t.startsWith('delete') ? 'del' : 'ins');
}
function onInput(e) {
  const t = e.inputType;
  if (E.pendingSize) { if (F.convertFont7(E.pendingSize, true)) E.pendingSize = null; }
  if (t === 'insertParagraph') fixAfterParagraph();
  if (t === 'insertText' && / $/.test(e.data || '')) onSpace();
  if (t === 'insertText' && e.data === '@' && E.mode !== 'suggest') atMenu();
  else if (atOpen && t !== 'insertText') closeMenus(0);
  normalizeBody();
  E.changed();
}
function onKeyDown(e) {
  if (!E.canEdit()) return;
  if (e.isComposing) return;
  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (T.onTab(e)) return;
    e.preventDefault();
    if (F.inTag('li')) { run(e.shiftKey ? 'outdent' : 'indent'); return; }
    if (!e.shiftKey) E.insertText('\t');
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && E.mode !== 'suggest') { if (onEnter(e)) return; }
  if ((e.key === 'Backspace' || e.key === 'Delete') && Img.selected()) { e.preventDefault(); Img.removeSelected(); return; }
  if (/^Arrow/.test(e.key)) { E.pendingSize = null; if (Img.selected()) Img.deselect(); }
}
function setClipboard(e, r) {
  const d = document.createElement('div');
  d.append(r.cloneContents());
  d.querySelectorAll('[style]').forEach(el => { el.style.removeProperty('--pg'); if (!el.getAttribute('style')) el.removeAttribute('style'); });
  d.querySelectorAll('img[data-asset]').forEach(i => { const v = E.doc.assets[i.dataset.asset]; if (v) i.setAttribute('src', v); });
  d.querySelectorAll('.cell-sel,.sel,.on').forEach(x => x.classList.remove('cell-sel', 'sel', 'on'));
  e.clipboardData.setData('text/html', '<meta name="generator" content="amatu-docs">' + d.innerHTML);
  e.clipboardData.setData('text/plain', r.toString());
}
function onCopy(e) {
  const r = E.range();
  if (!r || r.collapsed || !E.body.contains(r.commonAncestorContainer)) return;
  e.preventDefault();
  setClipboard(e, r);
  if (e.type === 'cut' && E.canEdit()) {
    if (E.mode === 'suggest') { R.beforeInput({ inputType: 'deleteByCut', preventDefault() {} }); return; }
    H.before();
    document.execCommand('delete');
    E.changed();
  }
}
async function onPaste(e) {
  if (!E.canEdit()) { e.preventDefault(); return; }
  const cd = e.clipboardData;
  if (!cd) return;
  e.preventDefault();
  const files = [...cd.files].filter(f => f.type.startsWith('image/'));
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  if (files.length && !html) { Img.insertFiles(files); return; }
  const plain = E._plainPaste || E.mode === 'suggest';
  E._plainPaste = false;
  if (html && !plain) {
    const own = html.includes('amatu-docs');
    const clean = sanitize(html, { keepClasses: own });
    if (clean.trim()) { E.insertHTML(clean); return; }
  }
  if (text) E.insertPlain(text);
}
function onDrop(e) {
  if (!E.canEdit()) { e.preventDefault(); return; }
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY);
  if (pos) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); E.lastRange = pos.cloneRange(); E.lastEd = E.body; }
  Img.insertFiles(files);
}
function onClick(e) {
  const t = e.target;
  const li = t.closest?.('ul.checklist > li');
  if (li && E.body.contains(li) && e.clientX < li.getBoundingClientRect().left + 1 && E.mode !== 'view') {
    e.preventDefault();
    H.before();
    li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
    E.changed();
    return;
  }
  if (t.tagName === 'IMG' && E.body.contains(t)) { Img.select(t); return; }
  if (Img.selected()) Img.deselect();
  const a = t.closest('a');
  const toc = t.closest('.toc');
  if (a && (toc || e.metaKey || e.ctrlKey || E.mode === 'view')) {
    e.preventDefault();
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) L.goTo(href); else if (href) window.open(href, '_blank', 'noopener');
    return;
  }
  if (toc && E.mode !== 'view') { openMenu({ x: e.clientX, y: e.clientY }, N.tocMenu(toc)); return; }
  const fn = t.closest('sup.fn');
  if (fn) { const ft = E.fg.querySelector(`.fn-text[data-fn="${fn.dataset.fn}"]`); if (ft) { ft.scrollIntoView({ block: 'center', behavior: 'smooth' }); ft.focus(); } return; }
  const chip = t.closest('.chip.date');
  if (chip) { N.dateChipPopover(chip); return; }
  const eq = t.closest('.eq');
  if (eq && E.mode !== 'view') { N.equationDialog(eq); return; }
  const c = t.closest('.cmt:not(.resolved)');
  const sg = t.closest('.sg');
  if (c) R.activate(c.dataset.c);
  else if (sg) R.activate(sg.dataset.s);
  else if (E.activeC && !E.draft) R.activate(null);
}
function onDblClick(e) {
  const img = e.target.closest?.('img');
  if (!img || !E.canEdit()) return;
  if (img.dataset.drawing) N.drawingDialog(img);
  else if (img.dataset.chart) N.chartDialog(img);
}
function onContext(e) {
  if (e.shiftKey) return;
  e.preventDefault();
  const t = e.target;
  if (t.tagName === 'IMG') Img.select(t);
  const inTbl = !!t.closest('td,th');
  const items = [item('cut'), item('copy'), item('paste'), item('pasteplain'), { sep: true }, item('delete'), { sep: true }, item('comment'), item('link')];
  if (t.tagName === 'IMG') items.push({ sep: true }, { label: 'Ganti gambar…', icon: 'swap_horiz', run: async () => { const { pickFile } = await import('./ui.js'); const [f] = await pickFile('image/*'); Img.replaceSelected(f); } }, { label: 'Hapus gambar', icon: 'delete', run: () => Img.removeSelected() });
  if (inTbl) items.push({ sep: true }, ...tableItems().slice(0, 9), { label: 'Opsi tabel lainnya', icon: 'table', sub: tableItems });
  if (F.inTag('ol')) items.push({ sep: true }, item('restartnum'));
  items.push({ sep: true }, item('clearfmt'), { label: 'Pilih semua teks yang sama format', icon: 'select_all', run: () => run('selectall') });
  openMenu({ x: e.clientX, y: e.clientY }, items);
}
let atOpen = false;
function atMenu() {
  const rect = L.caretRect();
  const pick = fn => () => {
    E.restoreSel();
    const s = getSelection();
    s.modify('extend', 'backward', 'character');
    if (s.toString() === '@') document.execCommand('delete'); else s.collapseToEnd();
    E.lastRange = E.range()?.cloneRange();
    fn();
  };
  atOpen = true;
  openMenu({ x: rect.left, y: rect.bottom + 4 }, [
    { head: 'Sisipkan' },
    { label: 'Tanggal', icon: 'calendar_month', run: pick(() => N.insertDateChip()) },
    { label: 'Tabel 3 × 3', icon: 'table', run: pick(() => T.insertTable(3, 3)) },
    { label: 'Checklist', icon: 'checklist', run: pick(() => F.toggleList('check')) },
    { label: 'Gambar', icon: 'image', run: pick(() => run('img-upload')) },
    { label: 'Persamaan', icon: 'function', run: pick(() => N.equationDialog()) },
    { label: 'Daftar isi', icon: 'toc', run: pick(() => N.insertToc('numbers')) },
    { label: 'Catatan kaki', icon: 'format_list_numbered', run: pick(() => N.insertFootnote()) },
    { label: 'Pemisah halaman', icon: 'insert_page_break', run: pick(() => N.pageBreak()) },
    { label: 'Garis horizontal', icon: 'horizontal_rule', run: pick(() => N.hRule()) },
  ], { focus: false, onClose: () => { atOpen = false; } });
}

/* ---------------- Global events ---------------- */
let uiPending = false;
function onSelChange() {
  if (E.dead) return;
  const s = getSelection();
  if (!s.rangeCount) return;
  const n = s.anchorNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  const ed = el?.closest?.('[contenteditable="true"]');
  if (!ed || !E.root.contains(ed)) return;
  E.lastRange = s.getRangeAt(0).cloneRange();
  E.lastEd = ed;
  if (uiPending) return;
  uiPending = true;
  requestAnimationFrame(() => {
    uiPending = false;
    if (E.dead) return;
    const img = Img.selected();
    if (img) { const r = E.range(); if (!r || !(r.startContainer === img.parentNode && r.endOffset - r.startOffset === 1)) Img.deselect(); }
    updateToolbar();
    L.updateChip();
    T.highlightCells();
    updateMarkers();
    updateStatus();
  });
}
function onGlobalKey(e) {
  if (E.dead || dialogOpen() || menuOpen()) return;
  if (e.key === 'Escape') {
    if (E.paint) { F.endPaint(); return; }
    if (findOpen()) { closeFind(); return; }
    if (E.hfEditing) { exitHF(); return; }
    if (E.root.classList.contains('focus')) { E.toggleFocus(false); return; }
    if (Img.selected()) { Img.deselect(); return; }
    if (E.previewing) { P.exitPreview(); return; }
  }
  const k = keyOf(e);
  const id = KBD.get(k);
  if (!id) return;
  const c = CMD[id];
  const tgt = e.target;
  const inField = tgt.matches?.('input, textarea, select');
  const inEditable = tgt.isContentEditable && E.root.contains(tgt);
  if (inField && !c.global) return;
  if (!inField && !inEditable && !c.global && !E.root.contains(tgt) && tgt !== document.body) return;
  if (inEditable && tgt !== E.body && (id === 'undo' || id === 'redo')) return;
  e.preventDefault();
  e.stopPropagation();
  run(id);
}
let scrollPending = false;
function onScroll() {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    scrollPending = false;
    P.markCurrent();
    Img.position();
    L.hideChip();
    if (!E.range() || !caretPage()) updateStatus();
  });
}
const onResize = debounce(() => { if (E.dead) return; layoutToolbar(); if (E.doc.page.pageless) E.paginateNow(); E.layout(); }, 80);

function bind() {
  const b = E.body;
  listen(b, 'beforeinput', onBeforeInput);
  listen(b, 'input', onInput);
  listen(b, 'keydown', onKeyDown);
  listen(b, 'paste', onPaste);
  listen(b, 'copy', onCopy);
  listen(b, 'cut', onCopy);
  listen(b, 'drop', onDrop);
  listen(b, 'click', onClick);
  listen(b, 'dblclick', onDblClick);
  listen(b, 'contextmenu', onContext);
  listen(b, 'mousedown', () => { E.pendingSize = null; });
  listen(b, 'mouseup', () => { if (E.paint) setTimeout(() => F.applyPaint(), 0); });
  listen(b, 'load', e => { if (e.target.tagName === 'IMG') E.paginate(); }, true);
  listen(E.fg, 'dblclick', e => { const r = e.target.closest('.hf'); if (r && E.canEdit()) enterHF(r.dataset.kind, +r.dataset.p); });
  listen(E.fg, 'click', e => { const r = e.target.closest('.hf'); if (r && !r.classList.contains('editing') && E.canEdit() && !r.querySelector('.hf-in').textContent.trim() && e.detail === 1) { r.title = 'Klik dua kali untuk mengedit'; } });
  N.bindFootnotes();
  T.initResize();
  listen(document, 'selectionchange', onSelChange);
  listen(document, 'keydown', onGlobalKey, true);
  listen(window, 'resize', onResize);
  listen(E.canvas, 'scroll', onScroll, { passive: true });
  listen(document, 'visibilitychange', () => { if (document.hidden && E.dirty) E.save(); });
  listen(window, 'pagehide', () => { if (E.dirty) E.save(); });
  const t = E.ui.title;
  listen(t, 'input', () => { E.doc.title = t.value; document.title = (t.value || 'Dokumen tanpa judul') + ' - Amatu Docs'; E.dirty = true; setSaveState('saving'); saveSoon(); E.paginate(); });
  listen(t, 'keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (!t.value.trim()) { t.value = 'Dokumen tanpa judul'; E.doc.title = t.value; } E.restoreSel(); } });
  listen(t, 'blur', () => { if (!t.value.trim()) { t.value = 'Dokumen tanpa judul'; E.doc.title = t.value; E.changed(); } });
  listen(t, 'focus', () => requestAnimationFrame(() => t.select()));
}

/* ---------------- Open / close ---------------- */
export async function openEditor(root, id, app) {
  const doc = await Store.get(id);
  if (!doc) { toast('Dokumen tidak ditemukan atau sudah dihapus'); location.replace('#/'); return null; }
  if (doc.lock && !Lock.isOpen(doc)) {
    if (!(await Lock.gate(root, doc))) { location.replace('#/'); return null; }
  }
  if (/\?l=/.test(location.hash)) history.replaceState(null, '', '#/d/' + id);
  normalizeDoc(doc);
  Object.assign(E, { doc, dead: false, mode: doc.trashed ? 'view' : 'edit', previewing: null, draft: null, activeC: null, paint: null, pendingSize: null, lastRange: null, lastEd: null, hfEditing: null, selImg: null, dirty: false, lastVersion: null, left: null, right: null, app, _wc: null, printing: false });
  E.assets = new Map();
  E.view = { ruler: Prefs.ruler, outline: false, np: false, panel: null, cmtFits: true };
  E.zoom = 1;
  E.zoomFit = innerWidth < 900;
  const el = buildEditor();
  root.replaceChildren(el);
  E.root.dataset.mode = E.mode;
  E.ui.title.value = doc.title;
  document.title = doc.title + ' - Amatu Docs';
  E.body.lang = doc.lang === 'en' ? 'en' : 'id';
  E.body.innerHTML = E.hydrate(doc.html);
  if (E.mode === 'view') E.body.contentEditable = 'false';
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  normalizeBody();
  H.reset();
  E.applyDocStyles();
  ensureFontsIn(doc.html);
  bind();
  initRuler();
  layoutToolbar();
  E.applyView();
  if (Prefs.outline) P.toggleOutline(true);
  N.renderEquations();
  if (doc.citations.length) P.updateCitations();
  document.fonts?.ready.then(() => { if (!E.dead) { layoutToolbar(); E.paginateNow(); E.layout(); } });
  document.fonts?.load?.('20px "Material Symbols Outlined"').then(() => { if (!E.dead) { layoutToolbar(); E.layout(); } });
  E._wc = countText(E.body.innerText || '');
  updateToolbar(); updateStatus(); R.renderCards();
  Store.patch(id, { opened: Date.now() });
  if (doc.trashed) toast('Dokumen ini ada di sampah. Pulihkan dari beranda untuk mengeditnya.');
  requestAnimationFrame(() => {
    if (E.mode !== 'view') {
      E.body.focus({ preventScroll: true });
      const first = E.body.querySelector('p, h1, h2, h3, li, td');
      if (first) { const r = document.createRange(); r.setStart(first, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    E.layout();
  });
  return {
    async destroy() {
      exitHF();
      if (E.previewing) P.exitPreview();
      if (E.dirty) await E.save();
      E.dead = true;
      off.splice(0).forEach(f => f());
      closeMenus(0);
      Img.deselect(); L.hideChip();
      if (findOpen()) closeFind();
      for (const u of E.assets.values()) URL.revokeObjectURL(u);
      E.assets.clear();
      E.doc = null;
      document.documentElement.style.removeProperty('--hdr-h');
    },
  };
}
export { esc, h, me, savePrefs };
