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

test("Settings exposes separate cookie and full reset actions", async () => {
  const source = await readFile(
    new URL("../src/pages/SettingsPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /clearCookies/);
  assert.match(source, /Bạn có chắc chắn muốn xóa Cookie SPX đã lưu/);
  assert.match(source, /Xóa Cookie/);
  assert.match(source, /Xóa toàn bộ/);
  assert.match(source, /Các cấu hình khác được giữ nguyên/);
});
