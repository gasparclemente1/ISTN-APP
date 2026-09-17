# ISTN-SJ / ELIAS — Codex Input Pack

This package contains the product context, requirements, UX flows, information architecture, live system, church source data and supplied visual assets for the ISTN-SJ / ELIAS mobile-first web app.

## Product direction
The app is centered on Profeta Elias / Apóstolo Marcelino Mário Bento, with ISTN-SJ as the institutional and local-community layer.

It should organize existing ministry content and connect users to live meetings and ISTN congregations. It should NOT attempt to replace YouTube, Zoom, WhatsApp, Telegram, Facebook or TikTok in the MVP.

## Important data rule
The church JSON files are source records supplied through operational announcements. They are intentionally marked `needs_review`. Do not silently correct, merge or invent data. Build the admin workflow so the church team can verify and edit records.

## Read order for Codex
1. product/istn-context.md
2. product/data-model.md
3. product/product-vision.md
4. product/product-requirements.md
5. product/user-flows.md
6. product/information-architecture.md
7. product/admin-panel.md
8. live/live-system.md
9. data/data-validation.md
10. design/design-principles.md
11. data/*.json
12. design/assets/*

## Visual assets
The supplied ISTN-SJ logo and ministry artworks are included under design/assets.

## Current implementation

A mobile-first web app (installable PWA) with no build step and no runtime
dependencies: plain ES modules in `src/`, a small Node server in `server.mjs`
and `lib/`, and Supabase for data, accounts and photographs.

- **Início** — next meeting with a live countdown, "A minha ISTN", latest
  YouTube videos, the ministry's channels.
- **Ensinos** — 379 recorded messages, searchable without accents, filtered by
  type, year, biblical book (in canonical order) and saved items; each opens on
  YouTube at the minute the message starts, when known.
- **Anúncios** — announcements from the team, highlighted or not, with images,
  reactions from any account and comments from verified servants; who may
  publish is a right the central team grants in the panel.
- **Ao vivo** — next meeting, Zoom link with copyable ID and passcode, the week
  ahead, monthly and yearly meetings, a calendar feed (`/calendario.ics`) that
  follows the team's edits, and the latest recordings.
- **Igrejas** — the directory from the database, by country and region, with
  service times, address and directions, servants, WhatsApp and group links.
- **Perfil** — preferences kept on the device for everyone; an optional account
  carries them across devices and lets servants ask for verification.
- **/admin** — meetings, directory (place type, service times, photos),
  servants, verification claims and the change history, with central and local
  editor roles enforced by row level security.

Every page has its own address (`/ensinos`, `/ao-vivo`, `/igrejas/<id>`,
`/perfil`), so links can be shared and the back button works.

The server only serves the files the app loads, sends a strict
Content-Security-Policy, and reads meetings and the directory from Supabase
with the publishable key (`/api/meetings`, `/api/directory`). The directory
falls back to `data/` when the database cannot be reached; meetings do not,
because an old Zoom link is worse than none.

## Run locally

Requires Node.js 17+ (Render uses 20). No install step.

```bash
cp .env.example .env    # optional: Supabase settings
npm run dev             # http://localhost:4173
npm run check           # syntax of every module
npm test                # unit tests, no dependencies
npm run test:db         # schema + migrations + permissions on a throwaway PostgreSQL 14+
npm run report:editorial  # rewrites data/revisao-editorial.md
```

Without Supabase settings the app still starts: the directory is read from
`data/`, and meetings and accounts say they are unavailable.

## Deploying

See [DEPLOY.md](DEPLOY.md) — Supabase setup, Render environment, the order for
migrations, and post-deploy checks — and
[qa/checklist-dispositivos.md](qa/checklist-dispositivos.md) for testing on
real phones.

## Known limitations

- The church records remain unverified until the team confirms them in the
  panel; nothing is deduplicated or corrected automatically. What to check is
  listed in [data/revisao-editorial.md](data/revisao-editorial.md).
- The teaching library is a JSON file updated by
  `scripts/import_youtube_library.py`, not edited in the panel.
- The latest videos are read from the public YouTube channel pages, which
  YouTube may change or throttle; the app then links to the channels instead.
- Reminders are calendar events, not push notifications.
