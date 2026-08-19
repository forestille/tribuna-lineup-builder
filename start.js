import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// HidenCloud's Node egg runs .js entrypoints with Node, while .ts entrypoints
// are routed through ts-node. This wrapper keeps the panel on a plain .js
// entrypoint and lets the project's own `tsx` dependency run server.ts.
const pythonPackagesDir = path.join(process.cwd(), ".python-packages");
const pythonTempDir = path.join(process.cwd(), ".python-tmp");
const pythonPath = [pythonPackagesDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
const runtimeEnv = {
  ...process.env,
  PYTHONPATH: pythonPath,
  TMPDIR: pythonTempDir,
  TEMP: pythonTempDir,
  TMP: pythonTempDir,
  PIP_NO_CACHE_DIR: "1",
  NODE_ENV: "production",
  // This is the allocation targeted by lineup.hidenfree.com's reverse proxy.
  // A panel-provided PORT still takes precedence if the allocation changes.
  PORT: process.env.PORT || "25456",
};

await Promise.all([
  mkdir(pythonPackagesDir, { recursive: true }),
  mkdir(pythonTempDir, { recursive: true }),
]);

const rembgCheck = spawnSync("python3", ["-c", "import rembg"], {
  env: runtimeEnv,
  stdio: "ignore",
});

if (rembgCheck.status !== 0) {
  const pipCheck = spawnSync("python3", ["-m", "pip", "--version"], {
    env: runtimeEnv,
    stdio: "ignore",
  });

  if (pipCheck.status !== 0) {
    console.log("Bootstrapping pip for the background-removal runtime...");
    const getPipResponse = await fetch("https://bootstrap.pypa.io/get-pip.py");
    if (!getPipResponse.ok) {
      throw new Error(`Unable to download pip bootstrap script (${getPipResponse.status})`);
    }

    const getPipPath = path.join(pythonPackagesDir, "get-pip.py");
    await writeFile(getPipPath, new Uint8Array(await getPipResponse.arrayBuffer()));
    const bootstrap = spawnSync(
      "python3",
      [getPipPath, "--disable-pip-version-check", "--target", pythonPackagesDir],
      { env: runtimeEnv, stdio: "inherit" },
    );
    if (bootstrap.status !== 0) {
      console.error("Unable to bootstrap pip for the background-removal runtime.");
      process.exit(bootstrap.status ?? 1);
    }
  }

  console.log("Installing the CPU background-removal runtime...");
  const install = spawnSync(
    "python3",
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--upgrade",
      "--target",
      pythonPackagesDir,
      "rembg[cpu]",
    ],
    { env: runtimeEnv, stdio: "inherit" },
  );
  if (install.status !== 0) {
    console.error("Unable to install the background-removal runtime.");
    process.exit(install.status ?? 1);
  }
}

const child = spawn("npm", ["run", "start"], {
  cwd: process.cwd(),
  env: runtimeEnv,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", error => {
  console.error("Unable to start the lineup server:", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Lineup server stopped by ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
