// File lock: a password (PBKDF2 hash in doc.lock) that has to be entered before the document opens.
// Unlocked documents are remembered for this browser tab only (sessionStorage); share links are not affected.
import { E } from './state.js';
import { h, icon, toast, dialog, field } from './ui.js';

const IT = 150000;
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function derive(pw, salt, it = IT) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: it }, key, 256));
}
export async function makeLock(pw, hint) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { v: 1, salt, it: IT, hash: await derive(pw, salt), hint: hint || '', at: Date.now() };
}
export async function check(lock, pw) { return !!lock && (await derive(pw, lock.salt, lock.it || IT)) === lock.hash; }

const SK = 'adocs.unlocked';
const tag = d => d.id + ':' + d.lock.hash.slice(0, 16);
const opened = () => { try { return JSON.parse(sessionStorage.getItem(SK) || '[]'); } catch { return []; } };
const keep = list => { try { sessionStorage.setItem(SK, JSON.stringify(list.slice(-200))); } catch { /* private mode: ask again next time */ } };
export const isOpen = d => !d.lock || opened().includes(tag(d));
export const markOpen = d => { if (d.lock && !isOpen(d)) keep([...opened(), tag(d)]); };
const forget = d => keep(opened().filter(x => !x.startsWith(d.id + ':')));

const pwInput = (ph, auto) => h('input', { class: 'tx', type: 'password', placeholder: ph, autocomplete: 'off', autofocus: auto || null });

// Full-screen lock before the editor is built: resolves true once the right password is entered.
export function gate(root, doc) {
  return new Promise(resolve => {
    const inp = pwInput('Kata sandi', true);
    const err = h('div', { class: 'lk-err', role: 'alert' });
    const go = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('lock_open'), 'Buka');
    let tries = 0, wait = 0;
    const form = h('form', { class: 'lk-card glass-strong' },
      h('div', { class: 'lk-ic' }, icon('lock', 'fill')),
      h('h2', null, doc.title || 'Dokumen terkunci'),
      h('p', { class: 'muted' }, 'Dokumen ini dikunci dengan kata sandi.'),
      inp, doc.lock.hint ? h('div', { class: 'small muted lk-hint' }, icon('lightbulb', 'xs'), 'Petunjuk: ' + doc.lock.hint) : null, err,
      h('div', { class: 'lk-btns' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => resolve(false) }, 'Kembali'), go));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (Date.now() < wait) return;
      go.disabled = true;
      const ok = await check(doc.lock, inp.value);
      go.disabled = false;
      if (ok) { markOpen(doc); resolve(true); return; }
      tries++;
      wait = Date.now() + (tries >= 5 ? 30000 : 0);
      err.textContent = tries >= 5 ? 'Terlalu banyak percobaan. Coba lagi dalam 30 detik.' : 'Kata sandi salah.';
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      inp.select();
    });
    document.title = 'Terkunci - Amatu Docs';
    root.replaceChildren(h('div', { class: 'lk-screen' }, form));
    requestAnimationFrame(() => inp.focus());
  });
}

export async function setDialog() {
  const d = E.doc;
  const cur = d.lock ? pwInput('Kata sandi saat ini', true) : null;
  const a = pwInput('Minimal 4 karakter', !cur), b = pwInput('Ketik ulang kata sandi');
  const hint = h('input', { class: 'tx', placeholder: 'Opsional — jangan tulis kata sandinya', value: d.lock?.hint || '' });
  const err = h('div', { class: 'lk-err' });
  const ok = await dialog({
    title: d.lock ? 'Ubah kata sandi dokumen' : 'Kunci dokumen dengan kata sandi', width: 440,
    body: h('div', { style: { display: 'grid', gap: '12px' } },
      cur ? field('Kata sandi saat ini', cur) : null,
      field('Kata sandi baru', a), field('Konfirmasi kata sandi', b), field('Petunjuk kata sandi', hint), err,
      h('p', { class: 'small muted', style: { margin: 0 } }, 'Kata sandi diminta setiap kali dokumen dibuka di tab baru, termasuk di perangkat lain akun Anda. Kata sandi tidak dapat dipulihkan — simpan baik-baik. Tautan Bagikan yang aktif tetap dapat dibuka tanpa kata sandi.')),
    buttons: [{ label: 'Batal', value: false }, { label: d.lock ? 'Simpan' : 'Kunci', primary: true, action: async () => {
      if (cur && !(await check(d.lock, cur.value))) { err.textContent = 'Kata sandi saat ini salah.'; return false; }
      if (a.value.length < 4) { err.textContent = 'Kata sandi minimal 4 karakter.'; return false; }
      if (a.value !== b.value) { err.textContent = 'Konfirmasi kata sandi tidak sama.'; return false; }
      if (hint.value && hint.value.includes(a.value)) { err.textContent = 'Petunjuk tidak boleh berisi kata sandi.'; return false; }
      return true;
    } }],
  });
  if (!ok || E.doc !== d) return;
  forget(d);
  d.lock = await makeLock(a.value, hint.value.trim());
  markOpen(d);
  E.dirty = true;
  await E.save();
  E.updateToolbar?.();
  toast(cur ? 'Kata sandi diubah' : 'Dokumen dikunci. Kata sandi diminta saat dibuka berikutnya.');
}

export async function removeDialog() {
  const d = E.doc;
  const cur = pwInput('Kata sandi saat ini', true), err = h('div', { class: 'lk-err' });
  const ok = await dialog({
    title: 'Hapus kata sandi', width: 400,
    body: h('div', { style: { display: 'grid', gap: '12px' } }, h('p', { class: 'muted', style: { margin: 0 } }, 'Dokumen akan dapat dibuka tanpa kata sandi.'), field('Kata sandi saat ini', cur), err),
    buttons: [{ label: 'Batal', value: false }, { label: 'Hapus kata sandi', danger: true, action: async () => (await check(d.lock, cur.value)) || ((err.textContent = 'Kata sandi salah.'), false) }],
  });
  if (!ok || E.doc !== d) return;
  forget(d);
  delete d.lock;
  E.dirty = true;
  await E.save();
  E.updateToolbar?.();
  toast('Kata sandi dihapus');
}

// Close the document and forget the unlock for this tab.
export async function lockNow() {
  const d = E.doc;
  if (!d?.lock) return;
  await E.save();
  forget(d);
  location.hash = '#/d/' + d.id + '?l=' + Date.now();
}
