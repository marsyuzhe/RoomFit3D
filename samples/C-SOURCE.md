# Independent floorplan raster fixture

- Title: **Floor plan 1.jpg**
- Author: **Ashlynn Schindler** (uploaded by Thunderthigh27, 2010-02-17)
- Source: https://commons.wikimedia.org/wiki/File:Floor_plan_1.jpg
- Source revision checked: https://commons.wikimedia.org/w/index.php?title=File:Floor_plan_1.jpg&oldid=1254968974
- Original image: https://upload.wikimedia.org/wikipedia/commons/1/18/Floor_plan_1.jpg
- License: **public-domain dedication by the author (PD-self)**. The source also grants unrestricted use where dedication is not legally possible. This applies to the image, not to the surrounding Wikimedia page text.
- Local copy: `C-Floor-plan-1-public-domain.jpg`, unchanged JPEG, 1096 × 602, 25,322 bytes.
- SHA256: `f1c7d5f3bbc3abbe4395166ed92224c07ef588a3ff4ce7470980a6cfd2c89625`
- Retrieved: 2026-10-20.

This is an independently published drawing, not generated for our detector. It has **no dimension or scale annotation**. The 8000 mm calibration used in the UI test is a declared test assumption; it does not establish actual room dimensions. It must not be reported as a measured reconstruction or final project C acceptance.

The current algorithm proposes 16 axis-aligned dark bands with default threshold 150 / minimum length 60 px / minimum thickness 3 px. Window gaps, door gaps and short partitions are missed; some joins need correction. The test edits a wall thickness, embeds the calibrated raster and candidates, reopens it, and verifies that attaching it does not change existing furniture or walls. It does not substitute a manually encoded floorplan as the recognition output.

`evidence/calibration-fixture.png` and `floorplan-two-pages.pdf` are separate deterministic test fixtures created by Links Tam. Their exact expected dimensions test the conversion and UI pipeline; they are not evidence of real-world recognition accuracy.
