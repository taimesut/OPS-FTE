import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = dirname(scriptPath);
const normalizePath = (value) => value.replaceAll("\\", "/");
const ordinalCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export async function collectGasSourceFiles(sourceDir) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".gs")) {
        files.push(fullPath);
      }
    }
  }

  await visit(sourceDir);
  return files.sort((left, right) =>
    ordinalCompare(
      normalizePath(relative(sourceDir, left)),
      normalizePath(relative(sourceDir, right)),
    ),
  );
}

const normalizeSource = (source) =>
  source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/u, "");

export async function assembleGasBundle(sourceDir, sourceFiles) {
  const sections = [];
  for (const sourceFile of sourceFiles) {
    const relativePath = normalizePath(relative(sourceDir, sourceFile));
    const source = normalizeSource(await readFile(sourceFile, "utf8"));
    sections.push(`// ===== SOURCE: gas/${relativePath} =====\n${source}`);
  }
  return `${sections.join("\n\n")}\n`;
}

export async function bundleGas({ sourceDir, outputFile }) {
  const sourceFiles = await collectGasSourceFiles(sourceDir);
  if (sourceFiles.length === 0) {
    throw new Error(`Không tìm thấy file .gs trong ${sourceDir}`);
  }

  const content = await assembleGasBundle(sourceDir, sourceFiles);
  await mkdir(dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(temporaryFile, content, "utf8");
    try {
      await rename(temporaryFile, outputFile);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "EEXIST" || error.code === "EPERM")
      ) {
        await rm(outputFile, { force: true });
        await rename(temporaryFile, outputFile);
      } else {
        throw error;
      }
    }
  } finally {
    await rm(temporaryFile, { force: true });
  }

  return {
    sourceCount: sourceFiles.length,
    sourceFiles,
    outputFile,
    byteSize: Buffer.byteLength(content, "utf8"),
  };
}

async function runCli() {
  const sourceDir = resolve(repositoryRoot, "gas");
  const outputFile = resolve(repositoryRoot, "gas-dist", "code.gs");
  const result = await bundleGas({ sourceDir, outputFile });
  console.log("GAS sources:");
  result.sourceFiles.forEach((file) =>
    console.log(`- ${normalizePath(relative(repositoryRoot, file))}`),
  );
  console.log(
    `Bundled ${result.sourceCount} file(s) -> ${normalizePath(relative(repositoryRoot, result.outputFile))} (${result.byteSize} bytes)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runCli().catch((error) => {
    console.error(
      `[bundle:gas] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
