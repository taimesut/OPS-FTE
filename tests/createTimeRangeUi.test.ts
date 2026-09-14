import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

for (const [label, pagePath] of [
  ["nội tỉnh", "../src/pages/CheckSotNoiTinhPage.tsx"],
  ["ngoại tỉnh", "../src/pages/CheckSotNgoaiTinhPage.tsx"],
] as const) {
  test(`check sót ${label} hides create time controls and uses the automatic six-month ctime`, async () => {
    const source = await readSource(pagePath);

    assert.doesNotMatch(source, /CreateTimeRangeControl/);
    assert.doesNotMatch(source, /createTimeRangeInput/);
    assert.match(source, /createDefaultCreateTimeRange/);
    assert.match(source, /const activeCreateTimeRange = createDefaultCreateTimeRange\(\)/);
    assert.match(source, /ctime=\$\{activeCreateTimeRange\.ctime\}/);
  });
}
