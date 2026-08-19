import { spawn } from "node:child_process";
import process from "node:process";

// HidenCloud's Node egg runs .js entrypoints with Node, while .ts entrypoints
// are routed through ts-node. This wrapper keeps the panel on a plain .js
// entrypoint and lets the project's own `tsx` dependency run server.ts.
const child = spawn("npm", ["run", "start"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    // This is the allocation targeted by lineup.hidenfree.com's reverse proxy.
    // A panel-provided PORT still takes precedence if the allocation changes.
    PORT: process.env.PORT || "25456",
  },
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
