import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const esbuildBinary = path.join(root, "node_modules", "@esbuild", "win32-x64", "esbuild.exe");

const child = spawn(process.execPath, [viteBin, "build"], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ESBUILD_BINARY_PATH: esbuildBinary
  }
});

child.on("exit", (code) => process.exit(code ?? 1));
