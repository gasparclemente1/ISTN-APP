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
