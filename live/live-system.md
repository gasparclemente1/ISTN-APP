# Live System

## Known operating pattern
Profeta Elias holds Zoom meetings every day. The schedule supplied by the project
owner on 2026-09-15, in Africa/Luanda time, is:

| Day | Start |
| --- | --- |
| Monday, Thursday | 20:30 |
| Wednesday, Friday, Saturday, Sunday | 19:30 |
| Tuesday | after the ministers' live — no fixed time |

These meetings may also be associated with TikTok, and recordings are subsequently
published on YouTube.

## When a live is "a decorrer"

A live counts as going on from its start until **06:00 in Luanda** the next
morning, never less than two hours. The lives begin in the evening and often run
past midnight: at 23:00 the app must still offer the live people can join, not
tomorrow's. Only at 06:00 does it move on to the next one. When two overlap, the
one that began last is shown. The rule is `liveUntil` in `src/meetings.js`, with
its tests in `tests/meetings.test.mjs`.

While a live is on, the home page says so above the Profeta's picture («Ao vivo
agora»), and its card opens the Zoom directly.

## Important
The schedule and all URLs are operational data, not immutable code constants.
They live in `data/live-config.json`, which the admin workflow must be able to edit.

Admin must be able to:
- change the meeting time
- change the Zoom link
- change YouTube/TikTok links
- cancel/reschedule a meeting
- add exceptions
- assign timezone
- associate the eventual recording with the event

## Timezones
Store an IANA timezone per event/congregation, e.g. Africa/Luanda, Europe/Lisbon, Europe/Berlin.
Render the user's local time in the UI when possible.
Always make the timezone understandable when ambiguity exists.

## Recording lifecycle
Upcoming live → live now → ended → recording pending → recording available.
