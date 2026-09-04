import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assembleGasBundle,
  bundleGas,
  collectGasSourceFiles,
} from "../bundle-gas.mjs";

test("recursively discovers and deterministically orders only gs files", async () => {
  const root = await mkdtemp(join(tmpdir(), "fte-gas-bundle-"));
  const sourceDir = join(root, "gas");
  await mkdir(join(sourceDir, "nested"), { recursive: true });
  await writeFile(join(sourceDir, "z.gs"), "function z() {}\r\n", "utf8");
  await writeFile(join(sourceDir, "a.gs"), "\uFEFFfunction a() {}\r", "utf8");
  await writeFile(join(sourceDir, "nested", "b.GS"), "function b() {}\n", "utf8");
  await writeFile(join(sourceDir, "ignore.txt"), "ignored", "utf8");
  const files = await collectGasSourceFiles(sourceDir);
  assert.deepEqual(
    files.map((path) => path.replaceAll("\\", "/").slice(sourceDir.length + 1)),
    ["a.gs", "nested/b.GS", "z.gs"],
  );
  const bundle = await assembleGasBundle(sourceDir, files);
  assert.equal(
    bundle,
    [
      "// ===== SOURCE: gas/a.gs =====",
      "function a() {}",
      "",
      "// ===== SOURCE: gas/nested/b.GS =====",
      "function b() {}",
      "",
      "// ===== SOURCE: gas/z.gs =====",
      "function z() {}",
      "",
    ].join("\n"),
  );
});

test("writes byte-identical output on repeated runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "fte-gas-repeat-"));
  const sourceDir = join(root, "gas");
  const outputFile = join(root, "gas-dist", "code.gs");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "code.gs"), "function doGet() {}\n", "utf8");
  const first = await bundleGas({ sourceDir, outputFile });
  const firstBytes = await readFile(outputFile);
  const second = await bundleGas({ sourceDir, outputFile });
  const secondBytes = await readFile(outputFile);
  assert.equal(first.sourceCount, 1);
  assert.equal(second.sourceCount, 1);
  assert.deepEqual(secondBytes, firstBytes);
});

test("rejects an empty GAS source tree without replacing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "fte-gas-empty-"));
  const sourceDir = join(root, "gas");
  const outputFile = join(root, "gas-dist", "code.gs");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(join(root, "gas-dist"), { recursive: true });
  await writeFile(outputFile, "previous bundle", "utf8");
  await assert.rejects(bundleGas({ sourceDir, outputFile }), /không tìm thấy.*\.gs/i);
  assert.equal(await readFile(outputFile, "utf8"), "previous bundle");
});
