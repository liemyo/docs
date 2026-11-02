// Import / export, printing and share links.
import { E, me } from './state.js';
import { h, icon, toast, dialog, downloadBlob, readFile, loadScript, safeName, esc } from './ui.js';
import { Store } from './store.js';
import { newDoc, styleVars, paperPx, cm2px } from './docmodel.js';
import { sanitize, textToHtml, mdToHtml } from './sanitize.js';
import { buildDocx } from './docx.js';
import { shrink } from './images.js';

const MAMMOTH = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

/* ---------------- Export ---------------- */
function exportHtml(doc, html) {
  const t = document.createElement('div');
  t.innerHTML = html;
  t.querySelectorAll('img[data-asset]').forEach(i => { const d = doc.assets?.[i.dataset.asset]; if (d) i.setAttribute('src', d); i.removeAttribute('data-asset'); });
  return t.innerHTML;
}
export async function exportDoc(doc, html, kind) {
  const name = safeName(doc.title);
  const body = exportHtml(doc, html);
  try {
    if (kind === 'docx') {
      toast('Menyiapkan dokumen Word…', { ms: 1500 });
      const blob = await buildDocx({ ...doc, author: me() }, body);
      downloadBlob(blob, name + '.docx');
    } else if (kind === 'html') {
      downloadBlob(new Blob([await standaloneHtml(doc, body)], { type: 'text/html' }), name + '.html');
    } else if (kind === 'txt') {
      const t = document.createElement('div'); t.innerHTML = body;
      downloadBlob(new Blob([htmlToText(t)], { type: 'text/plain;charset=utf-8' }), name + '.txt');
    } else if (kind === 'md') {
      const t = document.createElement('div'); t.innerHTML = body;
      downloadBlob(new Blob([htmlToMd(t, doc)], { type: 'text/markdown;charset=utf-8' }), name + '.md');
    } else if (kind === 'json') {
      const versions = await Store.versions.list(doc.id);
      const data = { format: 'amatu-docs', version: 1, doc: { ...doc, html, share: undefined }, versions };   // share-link keys stay private
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), name + '.adocs.json');
    }
  } catch (e) {
    console.error(e);
    toast('Ekspor gagal: ' + (e.message || e));
  }
}
let docCss = null;
async function standaloneHtml(doc, body) {
  docCss ||= await fetch('css/doc.css').then(r => r.text()).catch(() => '');
  const sz = paperPx(doc.page.size);
  let W = sz.w; if (doc.page.orient === 'landscape') W = sz.h;
  const m = doc.page.margins;
  const vars = Object.entries(styleVars(doc.styles)).map(([k, v]) => `${k}:${v}`).join(';');
  const notes = Object.keys(doc.footnotes || {}).length ? '<hr><ol class="fns">' + [...new DOMParser().parseFromString(body, 'text/html').querySelectorAll('sup.fn')].map(s => `<li>${doc.footnotes[s.dataset.fn] || ''}</li>`).join('') + '</ol>' : '';
  return `<!doctype html><html lang="${doc.lang || 'id'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
<style>${docCss}
body{margin:0;background:#f1f3f4}
.page{box-sizing:border-box;max-width:${W}px;margin:24px auto;background:${doc.page.color || '#fff'};padding:${cm2px(m.t)}px ${cm2px(m.r)}px ${cm2px(m.b)}px ${cm2px(m.l)}px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.doc-root hr.pb{border-top:1px dashed #ccc;margin:18px 0}
.fns{font-size:10pt}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none}}
</style></head><body><main class="page doc-root" style="${vars}">${body}${notes}</main></body></html>`;
}
export function htmlToText(root) {
  const out = [];
  const walk = (n, pre) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out.push(c.data); continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName;
      if (t === 'BR') { out.push('\n'); continue; }
      if (t === 'DEL') continue;
      if (t === 'TD' || t === 'TH') { walk(c); out.push('\t'); continue; }
      if (t === 'LI') { out.push(pre || (c.parentElement?.tagName === 'OL' ? `${[...c.parentElement.children].indexOf(c) + 1}. ` : '• ')); walk(c); out.push('\n'); continue; }
      if (/^(P|H\d|BLOCKQUOTE|PRE|TR|DIV)$/.test(t)) { walk(c); out.push('\n'); continue; }
      if (t === 'SPAN' && c.classList.contains('eq')) { out.push(c.dataset.tex || ''); continue; }
      walk(c);
    }
  };
  walk(root);
  return out.join('').replace(/\t\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
export function htmlToMd(root, doc) {
  const inl = n => [...n.childNodes].map(c => {
    if (c.nodeType === 3) return c.data.replace(/([*_`\[\]])/g, '\\$1');
    if (c.nodeType !== 1) return '';
    const t = c.tagName, x = inl(c), s = c.style || {};
    if (t === 'BR') return '  \n';
    if (t === 'DEL') return '';
    if (t === 'IMG') return `![${c.alt || ''}](${c.getAttribute('src') || ''})`;
    if (t === 'A') return `[${x}](${c.getAttribute('href') || ''})`;
    if (t === 'CODE') return '`' + c.textContent + '`';
    if (t === 'SUP' && c.classList.contains('fn')) return `[^${(doc ? Object.keys(doc.footnotes) : []).indexOf(c.dataset.fn) + 1}]`;
    if (t === 'SPAN' && c.classList.contains('eq')) return `$${c.dataset.tex}$`;
    let r = x;
    if (t === 'B' || t === 'STRONG' || parseInt(s.fontWeight) >= 600) r = r.trim() ? `**${r}**` : r;
    if (t === 'I' || t === 'EM' || s.fontStyle === 'italic') r = r.trim() ? `*${r}*` : r;
    if (t === 'S' || t === 'STRIKE' || /line-through/.test(s.textDecoration || '')) r = `~~${r}~~`;
    return r;
  }).join('');
  const out = [];
  const list = (el, d) => [...el.children].forEach((li, i) => {
    if (li.tagName !== 'LI') { if (/^(UL|OL)$/.test(li.tagName)) list(li, d + 1); return; }
    const mark = el.classList.contains('checklist') ? `- [${li.dataset.checked === 'true' ? 'x' : ' '}]` : el.tagName === 'OL' ? `${i + 1}.` : '-';
    const own = li.cloneNode(true); own.querySelectorAll('ul,ol').forEach(x => x.remove());
    out.push('  '.repeat(d) + mark + ' ' + inl(own).trim());
    li.querySelectorAll(':scope > ul, :scope > ol').forEach(x => list(x, d + 1));
  });
  for (const el of root.children) {
    const t = el.tagName;
    if (/^H\d$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + inl(el).trim(), '');
    else if (t === 'P') { const x = inl(el).trim(); out.push(el.classList.contains('title') ? '# ' + x : x, ''); }
    else if (t === 'UL' || t === 'OL') { list(el, 0); out.push(''); }
    else if (t === 'BLOCKQUOTE') out.push('> ' + inl(el).trim(), '');
    else if (t === 'PRE') out.push('```', el.textContent, '```', '');
    else if (t === 'HR') out.push(el.classList.contains('pb') ? '' : '---', '');
    else if (t === 'TABLE') {
      const rows = [...el.rows].map(r => '| ' + [...r.cells].map(c => inl(c).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |');
      if (rows.length) { const n = el.rows[0].cells.length; rows.splice(1, 0, '|' + ' --- |'.repeat(n)); out.push(...rows, ''); }
    } else { const x = inl(el).trim(); if (x) out.push(x, ''); }
  }
  if (doc) Object.values(doc.footnotes || {}).forEach((f, i) => { const d = document.createElement('div'); d.innerHTML = f; out.push(`[^${i + 1}]: ${d.textContent}`); });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ---------------- Print / PDF ---------------- */
let pageStyle = null;
export function prepPrint() {
  if (E.printing || !E.doc) return;
  E.printing = true;
  E._zoomBefore = E.zoom;
  E.zoom = 1;
  E.paginateNow();
  const g = E.geo;
  pageStyle?.remove();
  pageStyle = h('style', null, `@page{size:${g.PW}px ${g.PH}px;margin:0}`);
  document.head.append(pageStyle);
  E.layout();
}
export function endPrint() {
  if (!E.printing) return;
  E.printing = false;
  pageStyle?.remove(); pageStyle = null;
  E.zoom = E._zoomBefore || 1;
  E.paginateNow();
  E.layout();
}
export function printDoc(pdf) {
  if (!E.doc) return;
  if (pdf) toast('Pilih "Simpan sebagai PDF" sebagai tujuan di dialog cetak', { ms: 5000 });
  const t0 = document.title;
  document.title = safeName(E.doc.title);
  setTimeout(() => { prepPrint(); window.print(); setTimeout(() => { endPrint(); document.title = t0; }, 400); }, pdf ? 300 : 0);
}
addEventListener('beforeprint', prepPrint);
addEventListener('afterprint', () => setTimeout(endPrint, 50));

/* ---------------- Import ---------------- */
async function dataImagesToAssets(html, assets) {
  const t = document.createElement('div');
  t.innerHTML = html;
  for (const img of t.querySelectorAll('img[src^="data:"]')) {
    const id = 'a' + Math.random().toString(36).slice(2, 10);
    assets[id] = await shrink(img.getAttribute('src'));
    img.setAttribute('data-asset', id);
    img.setAttribute('src', '');
  }
  return t.innerHTML;
}
export async function importFile(file) {
  const name = file.name.replace(/\.(docx|html?|txt|md|markdown|json|adocs\.json)$/i, '').replace(/\.adocs$/, '');
  const ext = (file.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  let html = '', extra = {};
  if (ext === 'docx') {
    await loadScript(MAMMOTH);
    const res = await window.mammoth.convertToHtml({ arrayBuffer: await readFile(file, 'buffer') }, {
      styleMap: ["p[style-name='Title'] => p.title:fresh", "p[style-name='Subtitle'] => p.subtitle:fresh", "p[style-name='Quote'] => blockquote:fresh", "r[style-name='Strong'] => b"],
    });
    html = sanitize(res.value.replace(/<p>/g, '<p>').replace(/<table>/g, '<table class="dt">'), { keepClasses: true });
    html = html.replace(/<table(?![^>]*class)/g, '<table class="dt"');
  } else if (ext === 'html' || ext === 'htm') {
    html = sanitize(await readFile(file, 'text'));
  } else if (ext === 'md' || ext === 'markdown') {
    html = mdToHtml(await readFile(file, 'text'));
  } else if (ext === 'json') {
    const data = JSON.parse(await readFile(file, 'text'));
    if (data.format !== 'amatu-docs' || !data.doc) throw new Error('Format cadangan tidak dikenali');
    const d = newDoc({ ...data.doc, title: data.doc.title });
    Object.assign(d, { ...data.doc, id: d.id, created: Date.now(), modified: Date.now(), opened: Date.now(), trashed: 0, share: null });
    await Store.put(d);
    for (const v of data.versions || []) await Store.versions.add({ ...v, vid: v.vid + d.id.slice(-4), doc: d.id });
    return d.id;
  } else {
    html = textToHtml(await readFile(file, 'text'));
  }
  const assets = {};
  html = await dataImagesToAssets(html || '<p><br></p>', assets);
  const d = newDoc({ title: name || 'Dokumen impor', html, assets, ...extra });
  await Store.put(d);
  return d.id;
}

/* ---------------- Share links ---------------- */
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function pack(obj) {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  if (!('CompressionStream' in window)) return 'j' + b64u(data);
  const cs = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64u(new Uint8Array(await new Response(cs).arrayBuffer()));
}
async function unpack(s) {
  const kind = s[0], bytes = unb64u(s.slice(1));
  if (kind === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(ds).text());
}
// Bagikan: live share links (sharing.js). The copy link below packs the whole document into the URL (no account needed).
export async function shareDialog() { return (await import('./sharing.js')).shareDialog(); }
export async function copyLinkDialog() {
  await E.save();
  const doc = E.doc;
  const html = E.serialize();
  const used = new Set([...html.matchAll(/data-asset="([^"]+)"/g)].map(m => m[1]));
  if (doc.page.wm?.asset) used.add(doc.page.wm.asset);
  const assets = Object.fromEntries([...used].map(k => [k, doc.assets[k]]).filter(x => x[1]));
  const payload = { t: doc.title, h: html, p: doc.page, s: doc.styles, f: doc.footnotes, a: assets, c: doc.comments, by: me() };
  const code = await pack(payload);
  const url = location.origin + location.pathname + '#/s/' + code;
  const big = url.length > 1.8e6;
  const inp = h('input', { class: 'tx', value: big ? '' : url, readonly: true, onfocus: e => e.target.select() });
  const copy = () => { navigator.clipboard?.writeText(url).then(() => toast('Tautan disalin')); };
  dialog({
    title: `Bagikan "${doc.title}"`, width: 540,
    body: h('div', { style: { display: 'grid', gap: '14px' } },
      h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { class: 'av', style: { background: 'var(--acc-soft)', color: 'var(--acc-tx)', boxShadow: 'none' } }, icon('link')),
        h('div', null, h('div', { style: { fontWeight: 600 } }, 'Siapa saja yang memiliki tautan'), h('div', { class: 'muted small' }, 'Isi dokumen dikemas langsung di dalam tautan. Penerima akan membuka salinan dokumen ini di perangkatnya — perubahan mereka tidak memengaruhi dokumen Anda.'))),
      big ? h('div', { class: 'panel-card' }, 'Dokumen terlalu besar untuk dibagikan lewat tautan (biasanya karena gambar). Gunakan unduhan .docx atau cadangan .json.')
        : h('div', { class: 'share-link' }, inp, h('button', { class: 'btn btn-tonal', onclick: copy }, icon('content_copy'), 'Salin tautan')),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        navigator.share && !big ? h('button', { class: 'btn btn-ghost', onclick: () => navigator.share({ title: doc.title, url }).catch(() => {}) }, icon('ios_share'), 'Bagikan…') : null,
        h('button', { class: 'btn btn-ghost', onclick: () => exportDoc(doc, html, 'docx') }, icon('download'), 'Unduh .docx'),
        h('button', { class: 'btn btn-ghost', onclick: () => exportDoc(doc, html, 'json') }, icon('backup'), 'Cadangan lengkap'))),
    buttons: [{ label: 'Selesai', primary: true }],
  });
}
export async function openShared(code) {
  let p;
  try { p = await unpack(code); } catch { toast('Tautan berbagi tidak valid atau terpotong'); return null; }
  const ok = await dialog({
    title: 'Buka dokumen yang dibagikan',
    width: 440,
    body: h('div', null, h('p', { style: { margin: '0 0 6px', fontWeight: 600 } }, p.t || 'Dokumen'), h('p', { class: 'muted', style: { margin: 0 } }, `${p.by ? 'Dibagikan oleh ' + p.by + '. ' : ''}Salinan dokumen akan disimpan di perangkat ini.`)),
    buttons: [{ label: 'Batal', value: false }, { label: 'Buka salinan', primary: true, value: true }],
  });
  if (!ok) return null;
  const d = newDoc({ title: p.t, html: sanitize(p.h, { keepClasses: true, keepReview: true }), page: p.p, styles: p.s, assets: p.a, footnotes: p.f });
  d.comments = p.c || [];
  await Store.put(d);
  return d.id;
}
