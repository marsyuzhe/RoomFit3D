import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { handoffScope, loadPackage, reviewPhotos, summarizePackage } from '$lib/skills';

// Reference outputs come from the Python skill scripts in openplan3d-ios/tooling/skills,
// run on these same fixtures. Regenerate them there when either side changes on purpose.
const fixtures = ['native-project-package', 'web-metadata-package', 'web-project-package'];
const reference = (name: string, kind: string) => JSON.parse(readFileSync(`tests/fixtures/skills/${name}.${kind}.json`, 'utf8'));

for (const name of fixtures) {
  it(`summary matches the Python skill on ${name}`, () => {
    expect({ ok: true, ...summarizePackage(loadPackage(readFileSync(`tests/fixtures/${name}.zip`))) }).toEqual(reference(name, 'summary'));
  });
  it(`photo review matches the Python skill on ${name}`, () => {
    expect({ ok: true, ...reviewPhotos(loadPackage(readFileSync(`tests/fixtures/${name}.zip`))) }).toEqual(reference(name, 'photos'));
  });
  it(`handoff matches the Python skill on ${name}`, () => {
    expect({ ok: true, ...handoffScope(loadPackage(readFileSync(`tests/fixtures/${name}.zip`))) }).toEqual(reference(name, 'handoff'));
  });
}
