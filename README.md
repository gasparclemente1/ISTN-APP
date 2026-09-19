# ISTN-SJ — Igreja Salvação de Todas as Nações · Sol da Justiça

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

- **Início** — "Bem-vindo à ISTN-SJ" with the Profeta Elias, open-armed; the
  live of the day above him (on air now, or when the next one starts), "A minha
  ISTN", latest YouTube videos, the YouTube channels.
- **Ensinos** — 379 recorded messages, searchable without accents, filtered by
  type, year, biblical book (in canonical order) and saved items; each opens on
  YouTube at the minute the message starts, when known.
- **Anúncios** — announcements from the team, highlighted or not, with images,
  reactions from any account and comments from verified servants; who may
  publish is a right the central team grants in the panel. Each can be shared
  (WhatsApp or the phone's own share), and a YouTube link in the text shows as
  the video's picture — videos are shared as links, never uploaded.
- **Ao vivo** — the live going on (until 06:00 in Luanda: lives run past
  midnight) or the next one, Zoom link with copyable ID and passcode, the week
  ahead, monthly and yearly meetings, a calendar feed (`/calendario.ics`) that
  follows the team's edits, and the latest recordings.
- **Igrejas** — the Profeta Elias and his word about the nations; a map of the
  ISTN-SJ in the world; the world seat in front and each country's seat first,
  with a seal; every place with all its days of service (today's marked, in
  the place's own time), address and directions, the people responsible,
  WhatsApp and group links; filters by country, region and day of service.
- **Perfil** — preferences kept on the device for everyone; an optional account
  carries them across devices and lets servants ask for verification.
- **/admin** — meetings, directory (place type, service times, photos),
  servants, verification claims and the change history, with central and local
  editor roles enforced by row level security.

Every page has its own address (`/ensinos`, `/ao-vivo`, `/igrejas/<id>`,
`/perfil`), so links can be shared and the back button works. A link shared on
WhatsApp shows the church's name, days and address, or the announcement's
title and text (`lib/link-preview.mjs`).

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

The directory comes from the team's general list of services (an Excel file,
one row per service):

```bash
python3 scripts/import_churches.py lista.xlsx --migracao supabase/migrations/AAAAMMDDHHMMSS_diretorio.sql
```

Other scripts: `scripts/build_world_map.py` (the dots of the map),
`scripts/build_share_image.py` (the picture under a shared link),
`scripts/recortar_sujeito.js` (cuts a person out of a photograph, on a Mac) and
`scripts/optimize_images.py` (web-sized WebP, keeping a cut-out transparent).

Without Supabase settings the app still starts: the directory is read from
`data/`, and meetings and accounts say they are unavailable.

## Deploying

See [DEPLOY.md](DEPLOY.md) — Supabase setup, Render environment, the order for
migrations, and post-deploy checks — and
[qa/checklist-dispositivos.md](qa/checklist-dispositivos.md) for testing on
real phones.

## Known limitations

- The church records come from the team's list and remain "a confirmar" until
  the team confirms each with its church in the panel. What the import decided
  is in [data/importacao-igrejas.md](data/importacao-igrejas.md); what to check
  is in [data/revisao-editorial.md](data/revisao-editorial.md). The national
  seats are a proposal until the team confirms them.
- The teaching library is a JSON file updated by
  `scripts/import_youtube_library.py`, not edited in the panel.
- The latest videos are read from the public YouTube channel pages, which
  YouTube may change or throttle; the app then links to the channels instead.
- Reminders are calendar events, not push notifications.
