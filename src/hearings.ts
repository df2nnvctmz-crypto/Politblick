import { useEffect, useState } from 'react';
import { fetchLocalJson } from './snapshot';

/**
 * Public committee hearings, scraped from bundestag.de by scripts/fetch-hearings.mjs and given
 * register links by scripts/build-hearings.mjs.
 *
 * What this data can say, and what it cannot:
 *   - A hearing is tied to a vote only when both name the same Drucksache. Nothing is matched on
 *     topic or title.
 *   - A statement is something an organisation or person *submitted in writing* for the hearing.
 *     It is not proof that they were invited, spoke, or which side they took — the statement PDF
 *     is linked for that.
 *   - `orgId` is set only when the author's name, as printed by the Bundestag, is exactly a
 *     Lobbyregister entry's name (see scripts/lib/hearings.mjs). A statement without one may
 *     still be from a registered organisation spelled differently; the UI never says otherwise.
 *   - Statements by persons are never linked to the institution named beside them.
 */
export interface HearingStatement {
  /** The author as the Bundestag lists it — shown verbatim. */
  author: string;
  /** The full link text, including the committee document number. */
  label: string;
  url: string;
  /** "21(9)333" — the Ausschussdrucksache, when the listing gives one. */
  number: string | null;
  orgId?: string;
  /** Which rule made the register link — 'exact', 'acronym', 'city' or 'alias' (hand-reviewed). */
  rule?: string;
}

export interface Hearing {
  id: string;
  url: string;
  title: string;
  committee: string | null;
  /** ISO date; null when the page's time line could not be read. */
  date: string | null;
  drucksachen: string[];
  expertListUrl: string | null;
  statements: HearingStatement[];
}

export interface HearingsFile {
  generatedAt: string | null;
  source: string;
  registerEntryCount: number;
  orgs: Record<string, { name: string; url: string | null }>;
  hearings: Hearing[];
}

let hearingsPromise: Promise<HearingsFile> | null = null;

function loadHearings(): Promise<HearingsFile> {
  if (!hearingsPromise) {
    hearingsPromise = fetchLocalJson<HearingsFile>('/data/hearings.json').catch((e) => {
      // Let a later page view retry rather than caching the failure for the whole session.
      hearingsPromise = null;
      throw e;
    });
  }
  return hearingsPromise;
}

/** Hearings that dealt with at least one of these Drucksachen, newest first, each with the numbers it shares. */
export function hearingsForDrucksachen(file: HearingsFile, drucksachen: readonly string[]): { hearing: Hearing; shared: string[] }[] {
  const wanted = new Set(drucksachen);
  if (wanted.size === 0) return [];
  return file.hearings
    .map((hearing) => ({ hearing, shared: hearing.drucksachen.filter((d) => wanted.has(d)) }))
    .filter((h) => h.shared.length > 0)
    .sort((a, b) => (b.hearing.date ?? '').localeCompare(a.hearing.date ?? ''));
}

export interface StatementRef {
  hearing: Hearing;
  statement: HearingStatement;
  /** The Drucksachen this hearing shares with the vote it is being shown against. */
  shared: string[];
}

/**
 * Register-linked statements on the hearings behind one vote, grouped by register id. This is
 * what puts a statement onto an organisation's lobbying card: same vote, by Drucksache.
 */
export function statementsByOrgForDrucksachen(file: HearingsFile, drucksachen: readonly string[]): Map<string, StatementRef[]> {
  const out = new Map<string, StatementRef[]>();
  for (const { hearing, shared } of hearingsForDrucksachen(file, drucksachen)) {
    for (const statement of hearing.statements) {
      if (!statement.orgId) continue;
      const list = out.get(statement.orgId) ?? [];
      list.push({ hearing, statement, shared });
      out.set(statement.orgId, list);
    }
  }
  return out;
}

/** Every statement a register entry is linked to, with its hearing, newest first. */
export function statementsByOrg(file: HearingsFile, orgId: string): { hearing: Hearing; statement: HearingStatement }[] {
  const out: { hearing: Hearing; statement: HearingStatement }[] = [];
  for (const hearing of file.hearings) {
    for (const statement of hearing.statements) if (statement.orgId === orgId) out.push({ hearing, statement });
  }
  return out.sort((a, b) => (b.hearing.date ?? '').localeCompare(a.hearing.date ?? ''));
}

export interface HearingsState {
  file: HearingsFile | null;
  loading: boolean;
  error: boolean;
}

/**
 * Loads hearings.json (cached for the session). Pass false to skip — it is only needed on a bill
 * or organisation page, so like the vote archive it stays out of the blocking snapshot.
 */
export function useHearings(enabled: boolean): HearingsState {
  const [state, setState] = useState<HearingsState>({ file: null, loading: false, error: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((prev) => (prev.file ? prev : { file: null, loading: true, error: false }));
    loadHearings().then(
      (file) => !cancelled && setState({ file, loading: false, error: false }),
      () => !cancelled && setState({ file: null, loading: false, error: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
