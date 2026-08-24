import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type HarnessOptions = {
  values?: unknown[][];
  missingSheet?: boolean;
  sheetError?: Error;
};

async function createVersionHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  let requestedRange: number[] | null = null;
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => {
          assert.equal(name, "VERSION");
          if (options.sheetError) throw options.sheetError;
          if (options.missingSheet) return null;
          return {
            getRange: (...args: number[]) => {
              requestedRange = args;
              return {
                getDisplayValues: () =>
                  options.values ?? [[" 1.2.3 ", " Sửa lỗi\nThêm tính năng "]],
              };
            },
          };
        },
      }),
    },
    console: { error() {} },
    JSON,
  });

  vm.runInContext(source, context);
  return { context, getRequestedRange: () => requestedRange };
}

test("reads VERSION A2 and B2 as display values", async () => {
  const harness = await createVersionHarness();
  const result = JSON.parse(
    JSON.stringify(harness.context.getAppVersionInfo()),
  );

  assert.deepEqual(harness.getRequestedRange(), [2, 1, 1, 2]);
  assert.deepEqual(result, {
    version: "1.2.3",
    updateContent: "Sửa lỗi\nThêm tính năng",
  });
});

test("returns empty version data when VERSION is missing", async () => {
  const { context } = await createVersionHarness({ missingSheet: true });
  assert.deepEqual(JSON.parse(JSON.stringify(context.getAppVersionInfo())), {
    version: "",
    updateContent: "",
  });
});

test("returns empty version data when A2 and B2 are blank", async () => {
  const { context } = await createVersionHarness({ values: [["  ", "\n"]] });
  assert.deepEqual(JSON.parse(JSON.stringify(context.getAppVersionInfo())), {
    version: "",
    updateContent: "",
  });
});

test("returns empty version data when the sheet read fails", async () => {
  const { context } = await createVersionHarness({
    sheetError: new Error("sheet failed"),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.getAppVersionInfo())), {
    version: "",
    updateContent: "",
  });
});
