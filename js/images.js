// Images: insert, select with resize handles, wrap modes, alt text.
import { E } from './state.js';
import { h, icon, toast, ask, readFile, dialog, field, esc } from './ui.js';
import { signaturePanel, defaultSize } from './signature.js';

const MAX_SIDE = 2400;

export async function shrink(dataUrl, type = '') {
  if (/svg|gif/.test(type) || dataUrl.startsWith('data:image/svg') || dataUrl.startsWith('data:image/gif')) return dataUrl;
  const img = await loadImg(dataUrl);
  const big = Math.max(img.naturalWidth, img.naturalHeight);
  if (big <= MAX_SIDE && dataUrl.length < 2.5e6) return dataUrl;
  const k = Math.min(1, MAX_SIDE / big);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, c.width, c.height);
  const png = /png|webp/.test(type) || dataUrl.startsWith('data:image/png');
  const out = c.toDataURL(png ? 'image/png' : 'image/jpeg', .9);
  return png && out.length > 3e6 ? c.toDataURL('image/jpeg', .9) : out;
}
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function contentWidth() { const g = E.geo; return g.PW - g.ML - g.MR; }

export async function insertImage(dataUrl, { alt = '', remote = false } = {}) {
  if (!E.canEdit()) return;
  let w = 0;
  try { const i = await loadImg(dataUrl); w = Math.min(i.naturalWidth, contentWidth()); } catch { if (!remote) { toast('Gambar tidak dapat dibaca'); return; } }
  let src = dataUrl, extra = '';
  if (!remote) { const id = E.addAsset(dataUrl); src = E.assetURL(id); extra = ` data-asset="${id}"`; }
  E.insertHTML(`<img src="${esc(src)}"${extra} alt="${esc(alt)}"${w ? ` style="width:${Math.round(w)}px"` : ''}>`);
}
export async function insertFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    if (f.size > 25e6) { toast(`${f.name} terlalu besar (maks. 25 MB)`); continue; }
    const d = await readFile(f);
    await insertImage(await shrink(d, f.type), { alt: f.name.replace(/\.[^.]+$/, '') });
  }
}
export async function insertByUrl() {
  const url = await ask({ title: 'Sisipkan gambar dengan URL', label: 'Tempel URL gambar. Pastikan Anda memiliki izin untuk menggunakan gambar tersebut.', placeholder: 'https://…', ok: 'Sisipkan' });
  if (!url?.trim()) return;
  const u = url.trim();
  try {
    const r = await fetch(u, { mode: 'cors' });
    if (!r.ok) throw 0;
    const b = await r.blob();
    if (!b.type.startsWith('image/')) throw 0;
    const d = await readFile(b);
    await insertImage(await shrink(d, b.type));
  } catch {
    await insertImage(u, { remote: true });
  }
}
export async function insertFromCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Kamera tidak tersedia di perangkat ini'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 } }); } catch { toast('Izin kamera ditolak'); return; }
  const v = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '12px', background: '#000' } });
  v.srcObject = stream;
  const shot = await dialog({
    title: 'Ambil foto', width: 560, body: v,
    buttons: [{ label: 'Batal', value: null }, { label: 'Ambil foto', primary: true, action: () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL('image/jpeg', .9); } }],
  });
  stream.getTracks().forEach(t => t.stop());
  if (shot) insertImage(shot, { alt: 'Foto' });
}

/* ---------- Tanda tangan ---------- */
// Dialog bersama dengan Amatu Sheets (signature.js): tersimpan / gambar / ketik / unggah foto (latar dihapus otomatis).
export function signatureDialog(title = 'Sisipkan tanda tangan', ok = 'Sisipkan') {
  let closeFn = null, btn = null;
  const panel = signaturePanel({ toast, onReady: v => { if (btn) btn.disabled = !v; }, onPick: sig => closeFn?.(sig) });
  return dialog({
    title, width: 'min(640px, calc(100vw - 32px))', body: panel.el,
    buttons: [{ label: 'Batal', value: null }, { label: ok, primary: true, action: async () => { const sig = await panel.result(); if (!sig) { toast('Buat tanda tangan dulu'); return false; } return sig; } }],
    onOpen: (box, close) => {
      closeFn = close;
      btn = box.querySelector('[data-primary]');
      if (btn) btn.disabled = true;
      setTimeout(() => { if (!box.contains(document.activeElement)) panel.focus(); }, 60);
    },
  }).finally(() => panel.destroy());
}
// PNG transparan sebaris di posisi kursor, ±3 baris tingginya; bisa diubah ukurannya / dibungkus teks seperti gambar lain.
export async function insertSignature() {
  if (!E.canEdit()) return;
  const sig = await signatureDialog();
  if (!sig || sig === true) { E.restoreSel(); return; }
  const id = E.addAsset(sig.url), { w } = defaultSize(sig, 64, 240);
  E.insertHTML(`<img src="${esc(E.assetURL(id))}" data-asset="${id}" data-sig="1" alt="Tanda tangan" style="width:${Math.min(w, contentWidth())}px">`);
}
export async function replaceSignature(img) {
  if (!E.canEdit() || !img?.isConnected) return;
  const hh = img.getBoundingClientRect().height / E.zoom;
  const sig = await signatureDialog('Ganti tanda tangan', 'Ganti');
  if (!sig || sig === true || !img.isConnected) return;
  E.hist.before();
  const id = E.addAsset(sig.url);
  img.dataset.asset = id; img.dataset.sig = '1'; img.src = E.assetURL(id);
  if (hh > 4) img.style.width = Math.round(Math.min(contentWidth(), hh * sig.w / sig.h)) + 'px';
  E.changed();
  if (selected() === img) position();
}

/* ---------- Selection & resize ---------- */
let frame = null, bar = null;
export const selected = () => E.selImg?.isConnected ? E.selImg : null;

export function select(img) {
  if (E.selImg === img && frame) return position();
  deselect();
  E.selImg = img;
  img.classList.add('sel');
  const r = document.createRange();
  r.selectNode(img);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  if (E.mode === 'view') return;
  frame = h('div', { class: 'img-frame' }, ['nw', 'ne', 'sw', 'se', 'e', 'w'].map(k => h('i', { dataset: { h: k } })), h('div', { class: 'dim' }));
  frame.addEventListener('mousedown', startResize);
  frame.addEventListener('touchstart', startResize, { passive: false });
  E.pages.append(frame);
  bar = h('div', { class: 'float-bar glass-strong' },
    btn('format_image_left', 'Sebaris dengan teks', () => wrap('')),
    btn('wrap_text', 'Bungkus teks (kiri)', () => wrap('wrap-l')),
    btn('format_image_right', 'Bungkus teks (kanan)', () => wrap('wrap-r')),
    btn('align_horizontal_center', 'Pisahkan teks (tengah)', () => wrap('break')),
    h('div', { class: 'tb-sep' }),
    btn('fit_width', 'Sesuaikan lebar halaman', () => setWidth(contentWidth())),
    btn('photo_size_select_actual', 'Ukuran asli', () => setWidth(Math.min(img.naturalWidth, contentWidth()))),
    btn('short_text', 'Teks alternatif', altText),
    E.drawEdit && img.dataset.drawing ? btn('draw', 'Edit gambar', () => E.drawEdit(img)) : null,
    E.chartEdit && img.dataset.chart ? btn('bar_chart', 'Edit diagram', () => E.chartEdit(img)) : null,
    img.dataset.sig ? btn('signature', 'Ganti tanda tangan', () => replaceSignature(img)) : null,
    h('div', { class: 'tb-sep' }),
    btn('delete', 'Hapus gambar', removeSelected));
  bar.addEventListener('mousedown', e => e.preventDefault());
  document.body.append(bar);
  position();
}
const btn = (ic, tip, fn) => h('button', { class: 'ib sm', 'data-tip': tip, 'aria-label': tip, onclick: fn }, icon(ic));

export function deselect() {
  E.selImg?.classList.remove('sel');
  E.selImg = null;
  frame?.remove(); bar?.remove(); frame = bar = null;
}
export function position() {
  const img = selected();
  if (!img || !frame) { if (!img) deselect(); return; }
  const pr = E.pages.getBoundingClientRect(), r = img.getBoundingClientRect(), z = E.zoom;
  Object.assign(frame.style, { left: (r.left - pr.left) / z + 'px', top: (r.top - pr.top) / z + 'px', width: r.width / z + 'px', height: r.height / z + 'px' });
  frame.querySelector('.dim').textContent = `${Math.round(r.width / z)} × ${Math.round(r.height / z)} px`;
  frame.querySelector('.dim').style.display = 'none';
  if (bar) {
    const b = bar.getBoundingClientRect();
    let y = r.top - b.height - 10;
    if (y < 140) y = r.bottom + 10;
    bar.style.left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2)) + 'px';
    bar.style.top = Math.min(innerHeight - b.height - 8, y) + 'px';
  }
}
function startResize(e) {
  const k = e.target.dataset?.h;
  if (!k) return;
  e.preventDefault(); e.stopPropagation();
  const img = selected();
  const pt = ev => ev.touches ? ev.touches[0] : ev;
  const p0 = pt(e), w0 = img.getBoundingClientRect().width / E.zoom;
  const dir = /w/.test(k) ? -1 : 1;
  E.hist.before();
  const dim = frame.querySelector('.dim'); dim.style.display = '';
  const mv = ev => {
    const p = pt(ev);
    const w = Math.max(16, Math.min(contentWidth() * 1.5, w0 + dir * (p.clientX - p0.clientX) / E.zoom));
    img.style.width = Math.round(w) + 'px';
    img.style.height = '';
    img.removeAttribute('width'); img.removeAttribute('height');
    position(); dim.style.display = '';
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); removeEventListener('touchmove', mv); removeEventListener('touchend', up); dim.style.display = 'none'; E.changed(); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
  addEventListener('touchmove', mv, { passive: false }); addEventListener('touchend', up);
}
function wrap(cls) {
  const img = selected(); if (!img) return;
  E.hist.before();
  img.classList.remove('wrap-l', 'wrap-r', 'break');
  if (cls) img.classList.add(cls);
  E.changed();
  requestAnimationFrame(position);
}
function setWidth(w) {
  const img = selected(); if (!img) return;
  E.hist.before();
  img.style.width = Math.round(w) + 'px';
  E.changed();
  requestAnimationFrame(position);
}
async function altText() {
  const img = selected(); if (!img) return;
  const t = await ask({ title: 'Teks alternatif', label: 'Deskripsi gambar untuk pembaca layar dan saat gambar gagal dimuat', value: img.alt, ok: 'Simpan' });
  if (t == null) return;
  E.hist.before(); img.alt = t; E.changed();
}
export function removeSelected() {
  const img = selected(); if (!img) return;
  E.hist.before();
  img.remove();
  deselect();
  E.changed();
}
export async function replaceSelected(file) {
  const img = selected(); if (!img || !file) return;
  const d = await shrink(await readFile(file), file.type);
  E.hist.before();
  const id = E.addAsset(d);
  img.dataset.asset = id; img.src = E.assetURL(id);
  E.changed();
}
export { field };
