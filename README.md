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

The repository now includes a mobile-first public MVP slice for **ELIAS — ISTN-SJ**:

- Home with featured source, next meeting and ISTN discovery entry point.
- Teaching library with search, type filters and source-detail views.
- Automatic latest-video rows from the public YouTube feeds for the weekend-service and recorded-Zoom channels.
- Live schedule with local-time context, explicit unconfigured Zoom state and YouTube discovery link.
- ISTN directory backed by the supplied operational JSON, including contact actions and the required “A confirmar” state.
- Optional-profile and preferences UX, without mandatory account creation.

This is intentionally an orchestration layer: it sends people to the existing content platforms rather than hosting video or creating a social network.

## Run locally

Requires Node.js 17+ (Node 18+ recommended). No dependency install is needed.

```bash
npm run check
npm run dev
```

Open `http://localhost:4173`.

## Configuration and integrations

There are no required environment variables or YouTube API key for this frontend slice. `PORT` may be set to use another local port. The local server reads the public YouTube Atom/RSS feeds through `/api/latest-videos`, caches each channel for 10 minutes and displays the six most recent entries. The operational live configuration and external source URLs are separated in `src/data.js` as a temporary frontend adapter; a production backend/admin should replace that adapter.

Still needing real operational configuration:

- authenticated admin and role-based local editors;
- a backend for editable events, Zoom destination, content metadata and audit log;
- push/reminder infrastructure;
- editorial verification of teaching metadata and all source-record contacts/schedules.

## Known limitations

- The provided church data remains unverified and is deliberately not deduplicated or corrected.
- No Zoom URL is configured, so the join control accurately stays unavailable.
- The supplied YouTube channels are linked as external sources: Saturday/Sunday services at `@apostolomarcelino/streams` and recorded Zoom lives at `@LorenaLopes56/videos`.
