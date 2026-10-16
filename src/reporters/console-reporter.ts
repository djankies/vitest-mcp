/**
 * Vitest reporter that records console output from tests as JSON lines.
 *
 * Loaded by Vitest itself (via `--reporter=<path>`), not by the MCP server, so it
 * must not import anything from this package. The `onUserConsoleLog` hook exists
 * in every supported Vitest major and receives logs from all projects, including
 * browser mode, without changing the user's config.
 */

import { appendFileSync } from "fs";

interface UserConsoleLog {
  content: string;
  type: "stdout" | "stderr";
}

export default class ConsoleCaptureReporter {
  private readonly logFile = process.env.VITEST_MCP_LOG_FILE;

  onUserConsoleLog(log: UserConsoleLog): void {
    if (!this.logFile) return;
    const entry = {
      type: log.type === "stderr" ? "stderr" : "stdout",
      message: String(log.content ?? "").replace(/\n$/, ""),
    };
    appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
  }
}
