import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { clearCookies } from "../src/utils/config.ts";

test("clearCookies preserves every non-cookie configuration value", () => {
  let stored = JSON.stringify({
    soc: "Pleiku SOC",
    soc_id: "1001",
    cookies: "SPC_EC=secret",
    hubs: ["Hub A"],
    hub_ids: { "Hub A": "2001" },
    socs: ["DN SOC"],
    soc_ids: { "DN SOC": "3001" },
    group_socs: { "DN SOC": ["DN SOC"] },
    proxy_url: "https://proxy.example",
    ggsheet_log_url: "https://log.example",
    scanner_url: "https://scanner.example",
  });
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (key === "configs" ? stored : null),
      setItem: (key: string, value: string) => {
        if (key === "configs") stored = value;
      },
    },
  });

  try {
    const result = clearCookies();
    const persisted = JSON.parse(stored);
    assert.equal(result.cookies, "");
    assert.equal(persisted.cookies, "");
    assert.equal(persisted.soc, "Pleiku SOC");
    assert.deepEqual(persisted.hubs, ["Hub A"]);
    assert.equal(persisted.proxy_url, "https://proxy.example");
    assert.equal(persisted.ggsheet_log_url, "https://log.example");
    assert.equal(persisted.scanner_url, "https://scanner.example");
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("Settings uses the active SPX browser session instead of manual cookies", async () => {
  const source = await readFile(
    new URL("../src/pages/SettingsPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Không cần nhập Cookie/);
  assert.match(source, /phiên đăng nhập SPX/i);
  assert.match(source, /Xóa toàn bộ/);
  assert.doesNotMatch(source, /clearCookies/);
  assert.doesNotMatch(source, /Xóa Cookie/);
  assert.doesNotMatch(source, /setCookies/);
});

test("station configuration uses searchable selectors and accessible group actions", async () => {
  const [stationSelect, groupEditor] = await Promise.all([
    readFile(
      new URL("../src/components/StationSelect.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/SocGroupEditor.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(stationSelect, /SearchableSelect/);
  assert.match(stationSelect, /stationCode/);
  assert.match(groupEditor, /SOC đại diện/);
  assert.match(groupEditor, /SOC thành viên/);
  assert.match(groupEditor, /aria-label={`Xóa \${name} khỏi nhóm`}/);
  assert.match(groupEditor, /min-h-11/);
  assert.match(groupEditor, /touch-manipulation/);
});

test("Settings loads embedded SOC data and removes manual station inputs", async () => {
  const source = await readFile(
    new URL("../src/pages/SettingsPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /loadStationCatalog/);
  assert.match(source, /loadStationHubs/);
  assert.match(source, /StationSelect/);
  assert.match(source, /SocGroupEditor/);
  assert.match(source, /tích hợp sẵn trong userscript/);
  assert.match(source, /Đang tải Hub/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /DEFAULT_STATION_CONFIG/);
  assert.doesNotMatch(source, /Tên \| ID/);
  assert.doesNotMatch(source, /Tải mẫu/);
  assert.doesNotMatch(source, /saveConfigs\(imported\)/);
});
