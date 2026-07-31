/**
 * Minimal client-side path router — no library, since the app is one flat view switch rather
 * than a nested route tree. Syncs only "which page" state (view + primary entity id + its
 * top-level tab) to the URL/history; filters, sort order, and search text stay local and are
 * deliberately left out, so they reset on navigation instead of half-restoring on back/forward.
 *
 * Deployed on GitHub Pages under a repo subpath (see vite.config.ts's `base`), which has no
 * server-side rewrites — deep links only survive a hard reload/share because of the
 * spa-github-pages redirect trick in public/404.html + index.html.
 */

export type View = 'home' | 'search' | 'profile' | 'bill' | 'crossref' | 'org' | 'party' | 'impressum' | 'disclaimer' | 'datenschutz' | 'daten';
export type ProfileTab = 'overview' | 'votes' | 'lobby' | 'finance';
export type LobbyTab = 'overview' | 'parties' | 'orgs' | 'conflicts' | 'donations';
export type PartyTab = 'overview' | 'ties' | 'donations';

export interface RouteState {
  view: View;
  mpId: string | null;
  profileTab: ProfileTab;
  billId: string | null;
  orgId: string | null;
  party: string | null;
  partyTab: PartyTab;
  lobbyTab: LobbyTab;
}

export const DEFAULT_ROUTE: RouteState = {
  view: 'home', mpId: null, profileTab: 'overview', billId: null, orgId: null, party: null, partyTab: 'overview', lobbyTab: 'overview',
};

const PROFILE_TAB_TO_SEGMENT: Record<ProfileTab, string | null> = { overview: null, votes: 'stimmen', lobby: 'lobby', finance: 'finanzen' };
const SEGMENT_TO_PROFILE_TAB: Record<string, ProfileTab> = { stimmen: 'votes', lobby: 'lobby', finanzen: 'finance' };

const PARTY_TAB_TO_SEGMENT: Record<PartyTab, string | null> = { overview: null, ties: 'verflechtungen', donations: 'spenden' };
const SEGMENT_TO_PARTY_TAB: Record<string, PartyTab> = { verflechtungen: 'ties', spenden: 'donations' };

const LOBBY_TAB_TO_SEGMENT: Record<LobbyTab, string | null> = { overview: null, parties: 'parteien', orgs: 'organisationen', conflicts: 'verflechtungen', donations: 'spenden' };
const SEGMENT_TO_LOBBY_TAB: Record<string, LobbyTab> = { parteien: 'parties', organisationen: 'orgs', verflechtungen: 'conflicts', spenden: 'donations' };

/** Builds the app-relative path (no BASE_URL prefix) for a route state. */
export function routeToPath(r: RouteState): string {
  switch (r.view) {
    case 'home':
      return '/';
    case 'search':
      return '/abgeordnete';
    case 'profile': {
      if (!r.mpId) return '/abgeordnete';
      const seg = PROFILE_TAB_TO_SEGMENT[r.profileTab];
      return `/abgeordnete/${encodeURIComponent(r.mpId)}${seg ? `/${seg}` : ''}`;
    }
    case 'bill':
      return r.billId ? `/gesetze/${encodeURIComponent(r.billId)}` : '/';
    case 'org':
      return r.orgId ? `/organisationen/${encodeURIComponent(r.orgId)}` : '/lobby-finanzen';
    case 'party': {
      if (!r.party) return '/';
      const seg = PARTY_TAB_TO_SEGMENT[r.partyTab];
      return `/parteien/${encodeURIComponent(r.party)}${seg ? `/${seg}` : ''}`;
    }
    case 'crossref': {
      const seg = LOBBY_TAB_TO_SEGMENT[r.lobbyTab];
      return `/lobby-finanzen${seg ? `/${seg}` : ''}`;
    }
    case 'impressum':
      return '/impressum';
    case 'disclaimer':
      return '/hinweis-zu-den-daten';
    case 'datenschutz':
      return '/datenschutz';
    case 'daten':
      return '/daten';
  }
}

/** Parses an app-relative pathname (already stripped of BASE_URL) into a route state — unrecognized paths fall back to home. */
export function pathToRoute(pathname: string): RouteState {
  const segments = pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (segments.length === 0) return { ...DEFAULT_ROUTE };

  const [first, second, third] = segments;
  if (first === 'abgeordnete') {
    if (!second) return { ...DEFAULT_ROUTE, view: 'search' };
    return { ...DEFAULT_ROUTE, view: 'profile', mpId: second, profileTab: third ? SEGMENT_TO_PROFILE_TAB[third] ?? 'overview' : 'overview' };
  }
  if (first === 'gesetze' && second) return { ...DEFAULT_ROUTE, view: 'bill', billId: second };
  if (first === 'organisationen' && second) return { ...DEFAULT_ROUTE, view: 'org', orgId: second };
  if (first === 'parteien' && second) {
    return { ...DEFAULT_ROUTE, view: 'party', party: second, partyTab: third ? SEGMENT_TO_PARTY_TAB[third] ?? 'overview' : 'overview' };
  }
  if (first === 'lobby-finanzen') {
    return { ...DEFAULT_ROUTE, view: 'crossref', lobbyTab: second ? SEGMENT_TO_LOBBY_TAB[second] ?? 'overview' : 'overview' };
  }
  if (first === 'impressum') return { ...DEFAULT_ROUTE, view: 'impressum' };
  if (first === 'datenschutz') return { ...DEFAULT_ROUTE, view: 'datenschutz' };
  if (first === 'hinweis-zu-den-daten') return { ...DEFAULT_ROUTE, view: 'disclaimer' };
  if (first === 'daten') return { ...DEFAULT_ROUTE, view: 'daten' };
  return { ...DEFAULT_ROUTE };
}

/** Strips the Vite BASE_URL prefix (e.g. '/Politblick/') from a real pathname, so routeToPath/pathToRoute can stay base-agnostic. */
export function stripBase(pathname: string, base: string): string {
  if (base !== '/' && pathname.startsWith(base)) return `/${pathname.slice(base.length)}`;
  return pathname;
}

/** Re-adds the Vite BASE_URL prefix to an app-relative path, for writing back to the browser's address bar. */
export function withBase(path: string, base: string): string {
  if (base === '/') return path;
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return path === '/' ? `${trimmedBase}/` : `${trimmedBase}${path}`;
}
