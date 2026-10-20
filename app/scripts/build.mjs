import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import "./prepare-pdf-assets.mjs";
const result = spawnSync(
  process.execPath,
  [resolve("node_modules/vite/bin/vite.js"), "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PUBLIC_ENABLE_ANALYTICS: "false",
    },
  },
);
process.exit(result.status ?? 1);
