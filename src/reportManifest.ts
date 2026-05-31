import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig, ReportEntry, ReportManifest } from "./types.js";

export function reportsDir(config: AppConfig): string {
  return path.resolve(config.reports.dataDir, "reports");
}

export async function ensureReportStorage(config: AppConfig): Promise<void> {
  await fs.mkdir(reportsDir(config), { recursive: true });
}

export async function readManifest(config: AppConfig): Promise<ReportManifest> {
  const manifestPath = path.join(reportsDir(config), "manifest.json");
  try {
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as ReportManifest;
    return { reports: Array.isArray(manifest.reports) ? manifest.reports : [] };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { reports: [] };
    throw error;
  }
}

export async function writeReport(
  config: AppConfig,
  entry: ReportEntry,
  html: string,
): Promise<void> {
  await ensureReportStorage(config);
  const dir = reportsDir(config);
  const reportPath = path.join(dir, entry.fileName);
  await fs.writeFile(reportPath, html, "utf8");
  await fs.copyFile(reportPath, path.join(dir, "latest.html"));

  const manifest = await readManifest(config);
  const reports = [
    entry,
    ...manifest.reports.filter((report) => report.id !== entry.id),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({ reports }, null, 2)}\n`,
    "utf8",
  );
}

export function createReportEntry(options: {
  createdAt: Date;
  windowStart: Date;
  windowEnd: Date;
  trackedUserCount: number;
  activeUserCount: number;
  repositoriesTouchedCount: number;
}): ReportEntry {
  const id = options.createdAt
    .toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "");
  return {
    id,
    fileName: `${id}.html`,
    createdAt: options.createdAt.toISOString(),
    windowStart: options.windowStart.toISOString(),
    windowEnd: options.windowEnd.toISOString(),
    trackedUserCount: options.trackedUserCount,
    activeUserCount: options.activeUserCount,
    repositoriesTouchedCount: options.repositoriesTouchedCount,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
