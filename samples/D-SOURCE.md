# RoomPlan compatibility fixture

`D-RoomPlan-test-fixture.json` is created by Links Tam for deterministic format and unit conversion tests. It is **not a phone capture** and must not be presented as evidence of real sensor accuracy.

It encodes a 4000 × 3000 mm wall-centerline rectangle, 120 mm walls, 2800 mm height, one inward single door, one window and one 1800 × 2000 × 1050 mm bed in Apple RoomPlan-style metre transforms. The expected clear floor is 3880 × 2880 mm.

The importer also tests the existing MIT-licensed openPlan3D `app/tests/fixtures/handoff-roomplan.json` without replacing its content with our fixture. Original source JSON is retained in RoomFit project assets. User-provided capture files keep their original rights.

For an actual scan, export editable JSON from the iOS companion or an original scan ZIP containing one room.json, then use Import scan. No physical iPhone/iPad has been tested in this Windows session.
