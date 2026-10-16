// Cross-platform post-build: make the CLI executable and copy bundled resources.
import { chmodSync, cpSync } from "node:fs";

chmodSync("dist/index.js", 0o755);
cpSync("src/resources", "dist/resources", { recursive: true });
