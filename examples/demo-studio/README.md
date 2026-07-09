# Link Checker demo studio

A standalone studio (project `csst5o08`, org Kodamera) seeded with fictional content that
exercises every finding kind the plugin can show - used for README/Exchange screenshots and
for developing the plugin against something realistic but shareable.

```sh
npm install
SANITY_AUTH_TOKEN=<write token> npm run seed   # once, or to reset content
npm run dev                                    # studio at http://localhost:3333
```

The seed data (all invented companies/people) produces: 404s, 5xx responses, dead domains,
a bot-blocked LinkedIn URL, the same broken URL in several places, multi-link documents
(Details dialog), dangling references, a draft-only document, and a published document with
draft edits.

Nothing here is published to npm (`examples/` is outside the package `files` list).
