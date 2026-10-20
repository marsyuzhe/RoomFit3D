# Third-party notices

RoomFit additions and branding: Copyright (c) 2026 Links Tam, MIT (root LICENSE).

openPlan3D: https://github.com/laanlabs/openPlan3D, MIT, Copyright (c) 2026 theLodgeStudio. Full original terms are retained in app/LICENSE and assets/licenses/openPlan3D-MIT.txt. The local development ADR records base 4e66c60c00fba494181d647cc10324becd9a50b5. This release preparation did not run Git; this identifier is provenance recorded by the earlier development audit, not a newly authenticated checkout. The local license copies were compared byte-for-byte after normalizing line endings; the current upstream LICENSE was independently viewed on 2026-10-20 at https://github.com/laanlabs/openPlan3D/blob/main/LICENSE. Inherited source has subsequent RoomFit changes; it is not an untouched upstream snapshot.

Inherited capability: wall/opening geometry, room detection, advanced 2D canvas and supporting editor/services. Added RoomFit capability: millimetre scene/schema, beginner Studio, generic catalogue, guided floor plan review, Windows desktop and Cycles manifest pipeline. Upstream cloud/AI/iOS services are not advertised as supported by this desktop release. Unrelated upstream Firebase analytics configuration was removed from this public copy; default desktop builds already disable analytics.

| Component | License / retained text |
|---|---|
| Kenney Furniture / Nature Kit | CC0; app/static/models/furniture-kit-License.txt and nature-kit-License.txt |
| ambientCG textures | CC0; app/static/textures/CREDITS.md retains source IDs |
| 150 RoomFit parametric definitions, example layouts, SVG icon | MIT; Links Tam; dimensions are estimates |
| PDF.js | Apache-2.0; assets/licenses/pdfjs-LICENSE.txt; generated vendor fonts/decoders retain their own notices |
| Tesseract.js / core / tessdata_fast eng | Apache-2.0; node dependency notices and assets/ocr/LICENSE; data SHA-256 is recorded in docs/ASSET_SOURCES.md |
| Three.js, Svelte, Electron, other npm packages | Individual licenses in assets/licenses/NPM-NOTICES.txt and npm-inventory.json, including development-only dependencies |
| Electron / Chromium runtime | Electron LICENSE and LICENSES.chromium.html retained in installer runtime |
| Public-domain floor plan C | samples/C-SOURCE.md; not a measured reconstruction reference |
| Synthetic RoomPlan and RoomFit samples | samples/D-SOURCE.md, V020-SOURCES.md; no private residence or customer project is intentionally included |
| Blender | Separate external executable, not bundled. Obtain its source/terms at https://www.blender.org/about/license/ |

No CubiCasa noncommercial dataset/weights, commercial product photography, or evaluated research repository is included. User-imported photos/models require the user’s own permission. A package inventory is not a claim that every development dependency is shipped in the application.
