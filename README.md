# sanity-plugin-link-checker

Scans a dataset for two classes of broken links and shows them in a Studio tool:

- **Dangling internal references** — reference fields (`{_type: 'reference', _ref}`) pointing at a document that no longer exists (checked against both published and draft).
- **Broken external links** — `href` values found on Portable Text link annotations, checked over HTTP.

## Installation

```sh
npm install sanity-plugin-link-checker
```

## Usage

Add it as a plugin in `sanity.config.ts` (or .js):

```ts
import {defineConfig} from 'sanity'
import {linkChecker} from 'sanity-plugin-link-checker'

export default defineConfig({
  //...
  plugins: [linkChecker()],
})
```

This adds a "Link Checker" tool to the Studio's sidebar with a "Run scan" button. Click it and results appear in the tool. Results are stored in the dataset as a single, always-overwritten document (`_id: 'link-checker-report'`, `_type: 'linkCheckerReport'`) — not registered as a schema type, so it won't show up in your content lists, and it's exactly one document regardless of how many times you scan. Every environment (local Studio, deployed Studio, teammates) reads that same document, so a scan run anywhere shows up everywhere with no manual step. It's also cached in the browser (per project + dataset) for a fast first paint.

For the "Run scan" button to return **accurate** external-link results, deploy the Document Function described next — that's the intended setup. Without it, external links checked straight from the browser mostly come back `unverifiable` (see [The CORS limitation](#the-cors-limitation)).

## The Document Function (the primary setup — do this once)

Clicking "Run scan" writes a small trigger document (`linkCheckerTrigger`) alongside the report. Deploy a [Sanity Document Function](https://www.sanity.io/docs/functions/functions-introduction) that reacts to it and the button becomes fully server-side: each click runs an accurate rescan in Node (no CORS, real status codes) and the results replace the browser-run ones within a few seconds, live — no reload, no CLI to remember. Set it up once and every teammate's button "just works" from then on.

```sh
npx sanity-plugin-link-checker init-function
```

This scaffolds the function code (pre-wired to this package's scanning logic) and prints the exact 1–2 commands left to run (adding the resource to your `sanity.blueprint.ts`, then `npx sanity blueprints deploy`). It can't run the deploy itself — that needs one authenticated action with your Sanity org's permissions — but it collapses "read the docs and hand-write two files" into one command plus a couple of copy-pasted lines.

Functions run on Sanity's included free tier for typical link-checking volumes (20K GB-seconds + 500K invocations/month, included on all plans).

## The CORS limitation

Worth understanding *why* the Function matters. External link checking is a `fetch` against each URL. A browser can only read the real HTTP status of a **cross-origin** request if the target server sends CORS headers back — most ordinary websites don't, since they have no reason to let arbitrary pages read their responses. Without those headers the request either throws a network error or resolves as unreadable, whether the URL is a healthy page or a real 404.

So external checks run straight from the Studio browser tab land on `unverifiable` (or `timeout`) rather than a clean `ok`/`broken`. This isn't a bug — it's what the browser allows. Node has no such restriction, which is exactly why the Function (and the CLI below) get real status codes.

## Fallback: the CLI (no-Function setups and CI)

If you can't or don't want to deploy the Function, the same accurate Node-side scan is available as a one-shot CLI — run it manually, on a cron, or as a CI step. It writes the same report document the Studio tool reads, so results still show up in the tool.

```sh
npx sanity-plugin-link-checker \
  --project-id yourProjectId \
  --dataset production \
  --token $SANITY_AUTH_TOKEN
```

`--token` needs **write** access (e.g. an Editor-role API token), since it upserts the report document. `--project-id` and `--dataset` also read from `SANITY_STUDIO_PROJECT_ID` / `SANITY_STUDIO_DATASET` env vars if you already have those set, as most Studio projects do.

Use `--fail-on-findings` to make a CI job exit non-zero when broken links/references are found, and `--out <path>` for a local JSON copy in CI logs:

```sh
npx sanity-plugin-link-checker --token $SANITY_AUTH_TOKEN --fail-on-findings --out report.json
```

Run `npx sanity-plugin-link-checker --help` for all options (`--concurrency`, `--timeout`, `--api-version`).

### Headless scanning logic

The Function, the CLI, and the Studio plugin all share the same scanning code, exported React-free from `sanity-plugin-link-checker/core` (`runScan`, `writeReport`, `readReport`, `writeTrigger`) for use in your own scripts or Functions.

## Alternative: live in-Studio checks via a proxy

If you'd rather click "Run scan" in Studio and get accurate external-link results immediately (no separate CLI step), you can point the plugin at a server-side proxy instead — same idea as the CLI (move the fetch off the browser), but as a live endpoint instead of a one-shot script:

```ts
linkChecker({
  checkUrl: async (url) => {
    const res = await fetch(
      `https://your-proxy.example.com/api/check-link?url=${encodeURIComponent(url)}`,
      {headers: {'x-proxy-secret': process.env.SANITY_STUDIO_LINK_PROXY_SECRET ?? ''}},
    )
    return res.json() // {status: 'ok' | 'broken' | 'unverifiable', httpStatus?, reason?}
  },
})
```

A ready-to-deploy example proxy (Vercel-shaped Node function, with SSRF guardrails — blocks loopback/private/link-local hosts and supports an optional shared secret) lives in [`examples/link-check-proxy`](./examples/link-check-proxy). This requires you to host something, unlike the CLI.

## Config options

```ts
linkChecker({
  concurrency: 4, // max concurrent external URL checks
  timeoutMs: 8000, // per-request timeout
  apiVersion: '2024-01-01', // Sanity client API version
  checkUrl: async (url) => ({status: 'ok'}), // optional override, see above
})
```

## License

[MIT](LICENSE) © Kodamera

## Develop & test

This plugin uses [@sanity/plugin-kit](https://github.com/sanity-io/plugin-kit)
with default configuration for build & watch scripts.

See [Testing a plugin in Sanity Studio](https://github.com/sanity-io/plugin-kit#testing-a-plugin-in-sanity-studio)
on how to run this plugin with hotreload in the studio.
