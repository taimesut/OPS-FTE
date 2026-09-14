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

  test(`check sót ${label} shows the exact create time range used by the packed TO request`, async () => {
    const source = await readSource(pagePath);

    assert.match(source, /useState<CreateTimeRange \| null>\(null\)/);
    assert.match(source, /setLastCreateTimeRange\(activeCreateTimeRange\)/);
    assert.match(source, /<CreateTimeRangeNotice range=\{lastCreateTimeRange\} \/>/);
    assert.match(source, /console\.info\([^]*activeCreateTimeRange\.ctime/);
  });
}

test("create time notice renders a compact human-readable range for packed TO", async () => {
  const source = await readSource("../src/components/CreateTimeRangeNotice.tsx");

  assert.match(source, /Create Time TO đóng bao:/);
  assert.match(source, /formatLocalDateTime\(range\.fromLocalDateTime\)/);
  assert.match(source, /formatLocalDateTime\(range\.toLocalDateTime\)/);
});
