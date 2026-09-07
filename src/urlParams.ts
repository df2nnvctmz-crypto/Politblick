/**
 * Building and reading the human-readable URL segments.
 *
 * router.ts owns which route a path maps to; this owns what goes inside one segment —
 * the "<id>-<slug>" form that keeps /abgeordnete/118559-friedrich-merz readable while
 * leaving the id the only part anything parses back out.
 *
 * Pure and side-effect free. Covered by src/urlParams.test.ts.
 */

import { slugify } from './format';
import type { RealMp } from './bundestag';
import type { RealPoll } from './polls';

export type BillId = string | number;

/** Real polls use numeric ids, demo bills use string ids like 'b1' — a URL segment is always a string, so a purely-numeric one is a real poll id. */
export function parseBillId(billId: string | null): BillId | null {
  if (billId === null) return null;
  return /^\d+$/.test(billId) ? Number(billId) : billId;
}

/** Builds the `/abgeordnete/<id>-<name-slug>` URL segment for an MP — kept ID-first (rather than
 * a bare name slug like the party URLs) because names aren't guaranteed unique across 630+
 * members the way party names are, and it keeps every already-shared/indexed numeric link
 * (`/abgeordnete/175389`) resolving to the same page forever, since the ID is still right there
 * at the front. The slug after it exists purely so the URL reads as a name for sharing/indexing. */
export function buildMpUrlParam(id: string, roster: RealMp[]): string {
  const name = roster.find((m) => String(m.id) === id)?.name;
  return name ? `${id}-${slugify(name)}` : id;
}

/** The router treats the whole `/abgeordnete/<param>` segment as opaque — this pulls the actual
 * lookup key (the leading numeric ID) back out, so a slug URL and a bare-ID URL both resolve to
 * the same member via the existing ID-based matching everywhere else in this file. */
export function extractMpId(param: string | null): string | null {
  if (!param) return null;
  return param.match(/^\d+/)?.[0] ?? param;
}

/** Generic sibling of buildMpUrlParam, for bill/org/committee URLs — same id-first-then-readable-
 * slug shape, for the same reasons (share-worthy links, stable IDs). */
export function buildSlugParam(id: string | number, name: string | null | undefined): string {
  return name ? `${id}-${slugify(name)}` : String(id);
}

/** Generic sibling of extractMpId, for id formats that never contain a hyphen themselves — plain
 * numeric ids (bills, committees) and the Lobbyregister's letter-prefixed org ids (e.g.
 * "R007203") all qualify, so splitting on the first hyphen reliably isolates the id from
 * whatever readable slug got appended after it. */
export function extractLeadingId(param: string | null): string | null {
  if (!param) return null;
  const dash = param.indexOf('-');
  return dash === -1 ? param : param.slice(0, dash);
}

/** Bill URLs are keyed by the real poll id. */
export function buildBillUrlParam(id: BillId, polls: RealPoll[]): string {
  const title = typeof id === 'number' ? polls.find((p) => p.id === id)?.title : undefined;
  return buildSlugParam(id, title);
}
