import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const esbuildBinary = path.join(root, "node_modules", "@esbuild", "win32-x64", "esbuild.exe");
const env = { ...process.env };

if (fs.existsSync(esbuildBinary)) {
  env.ESBUILD_BINARY_PATH = esbuildBinary;
}

const child = spawn(process.execPath, [viteBin, "build"], {
  stdio: "inherit",
  shell: false,
  env
});

child.on("exit", (code) => process.exit(code ?? 1));
