// Shared helpers for the FragDenStaat document matching (fetch-fds, apply-fds-review, build-fds-mentions).
import fs from 'node:fs';
import path from 'node:path';

export const FDS_API = 'https://fragdenstaat.de/api/v1';
const UA = 'politblick-research (civic data project; https://politblick.de)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PATHS = {
  state: 'data/fds-state.json',
  candidates: 'data/fds-candidates.json',
  decisions: 'data/fds-decisions.json',
  aliases: 'data/fds-org-aliases.json',
  register: 'data/lobby-register.json',
  mentions: 'public/data/fds-mentions.json',
};

export const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
export const writeJson = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
};
export const keyOf = (orgId, docId) => `${orgId}:${docId}`;

/** GET with ~1 request/second, retries on 429/5xx; returns null for hidden/deleted objects. */
export async function fdsGet(url, tries = 3) {
  await sleep(1000);
  const full = url.startsWith('http') ? url : `https://fragdenstaat.de${url}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(full, { headers: { 'User-Agent': UA } });
      if (res.status === 404 || res.status === 403) return null;
      if (res.status === 429 || res.status >= 500) {
        await sleep(10000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${full}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(5000);
    }
  }
  throw new Error(`gave up on ${full}`);
}

export async function fdsList(url) {
  const out = [];
  let next = url;
  while (next) {
    const j = await fdsGet(next);
    if (!j) break;
    out.push(...j.objects);
    next = j.meta.next;
  }
  return out;
}

// OCR in these PDFs puts Cyrillic/Greek look-alikes into German words.
const LOOKALIKE = { а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', ь: 'b', і: 'i', ј: 'j', ѕ: 's', ο: 'o', α: 'a', ε: 'e', ι: 'i', ν: 'v', ρ: 'p', τ: 't', ê: 'e', ë: 'e' };
export const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[а-яёіјѕα-ω]/g, (c) => LOOKALIKE[c] ?? c)
    .replace(/[„“"'’`]/g, '')
    .replace(/[-‐–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const LEGAL = /\s*(e\.\s?v\.?|gmbh|ag|se|kgaa|kg|ug|mbh|& co\.?|ggmbh|e\.\s?g\.?|ohg|ltd\.?|inc\.?|co\.)\s*$/i;
const GENERIC = new Set(['deutschland', 'bundesverband', 'verband', 'stiftung', 'institut', 'gesellschaft', 'deutsche bahn', 'deutsche post', 'die linke', 'bündnis 90/die grünen']);

/** Search needles for every lobby-register org: full name, name without legal form, hand aliases. */
export function buildEntities(register, aliases = {}) {
  const entities = [];
  for (const o of register) {
    const full = (o.name || '').trim();
    if (!full) continue;
    const variants = new Set([full, ...(aliases[o.id] ?? [])]);
    let short = full.replace(/\s*\([^)]*\)\s*$/, '');
    variants.add(short);
    for (let i = 0; i < 3; i++) short = short.replace(LEGAL, '').replace(/[,\s]+$/, '');
    variants.add(short);
    for (const v of variants) {
      const n = norm(v);
      // Too short or generic, or a single word under 16 chars ("Interconnector"): too many false hits.
      if (n.length < 10 || GENERIC.has(n) || (!/\s/.test(n) && n.length < 16)) continue;
      entities.push({ id: o.id, name: full, needle: n });
    }
  }
  return entities;
}

/** All orgs named in one page of OCR text, with a raw-text context snippet. */
export function matchPage(content, entities) {
  const raw = (content || '').replace(/\s+/g, ' ');
  const rawLower = raw.toLowerCase();
  const text = norm(raw);
  const hits = [];
  const seen = new Set();
  for (const e of entities) {
    if (seen.has(e.id)) continue;
    const idx = text.indexOf(e.needle);
    if (idx === -1) continue;
    const before = text[idx - 1];
    const after = text[idx + e.needle.length];
    if ((before && /[\p{L}\d]/u.test(before)) || (after && /[\p{L}\d]/u.test(after))) continue;
    // Bank details in letter footers ("Bankverbindung: Deutsche Bank AG IBAN …") are not mentions.
    const near = text.slice(Math.max(0, idx - 60), idx + e.needle.length + 60);
    if (/\b(iban|bic|swift|blz|bankverbindung|bank details|konto|kto)\b/.test(near)) continue;
    seen.add(e.id);
    const ri = rawLower.indexOf(e.needle);
    const src = ri === -1 ? text : raw;
    const at = ri === -1 ? idx : ri;
    hits.push({
      orgId: e.id,
      orgName: e.name,
      snippet: src.slice(Math.max(0, at - 120), Math.min(src.length, at + e.needle.length + 120)).trim(),
    });
  }
  return hits;
}
