# Design Principles

## Existing identity
Use the supplied ISTN-SJ logo as the institutional visual reference:
- globe/earth
- sun
- "ISTN-SJ"
- existing yellow/gold, blue and green visual language.

Do not redesign the logo in the MVP.

## UI direction
Modern, clean and mobile-first while respecting the existing visual identity.
Avoid making the interface look like a generic church template.
The Profeta Elias/ministry should have visual prominence, while ISTN-SJ remains clearly visible.

## Content cards
Existing ministry artwork often follows:
photo → message title → Apóstolo Marcelino Mário Bento → date → ISTN-SJ logo.
Use this pattern as inspiration for content cards, but do not blindly reproduce poster layouts in every component.

## Accessibility
- high contrast
- readable typography
- large tap targets
- captions/transcript support when available
- clear live states
- no critical information conveyed only by color

## Performance
- mobile-first
- lazy-load images
- avoid autoplay video
- optimized image sizes
- resilient loading states
- graceful behavior on slow connections
