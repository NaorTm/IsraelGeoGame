# Approximate-Only Settlement Review

Generated on 2026-03-19.

These are the remaining playable settlements that still rely on approximate fallback polygons after the source-backed KML supplement pass.

Decision rule used in this review:
- If the source KML contains a clean, matchable locality placemark, replace the fallback with an exact source-backed polygon.
- If the source KML does not contain a clean locality placemark, keep the settlement playable but intentionally marked as approximate until a better source is available.

## Review

| Settlement | Region | Source KML status | Decision | Why |
| --- | --- | --- | --- | --- |
| יקנעם (מושבה) | north | No direct placemark match found | Keep approximate for now | The source file has surrounding industrial and city-area polygons, but not a clean locality polygon for the moshava itself. |
| נווה אבות | haifa | No direct placemark match found | Keep approximate for now | The locality remains playable and visible, but the source KML does not expose a usable polygon under this locality name. |
| קרית שלמה | center | No direct placemark match found | Keep approximate for now | This appears to be represented in the source file via broader urban grouping rather than a clean standalone locality polygon. |
| אבו עבדון (שבט) | south | No direct placemark match found | Keep approximate for now | Bedouin tribal locality is still inhabited and should stay playable, but the KML does not provide a clean exact polygon for this settlement row. |
| אעצם (שבט) | south | No direct placemark match found | Keep approximate for now | Same pattern as other Bedouin tribal rows: inhabited enough to keep, but not source-resolved in the KML. |
| אפיניש (שבט) | south | No direct placemark match found | Keep approximate for now | Retained intentionally as approximate so it remains reachable without pretending we have exact source geometry. |
| הוזייל (שבט) | south | No direct placemark match found | Keep approximate for now | No matchable source polygon under this locality name in the KML. |
| כחלה | south | No direct placemark match found | Keep approximate for now | The place remains in gameplay, but the source file does not provide a clean locality polygon we can map safely. |
| מסעודין אל-עזאזמה | south | No direct placemark match found | Keep approximate for now | Important inhabited locality; kept playable with explicit approximation rather than dropped. |
| עוקבי (בנו עוקבה) | south | No direct placemark match found | Keep approximate for now | No clean source placemark match; approximate handling stays intentional. |
| עטאוונה (שבט) | south | No direct placemark match found | Keep approximate for now | Same Bedouin-locality pattern as above. |
| רוח מדבר | south | No direct placemark match found | Keep approximate for now | Playable, but still lacks a clean source-backed polygon in the KML dataset. |
| תראבין א-צאנע (שבט) | south | No direct placemark match found for the tribal row | Keep approximate for now | The source file includes nearby Tarabin-related placemarks, but not a clean exact match for this specific tribal settlement row. |

## Product Handling

- These settlements remain playable in solo mode and in district content.
- The map legend continues to label approximate areas explicitly.
- Approximate handling is now intentional and documented, not an accidental missing-data gap.

## Next Upgrade Path

- If a better public polygon source is added later, these 13 should be the first exact-boundary backfill targets.
- Bedouin and tribal localities in the south likely need a dedicated source, because the current alerts-map KML under-represents them as clean standalone locality polygons.
