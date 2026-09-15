# CODEX MASTER PROMPT — ISTN-SJ / ELIAS WEB APP

Build a polished, mobile-first web app/PWA for the ISTN-SJ / ELIAS project using this repository as the source of truth.

## READ FIRST
Read all of:
- README.md
- product/product-vision.md
- product/product-requirements.md
- product/user-flows.md
- product/information-architecture.md
- product/admin-panel.md
- live/live-system.md
- data/data-validation.md
- design/design-principles.md
- research/source-inventory.md
- data/*.json
- design/assets/*

Do not invent a generic church app.

## PRODUCT
The experience is centered on Profeta Elias / Apóstolo Marcelino Mário Bento.
ISTN-SJ (Igreja Salvação de Todas as Nações - Sol da Justiça) is the institutional and local-community layer.

Core promise:
"Um só lugar para acompanhar os ensinos do Profeta Elias, saber quando há reuniões e encontrar a sua ISTN."

Core loop:
Profeta Elias → conteúdo → próxima reunião → acompanhamento → ISTN global → congregação/local community.

## MVP NAVIGATION
Mobile bottom navigation:
1. Início
2. Ensinos
3. Ao vivo
4. Igrejas
5. Perfil

Home priority:
1. featured ministry content
2. next live/reunion
3. latest teachings
4. theme exploration
5. find my ISTN

## UX REQUIREMENTS
- Public content works without mandatory signup.
- A new visitor understands immediately that the app is centered on Profeta Elias and ISTN-SJ.
- Users can search/browse teachings immediately.
- Users can see the next meeting immediately.
- Users can find a physical or online ISTN community.
- Personalization is optional.
- Mobile-first and responsive.
- Good behavior on slow/limited connections.
- No video autoplay.
- Strong loading, empty and error states.
- Accessible typography and tap targets.
- Show times in the appropriate local timezone.

## TEACHINGS
Support:
- title
- original title
- speaker
- publication date
- content type
- themes
- biblical references
- series
- source platform
- source URL
- thumbnail
- duration
- transcript
- editorial summary
- verification status

Use only supplied/verified information. Do not fabricate biblical references, quotes, summaries or statements attributed to the ministry.

## VIDEO STRATEGY
Do not build proprietary video hosting or livestreaming in the MVP.
Use existing platforms where technically/legal appropriate:
- YouTube
- Zoom
- TikTok
- Facebook

The app is the discovery/organization layer.

## LIVE
The project owner states that Profeta Elias generally has daily Zoom meetings around 21:00 and that recordings are later published on YouTube. Treat this as configurable operational data, not a hard-coded constant.

Build:
- upcoming live
- live now
- countdown
- event detail
- enter meeting CTA
- configurable Zoom URL
- optional YouTube/TikTok links
- ended state
- recording pending
- recording available

Admin must be able to change time, timezone, Zoom link, destination links, cancellation/rescheduling and recording association.

## CHURCH DIRECTORY
Architecture:
Country → region/state/province → city/locality → congregation or online community.

Each record supports:
- name
- country
- region
- city/locality
- physical/online/hybrid modality
- address (optional)
- coordinates (optional)
- responsible leader
- role
- phone
- WhatsApp
- service schedules
- verification status
- source note
- last verified date

The JSON records are operational source records and are NOT automatically verified master data.
Do not silently merge duplicate-looking entries.
Do not infer an address or physical presence.
Do not silently correct names/phone numbers.

## ADMIN
Protected admin area:
- teachings
- metadata
- featured content
- live events
- Zoom/current stream links
- churches
- schedules
- leaders/contacts
- announcements
- notifications
- verification status

Local editors should only edit assigned congregations.

Track who changed important operational data and when.

## DESIGN
Use the supplied ISTN-SJ logo as the institutional visual reference.
The logo contains a globe and sun and the text ISTN-SJ.

Do not redraw or replace the official logo in the MVP.

Use the supplied ministry artwork as visual inspiration:
- strong ministry photography
- bold titles
- black/white typography
- existing yellow/gold, blue and green identity

Modernize the UX rather than copying old poster layouts literally.

## AI
Do not create an AI persona that impersonates Profeta Elias.
If AI is implemented later, limit it to grounded search and editorial assistance:
- semantic search
- draft tags
- draft summaries
- transcript processing
- related-content discovery

AI output must be grounded in existing source content and reviewed by humans.

## PRIVACY / COMMUNITY
Do not build a public social network in the MVP.
No public comments, user-to-user messaging, follower system or open user-generated-content feed.

Do not expose prayer requests or pastoral information publicly.
If prayer requests are later added, implement explicit privacy, access control, consent, retention and deletion.

## ENGINEERING
- Clean component architecture.
- Typed data models.
- Separate UI from data/services.
- Operational data configurable through admin/backend.
- Environment variables for integrations.
- PWA-ready where practical.
- Optimized images and lazy loading.
- Resilient network states.
- Avoid unnecessary dependencies.
- Do not create a single-file prototype.
- Keep the architecture ready for a real backend.

## FIRST VERTICAL SLICE
Implement:
Home → Teaching library → Search → Teaching detail → Live schedule → Live detail → Church directory → Church detail → Profile/preferences.

Use the supplied assets and source data so the prototype feels real.

## ACCEPTANCE CRITERIA
A visitor can:
1. understand the product;
2. discover a teaching;
3. open its detail page;
4. see the next live;
5. understand its time;
6. find an ISTN location/community;
7. open church details and contact the listed leader.

A regular member can:
1. see the next live;
2. browse recent teachings;
3. find their congregation;
4. see Saturday/Sunday services;
5. manage basic preferences.

Before finishing:
- run the app locally;
- fix build/runtime errors;
- test responsive layouts;
- verify navigation;
- provide setup instructions;
- list required environment variables;
- list integrations that still require credentials/configuration;
- list known limitations;
- do not claim external integrations are functional if credentials/API access are not configured.

## IMPORTANT
Build the product as an orchestration layer around the existing ministry ecosystem, not as a replacement for YouTube, Zoom, WhatsApp, Telegram, Facebook or TikTok.

Do not overbuild.
