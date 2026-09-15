# Live System

## Known operating pattern
The project owner states that Profeta Elias has daily Zoom meetings generally starting around 21:00. These meetings may also be associated with TikTok, and recordings are subsequently published on YouTube.

## Important
The 21:00 schedule and all URLs are operational data, not immutable code constants.

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
