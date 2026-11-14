// Cleans pasted or imported HTML down to the document vocabulary.

const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'COLGROUP', 'COL',
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUB', 'SUP', 'A', 'SPAN', 'BR', 'HR', 'IMG', 'BLOCKQUOTE', 'PRE', 'CODE', 'MARK', 'DIV', 'FONT']);
const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'CANVAS', 'VIDEO', 'AUDIO']);
const INLINE_CSS = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'font-size', 'font-family', 'vertical-align'];
const BLOCK_CSS = ['text-align', 'line-height', 'margin-left', 'text-indent', 'list-style-type', 'background-color', 'width', '--sb', '--sa', 'column-count', 'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'padding', 'padding-left', 'vertical-align'];
const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'UL', 'OL', 'TABLE', 'DIV', 'COL']);
const KEEP_CLASS = /^(title|subtitle|checklist|nb|pb|dt|cols|dropcap|toc|biblio|wrap-l|wrap-r|break|fn|eq|chip|date|fld|bm|cite|st-[\w-]+)$/;

export function sanitize(html, { keepClasses = false, keepDataUrls = true, keepReview = false } = {}) {
  html = String(html).replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?o:p>/g, '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  clean(root, keepClasses, keepDataUrls, keepReview);
  // Google Docs wraps everything in <b style="font-weight:normal" id="docs-internal-guid-...">
  root.querySelectorAll('b[id^="docs-internal"]').forEach(b => b.replaceWith(...b.childNodes));
  // Word list paragraphs ("MsoListParagraph") arrive as <p> with bullet glyphs; leave as text.
  return root.innerHTML.replace(/ /g, ' ').replace(/ {2,}/g, m => m).trim();
}

function clean(node, keepClasses, keepDataUrls, keepReview) {
  for (const c of [...node.childNodes]) {
    if (c.nodeType === 8) { c.remove(); continue; }
    if (c.nodeType === 3) continue;
    if (c.nodeType !== 1) { c.remove(); continue; }
    const tag = c.tagName.toUpperCase();
    if (DROP.has(tag)) { c.remove(); continue; }
    clean(c, keepClasses, keepDataUrls, keepReview);
    if (!KEEP.has(tag)) {
      if (/^(SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|NAV|FIGURE|FIGCAPTION|ADDRESS|DL|DT|DD|CENTER)$/.test(tag)) {
        const p = c.ownerDocument.createElement(/^(DT|FIGCAPTION|ADDRESS|DD)$/.test(tag) ? 'p' : 'div');
        p.append(...c.childNodes);
        c.replaceWith(p);
        if (p.tagName === 'DIV') unwrapDiv(p);
      } else c.replaceWith(...c.childNodes);
      continue;
    }
    const style = c.getAttribute('style') || '';
    const cls = c.getAttribute('class') || '';
    const keep = {};
    for (const a of ['href', 'src', 'alt', 'colspan', 'rowspan', 'start', 'width', 'data-checked', 'data-tex', 'data-fn', 'data-f', 'data-asset', 'data-kind', 'data-date', 'data-c', 'data-s', 'data-a', 'data-t', 'data-src', 'data-drawing', 'data-chart', 'data-sig', 'id', 'contenteditable']) {
      if (c.hasAttribute(a)) keep[a] = c.getAttribute(a);
    }
    for (const a of [...c.attributes]) c.removeAttribute(a.name);
    for (const [k, v] of Object.entries(keep)) {
      if (k === 'href') { if (/^(https?:|mailto:|tel:|#)/i.test(v.trim())) c.setAttribute('href', v.trim()); continue; }
      if (k === 'src') { if (/^https?:/i.test(v) || (keepDataUrls && /^data:image\//i.test(v)) || /^blob:/.test(v)) c.setAttribute('src', v); continue; }
      if (k === 'id' && !/^(h|bm)-[\w-]+$/.test(v)) continue;
      if (k === 'contenteditable' && !keepClasses) continue;
      if (/^data-/.test(k) && !keepClasses && !/^data-checked$/.test(k)) continue;
      c.setAttribute(k, v);
    }
    if (cls) {
      const kept = cls.split(/\s+/).filter(x => keepClasses ? KEEP_CLASS.test(x) || x === 'sg' || (keepReview && /^(cmt|resolved)$/.test(x)) : /^(title|subtitle|checklist)$/.test(x));
      if (kept.length) c.setAttribute('class', kept.join(' '));
    }
    const allowed = BLOCKS.has(tag) ? BLOCK_CSS.concat(INLINE_CSS) : tag === 'IMG' ? ['width', 'height', 'float'] : INLINE_CSS;
    const out = [];
    for (const decl of style.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const k = decl.slice(0, i).trim().toLowerCase();
      let v = decl.slice(i + 1).trim();
      if (!allowed.includes(k) || !v || /expression|url\(|javascript/i.test(v)) continue;
      if (k === 'font-weight' && (v === 'normal' || v === '400') && tag !== 'B' && tag !== 'STRONG' && !/^H\d$/.test(tag)) continue;
      if (k === 'font-style' && v === 'normal') continue;
      if (k === 'color' && /^(#000000|#000|rgb\(0,\s*0,\s*0\)|windowtext|black)$/i.test(v)) continue;
      if (k === 'background-color' && /^(transparent|rgba\(0,\s*0,\s*0,\s*0\)|initial|inherit)$/i.test(v)) continue;
      if (k === 'text-decoration' && v === 'none') continue;
      if (k === 'vertical-align' && v === 'baseline') continue;
      if (k === 'margin-left' && /^-/.test(v)) continue;
      if (k === 'font-family') v = v.replace(/"/g, "'");
      out.push(`${k}:${v}`);
    }
    if (out.length) c.setAttribute('style', out.join(';'));
    if (tag === 'FONT') {
      const sp = c.ownerDocument.createElement('span');
      if (keep.color) sp.style.color = keep.color;
      sp.append(...c.childNodes);
      c.replaceWith(sp);
    }
    if (tag === 'SPAN' && !c.attributes.length) c.replaceWith(...c.childNodes);
    if (tag === 'DIV' && !c.getAttribute('class')) unwrapDiv(c);
    if (tag === 'A' && !c.getAttribute('href') && !c.id) c.replaceWith(...c.childNodes);
  }
}
function unwrapDiv(d) {
  if (!d.parentNode) return;
  const hasBlock = [...d.children].some(x => BLOCKS.has(x.tagName.toUpperCase()) || x.tagName === 'HR');
  if (hasBlock) { d.replaceWith(...d.childNodes); return; }
  const p = d.ownerDocument.createElement('p');
  for (const a of d.attributes) p.setAttribute(a.name, a.value);
  p.append(...d.childNodes);
  d.replaceWith(p);
}

export function textToHtml(text) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return String(text).replace(/\r\n?/g, '\n').split('\n').map(l => `<p>${esc(l) || '<br>'}</p>`).join('');
}

// Minimal Markdown → HTML for import.
export function mdToHtml(md) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = s => esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/(\*\*|__)(.+?)\1/g, '<b>$2</b>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|\W)_(?!\s)(.+?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(esc(lines[i++])); i++; out.push(`<pre>${buf.join('\n')}</pre>`); continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^(\s*[-*_]){3,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(inline(lines[i++].replace(/^>\s?/, ''))); out.push(`<blockquote>${buf.join('<br>')}</blockquote>`); continue; }
    if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const row = s => s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = row(l); i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(row(lines[i++]));
      out.push(`<table><tbody><tr>${head.map(c => `<th><p>${inline(c)}</p></th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td><p>${inline(c)}</p></td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const stack = [];
      let html = '';
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const mm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
        const lvl = Math.floor(mm[1].replace(/\t/g, '    ').length / 2);
        const tag = /\d/.test(mm[2]) ? 'ol' : 'ul';
        const chk = mm[3] ? ` data-checked="${/x/i.test(mm[3])}"` : '';
        while (stack.length > lvl + 1) html += `</li></${stack.pop()}>`;
        if (stack.length === lvl + 1) html += '</li>';
        while (stack.length < lvl + 1) { stack.push(tag); html += `<${tag}${mm[3] ? ' class="checklist"' : ''}>`; }
        html += `<li${chk}>${inline(mm[4])}`;
        i++;
      }
      while (stack.length) html += `</li></${stack.pop()}>`;
      out.push(html);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|\|)/.test(lines[i])) buf.push(inline(lines[i++]));
    out.push(`<p>${buf.join(' ')}</p>`);
  }
  return out.join('') || '<p><br></p>';
}
