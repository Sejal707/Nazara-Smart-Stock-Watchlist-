import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const esbuildBinary = path.join(root, "node_modules", "@esbuild", "win32-x64", "esbuild.exe");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");

const children = [
  spawn("node", ["server/seed.js"], { stdio: "inherit", shell: false }),
];

await once(children[0], "exit");

const api = spawn(process.execPath, ["server/server.js"], { stdio: "inherit", shell: false });
const web = spawn(process.execPath, [viteBin, "--host", "0.0.0.0"], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ESBUILD_BINARY_PATH: esbuildBinary
  }
});

children.push(api, web);

const stop = () => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
