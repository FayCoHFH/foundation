# Legacy migration ledgers

These files are evidence for content selection, redirects, media transfer, and launch validation. **They do not define the greenfield product, public navigation, taxonomy, domain model, page structure, or future URLs.** A legacy item can be transformed, merged, archived, or retired without reproducing Wix.

## Evidence scope and counts

Audit date: 2026-08-14.

- `pages-sitemap.xml`: 36 page URLs.
- `blog-posts-sitemap.xml`: 53 post URLs and 53 indexed hero-image associations.
- `blog-categories-sitemap.xml`: 3 entries. `/blog` duplicates the page sitemap and is represented once; the two additional category indexes are represented separately.
- `legacy-url-ledger.csv`: 91 unique canonical-path rows: 36 pages + 53 posts + 2 additional category indexes.
- Dispositions: ARCHIVE=35, MIGRATE_SELECTED=27, RETIRE=11, VERIFY=18.
- `redirect-map.csv`: 91 rows with a one-to-one `legacy_id` match to the URL ledger.
- `media-manifest.csv`: 82 source/asset associations and 74 distinct observed asset URLs: 53 blog heroes + 5 PDF page associations + 24 additional HEIC-origin associations. There are 25 HEIC-origin associations in total because one indexed blog hero also originated as HEIC.
- `external-links.csv`: 18 meaningful outgoing-link associations found in server-rendered page evidence after Wix platform/CDN links were excluded.

The sitemap is authoritative for the indexed URL counts on the audit date. It is not a complete Wix DAM or backlink export. Script-loaded galleries and editor-only assets may contain additional media. Request a Wix media export and search analytics/backlink exports before launch, then append discoveries with stable IDs.

## URL ledger schema

`legacy-url-ledger.csv` columns:

- `legacy_id`: stable ledger key: `P` page, `B` post, or `C` category index.
- `source_kind`: `PAGE`, `POST`, or `CATEGORY_INDEX`.
- `legacy_url`: canonical HTTPS/www URL observed in the sitemap. The root is normalized to `https://www.fchfh.org/`.
- `sitemap_sources`: evidence sitemap; `/blog` records both sitemap sources.
- `sitemap_last_modified`: Wix-provided date; it is not independent proof that the content itself changed.
- `disposition`: controlled migration decision state.
- `content_value`: evidence-oriented classification used to guide selection; it is not the new taxonomy.
- `risk_flags`: pipe-delimited review triggers; `LEGACY_INDEPENDENCE` expressly blocks product inference.
- `decision_basis`: concrete next treatment rather than a generic unresolved marker.

Disposition vocabulary:

- `MIGRATE_SELECTED`: preserve and transform the useful verified material; never clone the page wholesale by default.
- `VERIFY`: the item has plausible value but requires the stated factual, legal, privacy, consent, or external-dependency check.
- `ARCHIVE`: preserve dated institutional or legal evidence; public re-publication is a separate decision.
- `RETIRE`: no standalone public record should survive; merge explicitly identified value or return 410.

## Redirect map schema and canonical handling

`redirect-map.csv` is path-level and joins to the URL ledger by `legacy_id`.

- `redirect_status`: `KEEP_CANONICAL`, `TARGET_REQUIRED`, `DECISION_REQUIRED`, `ARCHIVE_DECISION`, `MERGE_REQUIRED`, or `GONE`.
- `target_path`: deliberately blank until the greenfield IA selects a semantically equivalent route. It is required only when a row becomes executable as a redirect.
- `planned_response`: intended launch behavior. `301_OR_410` requires a content decision; it is not executable configuration.
- `query_policy`: `ALLOWLIST_MARKETING` preserves only approved analytics keys such as `utm_*` while dropping Wix `lightbox` and unknown/internal parameters; `DROP_ALL` is used for 410 rows.
- `target_hint`: migration evidence category, never a promised path.
- `notes`: target-selection and anti-soft-404 guidance.

Scheme and host variants (`http`, bare host, and `www`) are canonicalized at the edge before this path map. Query-string variants are not separate content rows. Match redirects by normalized pathname, preserve only an explicit marketing allowlist, and never reflect arbitrary query parameters into targets. The root remains `/`; it is not silently omitted. Do not redirect unrelated retired URLs to the homepage.

Only `KEEP_CANONICAL` and `GONE` rows are presently deterministic. All other statuses must be resolved and tested against the approved greenfield IA before launch.

## Media manifest schema

`media-manifest.csv` is one row per source/asset association; repeated asset URLs are intentional when multiple pages use the same file.

- `manifest_id`: stable association key.
- `source_legacy_id` and `source_url`: owning ledger record.
- `legacy_asset_url`: exact observed Wix/CDN or hosted-document URL.
- `legacy_filename`: source filename when exposed. Blank means the sitemap did not expose one; it is not a missing-work marker.
- `asset_kind` and `observed_format`: evidence classification and served format.
- `disposition`: controlled treatment aligned with the parent or overridden for a safety reason.
- `rights_status`: `VERIFY_OWNERSHIP` or `VERIFY_PUBLICATION_RIGHTS`.
- `privacy_review`: `VERIFY`, `REQUIRED`, or `BLOCKED`.
- `alt_text_status`: `REWRITE_REQUIRED`, `FILENAME_ONLY`, `MISSING_OR_UNVERIFIED`, or `NOT_APPLICABLE`.
- `notes`: conversion, consent, legal, accessibility, or safety action.

The assistance PDF linked from both Aging in Place and Rapid Response is a launch blocker for that artifact: it requests Social Security Numbers and instructs email submission to `repairs@FCHFH.org`. It must not migrate or remain publicly served. The future private applicant workflow must not collect SSNs and must not reproduce email/PDF intake.

HEIC-origin images are currently served as Wix PNG/AVIF derivatives. Obtain originals or highest-quality exports; verify decoding, dimensions, orientation, metadata stripping, rights, participant consent, and meaningful alt text before migration.

## External link schema

`external-links.csv` records meaningful outgoing links and observed state on 2026-08-14.

- `observed_http_status` may describe a chain (`301_TO_200`) or network failure (`000`).
- `observed_state`: `ACTIVE`, `INACTIVE`, `REDIRECTS_TO_CANONICAL`, `DNS_FAILURE`, `BOT_OR_EDGE_BLOCK`, or `NOT_FOUND`.
- `disposition`: the same controlled vocabulary used elsewhere.
- `replacement_url`: set only when a safe concrete replacement is known.

Two DonorView URLs are confirmed inactive: the 2x4 form `9Kp38` and event form `r79q7o`. Active-looking DonorView pages still require account-owner confirmation; HTTP 200 does not prove correct fund mapping, data ownership, or long-term support. The observed legacy Cars for Homes URL contained transient user/session parameters; the ledger stores the cleaned candidate URL, which still requires organization approval and browser verification. `www.fayettehabitat.org` failed DNS, and the alternate `FayetteCountyHabitat.org` link merely redirects back to the canonical legacy site.

## Validation contract

Before merging or launch:

1. Parse all CSVs with an RFC 4180 parser and require exact header width on every row.
2. Require unique IDs and exact one-to-one `legacy_id` coverage between URL and redirect ledgers.
3. Require exactly 36 `PAGE`, 53 `POST`, and 2 `CATEGORY_INDEX` rows unless a dated sitemap re-audit documents a change.
4. Require every media `source_legacy_id` to exist in the URL ledger.
5. Require a nonblank `target_path` only for executable redirect states; resolve every `TARGET_REQUIRED`, `DECISION_REQUIRED`, `ARCHIVE_DECISION`, and `MERGE_REQUIRED` before launch.
6. Re-crawl internal and external links in a browser-capable launch environment and review all redirects for loops, chains, soft 404s, unsafe query propagation, and semantic mismatch.
