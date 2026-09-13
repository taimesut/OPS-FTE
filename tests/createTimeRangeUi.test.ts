import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("create time control exposes two date-time inputs and a seven-day reset", async () => {
  const source = await readSource("../src/components/CreateTimeRangeControl.tsx");
  const dateTimeInputs = source.match(/type="datetime-local"/g) ?? [];

  assert.match(source, /Create time/);
  assert.equal(dateTimeInputs.length, 2);
  assert.match(source, /Từ ngày giờ/);
  assert.match(source, /Đến ngày giờ/);
  assert.match(source, /7 ngày gần nhất/);
  assert.match(source, /Hàng đã đóng bao/);
});

for (const [label, pagePath] of [
  ["nội tỉnh", "../src/pages/CheckSotNoiTinhPage.tsx"],
  ["ngoại tỉnh", "../src/pages/CheckSotNgoaiTinhPage.tsx"],
] as const) {
  test(`check sót ${label} uses selected create time for packed TO ctime`, async () => {
    const source = await readSource(pagePath);

    assert.match(source, /CreateTimeRangeControl/);
    assert.match(source, /createDefaultCreateTimeRangeInput/);
    assert.match(source, /createCreateTimeRange/);
    assert.match(source, /ctime=\$\{activeCreateTimeRange\.ctime\}/);
  });
}
