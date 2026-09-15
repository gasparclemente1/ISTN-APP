# Data Validation Rules

The provided church lists are operational source material, not automatically verified master data.

Every record should support:
- verification_status: unverified | needs_review | verified
- source_note
- last_verified_at

Do not silently "fix" names, phone numbers or locations.
Examples needing review from supplied messages include:
- duplicated/ambiguous Alto Garças entries in Brazil;
- "Baia" vs Bahia;
- spelling variants such as Júlio Cesár/César;
- leaders/numbers appearing across multiple locations;
- online communities where a physical address is not provided;
- the United States entry used the Liberia flag in the supplied message (country text says United States; use country data, not the flag, and flag this for editorial review).

Phone numbers should be stored as strings, preserving country code.
Do not infer physical presence from an online-community contact.
