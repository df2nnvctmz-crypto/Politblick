/**
 * Datenstories: one research finding per page, told by live charts and a few hand-written
 * sentences (/datenstories/<slug>/).
 *
 * How text and numbers stay in step:
 * - scripts/build-datenstories.mjs writes the numbers (public/data/datenstories/<slug>.json) and
 *   no prose.
 * - The story definition (src/datenstories/<slug>/story.ts) holds the hand-written text. Every
 *   number in it is a `{slot}`, filled by the story's `slots()` from that JSON, so a weekly data
 *   update moves text and chart together.
 * - Text that is only true as of a date (quotes, register wording, a classification someone made
 *   by reading entries) is a *frozen* finding: it carries its `asOf` date and is shown with it,
 *   never silently updated.
 */

export interface UsLobbyEntry {
  id: string;
  name: string;
  midEuro: number;
  registerUrl: string;
  /** Prerendered politblick org page, or null when the org has none (most don't). */
  orgPath: string | null;
  evidenceType: string | null;
  evidenceUrl: string | null;
}

export interface UsLobbyGroup {
  parent: string;
  label: string;
  valueEuro: number;
  entries: UsLobbyEntry[];
}

export interface UsLobbyZone {
  count: number;
  sumEuro: number;
  groups: UsLobbyGroup[];
}

export type LevyCamp = 'against' | 'for' | 'shape' | 'agency';

export interface LevyEntry {
  id: string;
  label: string;
  camp: LevyCamp;
  note: string;
  isUs: boolean;
  inRegister: boolean;
  registerUrl: string;
  orgPath: string | null;
}

export interface UsLobbyData {
  slug: 'us-lobby';
  generatedAt: string | null;
  curatedCheckedOn: string;
  treemap: {
    zones: { seat: UsLobbyZone; subsidiary: UsLobbyZone };
    totalEuro: number;
    entryCount: number;
    registerTotalEuro: number;
    registerEntryCount: number;
    excludedCount: number;
  };
  revolvingDoor: RevolvingDoor;
  orgPaths: string[];
  review: { newUsSeatEntries: { id: string; name: string; midEuro: number }[]; missingEntries: string[] };
}

export interface EuroRange {
  from: number;
  to: number;
}

export interface RevolvingDoorPerson {
  name: string;
  roleLabel: string;
  note: string | null;
  cardLabel: string;
  cardNote: string | null;
  /** YYYY-MM, live from the register; null if the register no longer names the person here. */
  endDate: string | null;
  position: string | null;
  authority: string | null;
  kind: string | null;
  stillNamed: boolean;
  direct: boolean;
  /** What the lobbying was about, as the register words it: the agency mandate's projects, else the client's own project headlines. */
  topics: { kind: 'mandate' | 'client' | null; items: string[] };
  via: { id: string | null; name: string | null; orgPath: string | null; registerUrl: string | null } | null;
  clients: { id: string; name: string; label: string; zone: 'seat' | 'subsidiary' | null; euro: EuroRange | null; orgPath: string | null; registerUrl: string }[];
}

export interface RevolvingDoor {
  checkedOn: string;
  people: RevolvingDoorPerson[];
  /** Everyone the register names for a US entry. Bundestag staff are private persons: counted only. */
  totals: { persons: number; exMps: number; government: number; staff: number };
}

export interface UsVote {
  id: number;
  title: string;
  date: string;
  accepted: boolean;
  path: string;
  totals: { yes: number; no: number; abstain: number; noShow: number };
  /** All register entries that lobbied on this bill (lobby-links), US or not. */
  lobbyCount: number;
  usOrgs: {
    id: string;
    label: string;
    name: string;
    demands: string[];
    orgPath: string | null;
    registerUrl: string;
    /** Curated direction (hand-read register wording); null where the data gives none. */
    stance: { camp: LevyCamp; note: string; checkedOn: string } | null;
  }[];
  topics: string[];
  drucksachen: string[];
  abgeordnetenwatchUrl: string | null;
  /** First paragraph of abgeordnetenwatch's summary of the vote. */
  summary: string | null;
  parties: { party: string; color: string; yes: number; no: number; abstain: number; noShow: number }[];
}

export interface SugarLevy {
  checkedOn: string;
  counts: Record<LevyCamp, number>;
  entries: LevyEntry[];
  gkvBill: { id: number; title: string; date: string; path: string } | null;
}

export interface UsGesetzeData {
  slug: 'us-gesetze';
  generatedAt: string | null;
  curatedCheckedOn: string;
  usEntryCount: number;
  votes: UsVote[];
  sugarLevy: SugarLevy;
  orgPaths: string[];
}

export type DatenstoryData = UsLobbyData | UsGesetzeData;

/** A quote or register wording that was true on `asOf` and is shown with that date. */
export interface FrozenQuote {
  who: string;
  role: string;
  text: string;
  asOf: string;
  sourceUrl: string;
}

export interface StorySection<Chart extends string> {
  id: string;
  chart: Chart;
  heading: string;
  /** Second, highlighted half of the heading (the contrast), like the Reddit slides' two-tone titles. */
  headingAccent?: string;
  /** Paragraphs; `{slot}` placeholders are filled from the story's slots(). */
  body: string[];
  shows: string;
  notShows: string;
  quotes?: FrozenQuote[];
}

/** A newsroom or project the story was researched with. Credited on the page with a followed backlink. */
export interface StoryPartner {
  name: string;
  url: string;
  /** Logo on light backgrounds, root-absolute under public/. */
  logo: string;
  /** One sentence on what the partner contributed. */
  credit: string;
}

/** Entry in the Datenstories index page. Static text only — the numbers live on the story page. */
export interface DatenstoryListing {
  slug: string;
  kicker: string;
  title: string;
  teaser: string;
  /** Date the research was done (ISO). The page shows live numbers; this dates the frozen parts. */
  researchedOn: string;
  partner?: StoryPartner;
  /** Stories that belong together ("US-Lobby in Berlin", part 1 and 2) get a series bar. */
  series?: { name: string; part: number; partLabel: string };
}
