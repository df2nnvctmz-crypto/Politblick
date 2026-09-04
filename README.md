# Politblick

## Data pipeline

There is no backend. Every dataset is fetched on a schedule by GitHub Actions, committed to
this repo, and served as static JSON — so visitor traffic never reaches the upstream APIs.

| Script | Source | Writes | Schedule |
| --- | --- | --- | --- |
| `fetch-core.mjs` | abgeordnetenwatch | `public/data/roster,polls,poll-results.json` | every 4 h |
| `fetch-sidejobs.mjs` | abgeordnetenwatch | `public/data/sidejobs.json` | daily |
| `fetch-lobbyregister.mjs` | Lobbyregister API v2 | `data/lobby-register.json` | weekly |
| `fetch-parteispenden.mjs` | bundestag.de (HTML) | `public/data/party-donations.json` | daily |
| `fetch-committees.mjs` | abgeordnetenwatch | `public/data/committees.json` | weekly |
| `fetch-history.mjs` | abgeordnetenwatch | `public/data/vote-history.json` | manual (`workflow_dispatch`) |
| `build-vote-history-summary.mjs` | *(no network)* | `public/data/vote-history-summary.json` | same job as `fetch-history` |
| `verify-vote-history-summary.mjs` | *(no network)* | *(checks only)* | that job **and** every deploy |
| `build-lobby-links.mjs` | *(no network)* | `public/data/lobby-links.json` | after every fetch |

`data/` is **not** served — it holds the ~5 MB register snapshot that only the derive step
reads. Only `public/data/` reaches the browser.

### The vote archive, and why it is not on a schedule

`fetch-history.mjs` backfills *closed* legislature periods — currently 132 (2021-2025) and 111
(2017-2021). Closed periods are immutable, so it runs once by hand, the result is committed,
and the every-4h `fetch-core.mjs` keeps touching only the current term forever after. Adding an
older term (97, 83, 67 — back to 2005) is a one-line change to `HISTORY_PERIOD_IDS`.

The point of it is base rates. A single overlap between a member's declared role and a vote is
noise; the same member breaking with their fraction on the fourth energy bill in eight years is
a pattern, and only an archive can tell those apart. Nothing about the *claims* the site makes
changes — it is the same declarations, measured against more votes.

`vote-history.json` is not shaped like `poll-results.json`. That format repeats each member's
name and party inside every vote row, which costs 2.9 MB for 63 polls and would cost ~17 MB for
338. Instead each archived poll carries two strings aligned to that period's member index: one
character per member for the vote, one for the fraction they held **on the day of that vote**.
The second string is not redundant with the member's roster party — members change fraction
mid-term, and "voted against their own fraction" is only meaningful against the fraction they
actually sat in at the time.

Vote rows are deduplicated per mandate first (`dedupeVotesByMandate`), because abgeordnetenwatch
sometimes returns several rows for the same member on the same poll — six identical "no" rows for
one member on poll 4119, and occasionally contradictory ones (one "yes" *and* one "no"). They
cluster around members who left their fraction mid-term. This matters beyond the duplicated member:
counting every row inflates that whole fraction's tally, and on a close vote that can move its
majority line, which is what "voted against their own fraction" is measured against for *every*
member of the fraction. A cast vote beats a `no_show`; two different cast votes are unresolvable,
so that mandate is dropped from that poll rather than guessed at.

Alongside them each archived poll stores the same `partyBreakdown` (with its `majority`) that
`computePollResult` writes into `poll-results.json`, produced by the same exported `majorityOf`.
That is what lets `src/voteHistory.ts` rebuild an ordinary `PollResult` from an archived poll and
call `computeMemberAlignment()` **unchanged** — so a vote from 2019 and a vote from last week are
judged by one definition of "against their own fraction", not two that can drift apart. The
frontend never re-derives a majority line of its own.

`vote-history.json` is deliberately *not* part of `useSnapshot()`. It is ~1.3 MB and only a member
profile needs it, whereas the snapshot blocks the first paint of every page — so it is fetched on
first use and cached for the session, and a visitor who never opens a profile never pays for it.

The landing page needs one line of that context per member, and pulling 2.6 MB into the first page
every visitor sees — most of whom never scroll that far — would be a real regression for a single
sentence. So `build-vote-history-summary.mjs` derives `vote-history-summary.json`: per-politician
aggregates only, **15 KB gzipped**, small enough to sit in the blocking snapshot. It carries no
per-vote detail, so profiles still read the full archive.

That summary necessarily restates the alignment rule `computeMemberAlignment()` owns, because one
runs in Node at build time and the other in the browser. Two implementations of a rule that decides
whether a named person "voted against their party" will drift eventually, and the failure is silent
— a wrong percentage looks exactly like a right one. `verify-vote-history-summary.mjs` therefore
rebuilds every fraction's majority from the raw vote strings, sharing no code with either side, and
exits non-zero on any disagreement.

It is wired in twice so that is not left to memory. `fetch-history.yml` (manual only — closed terms
are immutable, so a schedule would spend ~600 requests reproducing a byte-identical file) fetches,
rebuilds the summary and verifies in one job, committing nothing if the check fails. And every
deploy runs it before `npm run build`, so a stale summary blocks the release rather than publishing
wrong loyalty percentages about named people. It catches four cases: a mismatched number, a summary
missing while the archive is present, a summary built from a *different* archive than the committed
one (the summary carries the archive's own `generatedAt` for exactly this), and — exiting 0 — a
checkout with no archive at all, so a data-less clone still builds.

That timestamp inheritance is also why the builder is a pure function of its input: rebuilding it
produces byte-identical output, so the check can run anywhere without creating spurious diffs.

The profile shows it as a "Langzeit-Bilanz": the member's divergence count over every archived
vote, **next to their own fraction's average on those same votes**. The comparison is the point.
97% loyalty reads as independent beside a fraction at 99% and as unremarkable beside one at 95%,
and only the second number tells you which.

**The archive holds only *completed* terms — 2005-09-18 to 2025-03-24.** The current term is not in
it, and is not in any long-run figure. That boundary is easy to lose sight of, because a member's
long-run loyalty is rendered directly above a list of their current-term votes which it does not
count; every such figure therefore carries the range (`2005–2025`) rather than an open-ended
"seit 2005", which read as "through today". Adding the current term would mean re-running
`fetch-history.mjs` on every core refresh instead of once, so the split is deliberate — but if the
two are ever merged, the labels are the thing to fix first.

63% of current members have an earlier mandate on
file; for the rest the section says so plainly rather than showing a misleading zero.

`data/topic-merge-map.json` reconciles the topic vocabulary across terms: the 2017-2021
Bundestag used 39 topic labels where the current one uses 23. It maps only genuine *renamings*
(`Naturschutz` → `Umwelt`). Where a retired label was **split** across several current ones —
`Innere Angelegenheiten` is now three separate labels — it is deliberately left unmapped, since
guessing which half a vote belonged to would file real votes under a topic they were never
about. The script validates every mapping target against the live current vocabulary and fails
loudly rather than emitting a topic key that matches nothing.

### Why fetch and derive are separate

`build-lobby-links.mjs` makes no network calls. The matching rules (name normalisation, which
declared ties count, how a curated stance applies) are the part that changes most often, so
iterating on them is `node scripts/build-lobby-links.mjs` against committed inputs — two
seconds, and a reviewable diff — rather than a fresh 140-request crawl.

### How the lobby join works

The Lobbyregister records which Bundestag *Drucksache* each organisation lobbies on. Poll
records from abgeordnetenwatch link to their Drucksachen in `field_intro`. Normalising both to
`21/5921` form joins the two, connecting an organisation to a specific roll-call vote — and via
the vote record, to how each member voted.

Members are connected to organisations through their own declared outside roles
(`sidejobs.json`), matched on exact normalised organisation name. Exact rather than fuzzy is
deliberate: a false positive attaches a lobbying tie to the wrong person.

A weaker second tier — "same policy area", `topicalTies` in the output — catches ties where the
organisation never cited the specific Drucksache: a member's org lists a *specific* field of
interest (never a generic one — see `data/lobby-topic-map.json`'s own guardrails) that matches
the poll's topic. Matching uses **every** topic a poll carries, not just the first: 71% of polls
are tagged with more than one, and six labels (Verkehr, Wirtschaft, Staat und Verwaltung, Soziale
Sicherung, Innere Sicherheit, Wissenschaft) never appear first at all. Keying off the first alone
meant a bill tagged `["Wirtschaft", "Energie"]` was tested only against the (unmapped) Wirtschaft
fields and produced no energy ties at all — and no committee boost for the members actually
sitting on the energy committee. `poll.topic` remains the primary label for display;
`poll.topics` is what anything matching on topic must use.

Matching on every topic also makes the *topic map* carry more weight, which exposed a second
problem: a topic can be non-discriminating even when its fields are perfectly specific.
`Öffentliche Finanzen, Steuern und Abgaben` sits on 25% of polls but is the primary topic of
almost none of them, so it tied every registered bank to every budget-adjacent bill — including
the Chancellery's own budget. It is now unmapped, and the map's `_readme` records why. Committee membership (`committees.json`) can promote a topical tie: if the
member also sits on the Bundestag committee actually responsible for that topic — a fact that
comes for free from abgeordnetenwatch's own data, since committees carry the same topic
vocabulary as polls — that's flagged as `onRelevantCommittee`, a materially stronger, still
non-document signal. Never conflate either tier with a declared-Drucksache conflict in the UI.

`partyLobbySummary` and the organisation-centric lookups (`useOrgList`/`useOrgDetail` in
`src/lobby.ts`) are pure re-views of the same joined data from a different angle — no new
fetching, just aggregating `affiliations` by party or by organisation instead of by member.

### What this data cannot show

Germany publishes **no register of meetings between lobbyists and MPs**. Nothing here is a
recorded contact — it is organisations' and members' own declarations.

The register also never records whether an organisation was *for* or *against* a bill. That
direction is therefore never inferred. `data/lobby-positions.json` is a hand-curated,
source-linked file, and it is the only thing that can make the site claim someone "voted
against this organisation's position". Where no curated stance exists, the organisation's own
wording is shown and no direction is asserted.

### API key

`fetch-lobbyregister.mjs` needs a Lobbyregister API key. It tries, in order: the `LOBBY_API_KEY`
secret, a built-in copy of the shared key the Bundestag publishes openly, and finally the key
re-scraped from the open-data page (which self-heals a rotation). Each candidate is probed
before use. Set `LOBBY_API_KEY` to an individual key — request one from
`lobbyregister@bundestag.de` — to stop depending on the shared one.
