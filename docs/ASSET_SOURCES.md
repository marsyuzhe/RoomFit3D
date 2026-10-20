# Asset sources — RoomFit 3D 0.2

Checked official sources on 2026-10-20. Catalog entries are generic designs, not IKEA or other branded products. Dimensions are reference estimates until the user records and confirms a source.

| Source | License | Use in this release |
|---|---|---|
| Links Tam procedural catalog | MIT, repository LICENSE | 150 structured Studio assets; catalog.ts + procedural.ts; legacy double bed retained from models.ts |
| openPlan3D | MIT, app/LICENSE | inherited editing/room detection/wall algorithms; not counted as 150 new asset files |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | CC0 | inherited GLB files retained; not counted in the Studio 150; import supports solid uncompressed GLB |
| [Poly Haven](https://polyhaven.com/license) | CC0 assets | researched; no new model/HDRI downloaded or counted |
| [ambientCG](https://docs.ambientcg.com/license/) | CC0 | inherited textures and notices retained; new procedural geometry does not rely on these maps |
| [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 | Apache-2.0 | actual local raster OCR; WASM, worker, language data bundled |
| [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) eng | Apache-2.0 | assets/ocr/eng.traineddata; SHA256 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2 |

No scraped product photos, brand logos, game screenshots or noncommercial training data are packaged. User-provided photos and GLB licenses are retained as user-supplied metadata. A photo is a reference image, not a reconstructed 3D model.

New floor plan example and distorted/blurred variants are authored by Links Tam for functional tests, MIT; they are not survey measurements. Existing public-domain sample C and RoomPlan-format sample D retain their own source notes.
