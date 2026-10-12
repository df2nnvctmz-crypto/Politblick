#!/usr/bin/env node
/**
 * Sends the Sitzungswochen-Briefing as an email campaign via Brevo.
 *
 * Reads one week's briefing (public/data/stories/<montag>.json, built by build-stories.mjs) and
 * renders it as an email laid out like the briefing page (src/stories/Briefing.tsx): masthead,
 * lead + "Die Woche in Zahlen", then sections I–IV with vote bands and party-coloured bars.
 * Every sentence about the week comes from the same `sw*` templates in src/data.ts the website
 * uses (imported directly; Node strips the types), so the email can never say something the
 * briefing page doesn't. The only text written here is the email chrome: subject, button, footer.
 *
 * Email-client constraints: table layout only (Outlook has no flexbox), inline styles, colours
 * as hex (no client understands oklch, so the site's oklch colours are converted here), no
 * images and no web fonts — nothing in the mail loads from a server when it is opened.
 *
 * Which week: by default the ISO week containing today (UTC) — the workflow runs on Saturday, so
 * that is the sitting week that just ended. No briefing for that week = no sitting week = nothing
 * is sent and the script exits 0. `--week YYYY-MM-DD` (a Monday) picks a week explicitly.
 *
 * Modes (`--mode` or NEWSLETTER_MODE):
 *   preview — only writes the HTML to newsletter-preview.html (gitignored). No network, no key.
 *   test    — creates/updates the week's campaign as a Brevo draft; if NEWSLETTER_TEST_EMAIL is
 *             set, also sends a test email there. Nothing reaches the list.
 *   send    — creates the campaign (or reuses the draft) and sends it to the whole list.
 *
 * Idempotent: the campaign is named "Sitzungswochen-Briefing <montag>". If a campaign with that
 * name was already sent, nothing happens — re-running the workflow can never mail the list twice.
 *
 * Env: BREVO_API_KEY, BREVO_LIST_ID (test/send), NEWSLETTER_TEST_EMAIL (optional, test).
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJsonFile } from './lib/common.mjs';

const SITE_URL = 'https://politblick.de';
const API = 'https://api.brevo.com/v3';
const SENDER = { name: 'Politblick', email: 'news@politblick.de' };
const REPLY_TO = 'kontakt@politblick.de';
const PREVIEW_FILE = 'newsletter-preview.html';
const SEATS = 630;
const DONATION_PREVIEW = 5;

// Same address as the Impressum (src/data.ts impressumBody). Required in every newsletter.
const POSTAL_ADDRESS = 'Politblick – Oskar Leenders · c/o Autorenglück #30896 · Albert-Einstein-Str. 47 · 02977 Hoyerswerda';

// ── colours (the site's oklch palette, converted once to hex) ─────────────────────────────

/** oklch(L% C h) or oklch(L C h) → #rrggbb, via OKLab → linear sRGB. */
function oklchToHex(css) {
  const m = String(css).match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return css;
  const L = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return `#${lin
    .map((v) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

// Mirrors the constants in src/stories/Briefing.tsx.
const C = Object.fromEntries(
  Object.entries({
    ink: 'oklch(24% 0.01 260)',
    lead: 'oklch(34% 0.01 260)',
    muted: 'oklch(48% 0.01 260)',
    faint: 'oklch(56% 0.01 260)',
    ordinal: 'oklch(76% 0.02 260)',
    hair: 'oklch(92% 0.006 260)',
    rule: 'oklch(90% 0.006 260)',
    track: 'oklch(93% 0.006 260)',
    accent: 'oklch(45% 0.16 265)',
    page: 'oklch(97% 0.006 260)',
    yes: 'oklch(52% 0.13 155)',
    no: 'oklch(56% 0.16 40)',
    abstain: 'oklch(80% 0.02 260)',
    noShow: 'oklch(90% 0.006 260)',
    acceptedText: 'oklch(42% 0.13 155)',
    rejectedText: 'oklch(48% 0.16 40)',
    chipDivBg: 'oklch(95% 0.04 40)',
    chipDivText: 'oklch(45% 0.15 40)',
    chipBg: 'oklch(95% 0.006 260)',
    chipText: 'oklch(42% 0.02 260)',
    markerBg: 'oklch(95% 0.03 265)',
    markerText: 'oklch(38% 0.09 265)',
  }).map(([k, v]) => [k, oklchToHex(v)]),
);
const FALLBACK_PARTY = oklchToHex('oklch(55% 0.01 260)');
const FONT = "'IBM Plex Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const int = (n) => n.toLocaleString('de-DE');
const pct = (n) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const euro = (n) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })}&nbsp;€`;
const day = (iso, opts) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...opts }).format(new Date(`${iso}T00:00:00Z`));
const shortDay = (iso) => day(iso, { day: 'numeric', month: 'short' });
const range = (start, end) => `${shortDay(start)} – ${day(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
const dateTime = (iso) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Fills `{slot}`s; values are already-escaped HTML, the template text itself gets escaped. */
function fill(template, values) {
  return template
    .split(/(\{\w+\})/g)
    .map((part) => {
      const m = part.match(/^\{(\w+)\}$/);
      return m && m[1] in values ? String(values[m[1]]) : esc(part);
    })
    .join('');
}

const link = (href, html, style = '') => `<a href="${esc(href)}" style="color:${C.accent};text-decoration:underline;${style}">${html}</a>`;
const billUrl = (p) => `${SITE_URL}/gesetze/${encodeURIComponent(p.slug)}`;
const billLink = (p) => link(billUrl(p), esc(p.title), 'font-weight:600;');

/** Collects party → hex colour from the colour fields already in the briefing JSON. */
function partyColors(issue) {
  const map = new Map();
  const add = (party, color) => party && color && !map.has(party) && map.set(party, oklchToHex(color));
  for (const r of issue.cohesionAll ?? []) add(r.party, r.color);
  for (const r of issue.absence?.byParty ?? []) add(r.party, r.color);
  for (const p of issue.polls) for (const pb of p.partyBreakdown ?? []) add(pb.party, pb.color);
  return (party) => map.get(party) ?? FALLBACK_PARTY;
}

/**
 * A horizontal bar of coloured segments as a one-row table — the only bar construction that
 * renders the same in Outlook, Gmail and Apple Mail. `segments` are [value, colour]; the rest of
 * `total` is drawn as the empty track.
 */
function bar(segments, total, height) {
  const cells = segments
    .filter(([v]) => v > 0)
    .map(([v, color]) => `<td width="${((v / total) * 100).toFixed(2)}%" style="background:${color};height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td>`);
  const used = segments.reduce((s, [v]) => s + Math.max(0, v), 0);
  if (used < total) cells.push(`<td style="background:${C.track};height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:${Math.min(6, height / 2)}px;overflow:hidden;table-layout:fixed;"><tr>${cells.join('')}</tr></table>`;
}

function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  return d.toISOString().slice(0, 10);
}

// ── sentences (mirror the lead helpers in src/stories/Briefing.tsx) ─────────────────────────

function votesLead(issue, t) {
  const solo = issue.pollCount === 1;
  const out = [];
  if (solo && issue.polls[0]) out.push(fill(t.swVotesOne, { title: billLink(issue.polls[0]) }));
  else if (issue.topics.length > 0) out.push(fill(t.swVotesTopics, { n: issue.pollCount, topics: esc(issue.topics.slice(0, 3).map((x) => x.label).join(', ')) }));
  else out.push(fill(t.swVotes, { n: issue.pollCount }));

  if (issue.divergingTotal === 0) out.push(fill(t.swDivergenceNone, {}));
  else if (issue.divergingTotal === 1)
    out.push(solo || !issue.mostDivergent ? fill(t.swDivergenceSoloOne, {}) : fill(t.swDivergenceOne, { title: billLink(issue.mostDivergent) }));
  else
    out.push(
      solo || !issue.mostDivergent
        ? fill(t.swDivergenceSoloSome, { n: int(issue.divergingTotal) })
        : fill(t.swDivergenceSome, { n: int(issue.divergingTotal), count: int(issue.mostDivergent.divergingCount), title: billLink(issue.mostDivergent) }),
    );
  if (issue.closest) out.push(fill(t.swClosest, { title: billLink(issue.closest), yes: issue.closest.yes, no: issue.closest.no, margin: int(issue.closest.margin) }));
  return out.join(' ');
}

function moneyHeadline(issue, t) {
  if (issue.donations.count === 0) return esc(t.swMoneyNone);
  const d = issue.donations.largest;
  return fill(issue.donations.count === 1 ? t.swMoneyOne : t.swMoneySome, {
    count: issue.donations.count,
    sum: euro(issue.donations.sumEuro),
    amount: euro(d.amountEuro),
    donor: esc(d.donor ?? '—'),
    party: esc(d.party),
  });
}

function moneyLead(issue, t) {
  if (issue.donations.count === 0) return esc(t.swMoneyNone);
  const d = issue.donations.largest;
  let marker = '';
  if (d.largestSince?.allTime) marker = t.swMoneyRecordMarker.replace('{party}', d.largestSince.party);
  else if (d.largestSince && d.largestSince.months != null)
    marker = t.swMoneySinceMarker.replace('{months}', String(d.largestSince.months)).replace('{party}', d.largestSince.party);
  else if (issue.donations.multiPartyDonor)
    marker = t.swMoneyMultiMarker.replace('{donor}', issue.donations.multiPartyDonor.donor).replace('{n}', String(issue.donations.multiPartyDonor.parties.length));
  return moneyHeadline(issue, t) + esc(marker);
}

function cohesionLead(issue, t) {
  if (!issue.cohesion) return esc(t.swBlockCohesionSub);
  const { top, bottom } = issue.cohesion;
  return top.pct === bottom.pct
    ? fill(t.swCohesionAll, { bottomPct: pct(bottom.pct) })
    : fill(t.swCohesion, { topParty: esc(top.party), topPct: pct(top.pct), bottomParty: esc(bottom.party), bottomPct: pct(bottom.pct) });
}

// ── blocks ───────────────────────────────────────────────────────────────────────────────────

const p = (html, style = '') => `<p style="margin:0;font-size:15px;line-height:1.68;color:${C.lead};${style}">${html}</p>`;
const note = (html, style = '') => `<div style="font-size:11.5px;line-height:1.45;color:${C.faint};${style}">${html}</div>`;
const chip = (bg, color, html, weight = 400) =>
  `<span style="display:inline-block;font-size:11.5px;padding:3px 9px;border-radius:10px;background:${bg};color:${color};font-weight:${weight};margin:0 6px 6px 0;">${html}</span>`;
const dot = (color, size = 9) => `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle;margin-right:7px;"></span>`;

function rubrik(n, title, aside = '') {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:40px;border-bottom:2px solid ${C.rule};">
    <tr>
      <td style="padding-bottom:8px;font-size:11.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:${C.ink};"><span style="color:${C.accent};">${n}</span>&nbsp;&nbsp;${esc(title)}</td>
      ${aside ? `<td align="right" style="padding-bottom:8px;font-size:11.5px;color:${C.muted};">${aside}</td>` : ''}
    </tr>
  </table>`;
}

function weekInNumbers(issue, t) {
  const rows = [
    [t.swStatPollsLong, issue.pollCount],
    [t.swStatDivergenceLong, issue.divergingTotal],
    [t.swStatAbsenceLong, issue.absence.total],
    [t.swStatDonationsLong, issue.donations.count],
  ];
  return `
  <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.muted};padding-bottom:8px;border-bottom:1px solid ${C.hair};">${esc(t.swWeekInNumbers)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${rows
      .map(
        ([label, value]) => `
    <tr>
      <td style="padding:11px 12px 11px 0;border-bottom:1px solid ${C.hair};font-size:13px;line-height:1.35;color:${C.lead};">${esc(label)}</td>
      <td align="right" style="padding:11px 0;border-bottom:1px solid ${C.hair};font-size:24px;font-weight:800;letter-spacing:-.02em;color:${C.ink};white-space:nowrap;">${int(value)}</td>
    </tr>`,
      )
      .join('')}
  </table>
  ${issue.generatedAt ? note(fill(t.swAsOf, { date: esc(dateTime(issue.generatedAt)) }), 'padding-top:9px;') : ''}`;
}

function pollRow(poll, index, last, t) {
  const total = Math.max(SEATS, poll.totals.yes + poll.totals.no + poll.totals.abstain + poll.totals.noShow);
  const band = bar(
    [
      [poll.totals.yes, C.yes],
      [poll.totals.no, C.no],
      [poll.totals.abstain, C.abstain],
      [poll.totals.noShow, C.noShow],
    ],
    total,
    12,
  );
  const chips = [
    poll.divergingCount > 0 ? chip(C.chipDivBg, C.chipDivText, fill(t.swPollDivergence, { n: int(poll.divergingCount) }), 600) : '',
    poll.lobbyingOrgCount > 0 ? chip(C.chipBg, C.chipText, fill(t.swPollLobbying, { n: int(poll.lobbyingOrgCount) })) : '',
  ].join('');
  return `
  <tr>
    <td width="42" valign="top" style="padding:22px 0 16px;border-bottom:${last ? `2px solid ${C.rule}` : `1px solid ${C.hair}`};font-size:15px;font-weight:700;color:${C.ordinal};">${String(index).padStart(2, '0')}</td>
    <td valign="top" style="padding:20px 0 16px;border-bottom:${last ? `2px solid ${C.rule}` : `1px solid ${C.hair}`};">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.faint};margin-bottom:5px;">${esc(poll.topic ?? '')}${poll.topic ? ' · ' : ''}${esc(shortDay(poll.date))}</div>
      <a href="${esc(billUrl(poll))}" style="font-size:16px;font-weight:700;line-height:1.3;color:${C.ink};text-decoration:none;">${esc(poll.title)}</a>
      <div style="margin:11px 0 7px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${poll.accepted ? C.acceptedText : C.rejectedText};">${esc(poll.accepted ? t.swAccepted : t.swRejected)}</div>
      ${band}
      <div style="margin-top:8px;font-size:12.5px;color:${C.ink};">
        <b style="font-weight:600;">${int(poll.totals.yes)}</b> ${esc(t.swColYes)}&nbsp;&nbsp;&nbsp;
        <b style="font-weight:600;">${int(poll.totals.no)}</b> ${esc(t.swColNo)}&nbsp;&nbsp;&nbsp;
        <span style="color:${C.muted};"><b style="font-weight:600;">${int(poll.totals.abstain)}</b> ${esc(t.swColAbstain)}&nbsp;&nbsp;&nbsp;
        <b style="font-weight:600;">${int(poll.totals.noShow)}</b> ${esc(t.swColNoShow)}</span>
      </div>
      ${partyLine(poll, t)}
      ${chips ? `<div style="margin-top:12px;">${chips}</div>` : ''}
    </td>
  </tr>`;
}

/**
 * How each fraction voted, as one line of coloured dots — the email's stand-in for the site's
 * expandable "Nach Fraktion" panel (email clients strip anything interactive). Shows each
 * fraction's majority line; Fraktionslos is no fraction and has no line, so it is left out.
 */
function partyLine(poll, t) {
  const LABEL = { yes: [t.swColYes, C.acceptedText], no: [t.swColNo, C.rejectedText], abstain: [t.swColAbstain, C.muted] };
  const rows = (poll.partyBreakdown ?? []).filter((pb) => pb.party !== 'Fraktionslos' && LABEL[pb.majority]);
  if (rows.length === 0) return '';
  const item = (pb) => {
    const [label, color] = LABEL[pb.majority];
    return `<span style="display:inline-block;white-space:nowrap;margin:0 14px 4px 0;">${dot(oklchToHex(pb.color ?? FALLBACK_PARTY), 8)}${esc(pb.party)} <b style="font-weight:700;color:${color};">${esc(label)}</b></span>`;
  };
  return `<div style="margin-top:9px;font-size:12.5px;line-height:1.5;color:${C.ink};">${rows.map(item).join('')}</div>`;
}

function voteLegend(t) {
  const item = (color, label) => `<span style="display:inline-block;width:9px;height:9px;background:${color};vertical-align:middle;margin-right:5px;"></span>${esc(label)}&nbsp;&nbsp;&nbsp;`;
  return item(C.yes, t.swColYes) + item(C.no, t.swColNo) + item(C.abstain, t.swColAbstain) + item(C.noShow, t.swColNoShow);
}

/** Section II — the site draws a lollipop on an axis starting near the lowest value; same axis here as bars. */
function cohesionChart(issue, t, colorOf) {
  const rows = issue.cohesionAll ?? [];
  if (rows.length === 0) return '';
  const pcts = rows.map((r) => r.pct);
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);
  let lo = Math.max(90, Math.floor(min));
  if (lo >= 100) lo = 99;
  const span = 100 - lo;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    ${rows
      .map(
        (r) => `
    <tr>
      <td width="96" style="padding:7px 10px 7px 0;font-size:12.5px;font-weight:600;color:${C.ink};white-space:nowrap;">${dot(colorOf(r.party))}${esc(r.party)}</td>
      <td style="padding:7px 0;">${/* a stub at the axis start, like the site's lollipop dot, so the lowest row never reads as "no data" */ bar([[Math.max(span * 0.025, r.pct - lo), colorOf(r.party)]], span, 10)}</td>
      <td width="64" align="right" style="padding:7px 0 7px 10px;font-size:12.5px;font-weight:600;color:${C.ink};white-space:nowrap;">${pct(r.pct)}&thinsp;%</td>
    </tr>`,
      )
      .join('')}
  </table>
  ${note(fill(t.swCohesionAxisNote, { lo: pct(lo), spread: pct(Math.round((max - min) * 10) / 10) }), 'margin-top:8px;')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
    ${rows
      .map(
        (r) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid ${C.hair};font-size:11.5px;color:${C.muted};">${esc(r.party)}</td>
      <td align="right" style="padding:6px 0;border-bottom:1px solid ${C.hair};font-size:11.5px;color:${C.muted};">${int(r.withMajority)}&thinsp;/&thinsp;${int(r.cast)} ${esc(t.swCohesionRatioLabel)}</td>
    </tr>`,
      )
      .join('')}
  </table>`;
}

function absenceChart(issue, t, colorOf) {
  const rows = issue.absence.byParty ?? [];
  if (rows.length === 0) return '';
  const scaleMax = Math.max(70, ...rows.map((r) => r.noShow));
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    ${rows
      .map(
        (r) => `
    <tr>
      <td style="padding-bottom:5px;border-bottom:1px solid ${C.hair};font-size:12.5px;font-weight:600;color:${C.ink};">${esc(r.party)}</td>
      <td align="right" style="padding-bottom:5px;border-bottom:1px solid ${C.hair};font-size:20px;font-weight:800;color:${C.ink};">${int(r.noShow)}</td>
    </tr>
    <tr><td colspan="2" style="padding:6px 0 16px;">${bar([[r.noShow, colorOf(r.party)]], scaleMax, 14)}</td></tr>`,
      )
      .join('')}
  </table>
  ${note(fill(t.swAbsenceScaleNote, { max: scaleMax }))}`;
}

function donationList(issue, t, colorOf) {
  const all = issue.donations.all ?? [];
  if (all.length === 0) return '';
  const rows = all.slice(0, DONATION_PREVIEW).map((d) => {
    const markers = [];
    if (d.largestSince?.allTime) markers.push(chip(C.markerBg, C.markerText, esc(t.swMarkerRecord.replace('{party}', d.largestSince.party))));
    else if (d.largestSince && d.largestSince.months != null)
      markers.push(chip(C.markerBg, C.markerText, esc(t.swMarkerSince.replace('{months}', String(d.largestSince.months)).replace('{party}', d.largestSince.party))));
    if (d.alsoGivesToParties?.length) markers.push(chip(C.chipBg, C.chipText, esc(t.swAlsoGives.replace('{parties}', d.alsoGivesToParties.join(', ')))));
    const meta = [
      esc(d.donor ?? t.swDonorUnknown),
      d.donorCity ? esc(d.donorCity) : '',
      d.receivedOn && d.publishedOn ? esc(t.swDonationDates.replace('{received}', shortDay(d.receivedOn)).replace('{published}', shortDay(d.publishedOn))) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return `
    <tr>
      <td width="118" valign="top" style="padding:14px 12px 14px 0;border-top:1px solid ${C.hair};font-size:19px;font-weight:800;letter-spacing:-.02em;color:${C.ink};white-space:nowrap;">${euro(d.amountEuro)}</td>
      <td valign="top" style="padding:14px 0;border-top:1px solid ${C.hair};">
        <div style="font-size:14px;font-weight:600;color:${C.ink};">${dot(colorOf(d.fraction), 10)}${esc(d.party)}</div>
        <div style="font-size:12.5px;line-height:1.4;color:${C.muted};margin-top:3px;">${meta}</div>
        ${markers.length ? `<div style="margin-top:7px;">${markers.join('')}</div>` : ''}
      </td>
    </tr>`;
  });
  const more =
    all.length > DONATION_PREVIEW
      ? `<div style="padding-top:12px;">${link(`${SITE_URL}/sitzungswoche/${issue.week}`, `${fill(t.swShowAllDonations, { n: all.length })} →`, 'font-size:12.5px;font-weight:600;text-decoration:none;')}</div>`
      : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">${rows.join('')}</table>${more}`;
}

function jahresstand(issue, t, colorOf) {
  const rows = issue.donationYearToDate ?? [];
  if (rows.length === 0) return '';
  const max = Math.max(...rows.map((r) => r.sumEuro), 1);
  return `
  <div style="margin-top:28px;font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:${C.muted};padding-bottom:9px;border-bottom:2px solid ${C.rule};">${fill(t.swYtdLabel, { year: rows[0].year })}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;">
    ${rows
      .map(
        (r) => `
    <tr>
      <td style="font-size:12.5px;font-weight:600;color:${C.ink};">${esc(r.fraction)}</td>
      <td align="right" style="font-size:12.5px;color:${C.muted};">${euro(r.sumEuro)} · ${int(r.count)}</td>
    </tr>
    <tr><td colspan="2" style="padding:5px 0 14px;">${bar([[r.sumEuro, colorOf(r.fraction)]], max, 8)}</td></tr>`,
      )
      .join('')}
  </table>
  ${note(esc(t.swYtdScaleNote))}`;
}

// ── the email ────────────────────────────────────────────────────────────────────────────────

export function buildEmail(issue, t) {
  const year = issue.dateRange.start.slice(0, 4);
  const briefingUrl = `${SITE_URL}/sitzungswoche/${issue.week}`;
  const colorOf = partyColors(issue);

  const subject = `Sitzungswochen-Briefing KW ${issue.isoWeek}: ${
    issue.pollCount === 1 ? t.swOverviewVotesOne : t.swOverviewVotes.replace('{n}', issue.pollCount)
  }, ${issue.divergingTotal === 0 ? t.swOverviewDivergenceNone : t.swOverviewDivergence.replace('{n}', int(issue.divergingTotal))}`;
  const previewText = range(issue.dateRange.start, issue.dateRange.end);

  const absenceLead = issue.absence.topParty
    ? fill(t.swAbsence, { total: int(issue.absence.total), party: esc(issue.absence.topParty.party), noShow: int(issue.absence.topParty.noShow) })
    : esc(t.swBlockAbsenceSub);
  const donationsAside = issue.donations.count > 0 ? fill(t.swDonationsSummary, { n: issue.donations.count, sum: euro(issue.donations.sumEuro) }) : '';

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid ${C.hair};border-radius:12px;">
<tr><td style="padding:30px 28px 34px;font-family:${FONT};color:${C.ink};font-variant-numeric:tabular-nums;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:15px;font-weight:800;color:${C.ink};">${link(SITE_URL, `<span style="color:${C.accent};">◉</span> Politblick`, `color:${C.ink};text-decoration:none;`)}</td>
      <td align="right" style="font-size:13px;">${link(`${SITE_URL}/abstimmungen`, `${esc(t.swSeeMore)} →`, 'font-weight:700;text-decoration:none;')}</td>
    </tr>
  </table>

  <div style="margin:22px 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};">${esc(t.swSectionTitle)} · ${fill(t.swMastheadTemplate, { number: issue.number, week: issue.isoWeek, year })}</div>
  <h1 style="margin:0 0 22px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:${C.ink};">${esc(range(issue.dateRange.start, issue.dateRange.end))}</h1>

  ${p(votesLead(issue, t), 'font-size:14.5px;line-height:1.7;margin-bottom:14px;')}
  ${p(moneyHeadline(issue, t), 'font-size:14.5px;line-height:1.7;')}

  <div style="margin-top:26px;padding:16px 18px 14px;background:${C.page};border-radius:10px;">${weekInNumbers(issue, t)}</div>

  ${rubrik('I', t.swBlockVotes, voteLegend(t))}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${issue.polls.map((poll, i) => pollRow(poll, i + 1, i === issue.polls.length - 1, t)).join('')}
  </table>

  ${issue.cohesionAll?.length ? `${rubrik('II', t.swBlockCohesion)}<div style="margin-top:14px;">${p(cohesionLead(issue, t))}</div>${cohesionChart(issue, t, colorOf)}` : ''}

  ${issue.absence.total > 0 ? `${rubrik('III', t.swBlockAbsence)}<div style="margin-top:14px;">${p(absenceLead)}</div>${note(esc(t.swAbsenceExplain), 'margin-top:8px;')}${absenceChart(issue, t, colorOf)}` : ''}

  ${rubrik('IV', t.swBlockMoney, donationsAside)}
  <div style="margin-top:14px;">${p(moneyLead(issue, t))}</div>
  ${donationList(issue, t, colorOf)}
  ${jahresstand(issue, t, colorOf)}

  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:34px;">
    <tr><td style="background:${C.accent};border-radius:8px;">
      <a href="${esc(briefingUrl)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Vollständiges Briefing auf politblick.de →</a>
    </td></tr>
  </table>
  ${note('Jede Zahl stammt aus öffentlichen Quellen (abgeordnetenwatch.de, Bundestag) und ist auf politblick.de mit der Quelle verlinkt.', 'margin-top:14px;font-size:12px;')}

</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
<tr><td style="padding:18px 28px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};text-align:center;">
  Du bekommst diese Mail, weil du dich auf politblick.de für das Sitzungswochen-Briefing angemeldet hast.<br>
  <a href="{{ unsubscribe }}" style="color:${C.muted};">Abmelden</a> · ${link(`${SITE_URL}/datenschutz`, 'Datenschutz', `color:${C.muted};`)} · ${link(`${SITE_URL}/impressum`, 'Impressum', `color:${C.muted};`)}<br>
  ${esc(POSTAL_ADDRESS)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, previewText, html, name: `Sitzungswochen-Briefing ${issue.week}` };
}

// ── Brevo API ────────────────────────────────────────────────────────────────────────────────

async function brevo(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Brevo ${method} ${endpoint} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function findCampaign(name) {
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await brevo('GET', `/emailCampaigns?limit=100&offset=${offset}&sort=desc&excludeHtmlContent=true`);
    const campaigns = page?.campaigns ?? [];
    const hit = campaigns.find((c) => c.name === name);
    if (hit) return hit;
    if (campaigns.length < 100) return null;
  }
  return null;
}

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment variable(s): ${missing.join(', ')}`);
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { mode: process.env.NEWSLETTER_MODE || 'preview', week: process.env.NEWSLETTER_WEEK || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') args.mode = argv[++i];
    else if (argv[i] === '--week') args.week = argv[++i];
  }
  if (!['preview', 'test', 'send'].includes(args.mode)) throw new Error(`Unknown mode "${args.mode}" (preview | test | send)`);
  if (args.week && !/^\d{4}-\d{2}-\d{2}$/.test(args.week)) throw new Error(`--week must be a Monday as YYYY-MM-DD, got "${args.week}"`);
  return args;
}

async function main() {
  const { mode, week: weekArg } = parseArgs(process.argv.slice(2));
  const week = weekArg ?? mondayOf(new Date());

  const index = await readJsonFile('stories.json', null);
  if (!index?.issues?.some((i) => i.week === week)) {
    console.log(`No Sitzungswochen-Briefing for the week of ${week} — no sitting week, nothing to send.`);
    return;
  }
  const issue = await readJsonFile(`stories/${week}.json`, null);
  const { TRANSLATIONS } = await import(pathToFileURL(path.resolve('src', 'data.ts')).href);
  const email = buildEmail(issue, TRANSLATIONS.de);
  console.log(`Week ${week} (KW ${issue.isoWeek}) — subject: ${email.subject}`);

  if (mode === 'preview') {
    await writeFile(PREVIEW_FILE, email.html);
    console.log(`Preview written to ${PREVIEW_FILE}`);
    return;
  }

  requireEnv('BREVO_API_KEY', 'BREVO_LIST_ID');
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!Number.isInteger(listId) || listId <= 0) throw new Error(`BREVO_LIST_ID must be a number, got "${process.env.BREVO_LIST_ID}"`);

  const campaign = {
    name: email.name,
    subject: email.subject,
    previewText: email.previewText,
    sender: SENDER,
    replyTo: REPLY_TO,
    htmlContent: email.html,
    recipients: { listIds: [listId] },
  };

  const existing = await findCampaign(email.name);
  if (existing && existing.status !== 'draft') {
    console.log(`Campaign "${email.name}" already exists with status "${existing.status}" — not touching it.`);
    return;
  }

  let id;
  if (existing) {
    id = existing.id;
    await brevo('PUT', `/emailCampaigns/${id}`, campaign);
    console.log(`Updated draft campaign #${id}.`);
  } else {
    id = (await brevo('POST', '/emailCampaigns', campaign)).id;
    console.log(`Created draft campaign #${id}.`);
  }

  if (mode === 'test') {
    const to = (process.env.NEWSLETTER_TEST_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (to.length) {
      await brevo('POST', `/emailCampaigns/${id}/sendTest`, { emailTo: to });
      console.log(`Test email sent. The campaign stays a draft.`);
    } else {
      console.log('Draft only (no NEWSLETTER_TEST_EMAIL set). Nothing was sent.');
    }
    return;
  }

  await brevo('POST', `/emailCampaigns/${id}/sendNow`);
  console.log(`Campaign #${id} sent to list ${listId}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
