# Missing university marks: incremental acquisition

The 2026-09-13 pass checked all 366 missing schools in the 1,000-school catalog. It produced **71 additional marks**, bringing expected published coverage from 634 to **705 / 1,000**, with 295 explicit gaps remaining. The increment is held separately in `archives/logo-staging/additions.json` until the media merger publishes it. No existing university mark is replaced.

Sources and methods:

1. Recheck the exact school's current Wikidata `P154` (logo) and `P94` (coat of arms), excluding deprecated and explicitly ended claims. All 366 missing entities were fetched and cached. This recovers sources the original logo-only lookup missed.
2. Reuse existing database image associations and cached Commons metadata. Only previously accepted public-domain / Creative Commons licenses with attribution enter the increment. Official-site assets without an explicit reusable license and English Wikipedia non-free logos were not copied.
3. Recover missing machine-readable author fields from explicit Commons page `artist` fields. Preserve source revision IDs and the `AttribSVG` derivative-element credits. Missing or ambiguous authorship stays excluded.
4. Use Commons-generated raster thumbnails for SVGs containing embedded images or links. The existing unsafe-SVG rejection is unchanged. The browser receives only local WebP.
5. Recover three externally throttled GIF sources (Huddersfield, Messina, Myongji) from the already-associated local S3 bitmap objects. Database access remains read-only; credentials remain on the pipeline host.

Every accepted image was inspected on a labelled contact sheet. A Wikidata `P154` association alone is not sufficient: the proposed Sun Yat-sen University image was explicitly described as its 1932–1949 emblem and was rejected. Tests now cover this historical-logo case. Some accepted sources are wordmarks or heraldic arms rather than compact pictorial emblems; the asset is not claimed to be the institution's complete current branding system. Trademarks may remain protected despite an image's copyright license.

Reproducible commands (from repository root):

```sh
node scripts/logo-discover.mjs
node scripts/logo-s3-recover.mjs
node scripts/logo-contact-sheet.mjs
# Inspect every contact sheet and resolve questionable identities before preparing.
node scripts/logo-prepare-additions.mjs
# One coordinator serializes all media increments, avoiding concurrent manifest writes.
node scripts/media-merge-additions.mjs --kind logo --bundle archives/logo-staging
node scripts/media-validate.mjs
```

`--skip-entities` skips network entity refresh when continuing an interrupted acquisition. `logo-entity-fallback.mjs` optionally tries the cached `Special:EntityData` endpoint and stops on HTTP 429. Commons API acquisition is batched and serial; do not run multiple acquisition passes over the same staging cache simultaneously. External throttling is not interpreted as missing permission or permission to use an unverified substitute.

The full raw report, unresolved candidate list, original license metadata, entity snapshots and contact sheets remain in ignored `archives/logo-staging`. Future work can pursue explicit university permission or identify additional freely licensed versions for the remaining gaps; do not generate imitation logos or substitute sports-team/other-campus marks merely to increase coverage.
