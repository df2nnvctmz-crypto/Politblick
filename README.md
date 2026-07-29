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
| `build-lobby-links.mjs` | *(no network)* | `public/data/lobby-links.json` | after every fetch |

`data/` is **not** served — it holds the ~5 MB register snapshot that only the derive step
reads. Only `public/data/` reaches the browser.

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

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
