import type { AppConfig, ReportEntry } from "./types.js";
import type { ReportSummary } from "./summarize.js";

export function renderReport(options: {
  config: AppConfig;
  summary: ReportSummary;
  entry: ReportEntry;
}): string {
  const { config, summary, entry } = options;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub Activity Digest - ${formatDate(entry.createdAt)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="bg-zinc-50 text-zinc-950">
  <main class="mx-auto max-w-5xl px-5 py-8 sm:py-12">
    <header class="mb-8 border-b border-zinc-200 pb-6">
      <p class="mb-2 text-sm font-medium uppercase tracking-wide text-emerald-700">GitHub Activity Digest</p>
      <h1 class="text-3xl font-semibold tracking-normal text-zinc-950">Weekly public activity</h1>
      <p class="mt-3 text-sm text-zinc-600">Generated ${formatDate(entry.createdAt)} for ${formatDate(entry.windowStart)} through ${formatDate(entry.windowEnd)}.</p>
    </header>

    <section class="mb-8 grid gap-3 sm:grid-cols-3">
      ${metric("Tracked users", entry.trackedUserCount)}
      ${metric("Active users", entry.activeUserCount)}
      ${metric("Repos touched", entry.repositoriesTouchedCount)}
    </section>

    ${summary.hasFailures ? `<div class="mb-8 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">Some users could not be fetched. The rest of the report was generated normally.</div>` : ""}

    <section class="space-y-8">
      ${summary.users
        .map(
          (user) => `<article class="border-t border-zinc-200 pt-6">
        <h2 class="text-xl font-semibold text-zinc-950">${escapeHtml(user.label)}</h2>
        <p class="mt-1 text-sm text-zinc-500">@${escapeHtml(user.username)}</p>
        ${renderUserBody(user)}
      </article>`,
        )
        .join("\n")}
    </section>

    <footer class="mt-12 border-t border-zinc-200 pt-5 text-sm text-zinc-500">
      <a class="font-medium text-emerald-700 hover:text-emerald-800" href="/">View archive</a>
      <span class="mx-2">/</span>
      <span>${escapeHtml(config.server.publicBaseUrl)}</span>
    </footer>
  </main>
</body>
</html>`;
}

export function renderArchivePage(reports: ReportEntry[]): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub Activity Digest Archive</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="bg-zinc-50 text-zinc-950">
  <main class="mx-auto max-w-4xl px-5 py-8 sm:py-12">
    <header class="mb-8 border-b border-zinc-200 pb-6">
      <p class="mb-2 text-sm font-medium uppercase tracking-wide text-emerald-700">GitHub Activity Digest</p>
      <h1 class="text-3xl font-semibold tracking-normal">Report archive</h1>
    </header>
    ${
      reports.length === 0
        ? `<p class="text-zinc-600">No reports have been generated yet.</p>`
        : `<ol class="divide-y divide-zinc-200 border-y border-zinc-200">${reports.map(renderArchiveItem).join("\n")}</ol>`
    }
  </main>
</body>
</html>`;
}

function renderUserBody(user: ReportSummary["users"][number]): string {
  if (user.error) {
    return `<p class="mt-4 text-sm text-red-700">Could not fetch activity.</p>`;
  }
  if (user.repositories.length === 0) {
    return `<p class="mt-4 text-zinc-600">No public activity found in this window.</p>`;
  }
  return `<div class="mt-5 space-y-4">
    ${user.repositories
      .map(
        (repo) => `<section>
      <h3 class="text-base font-semibold"><a class="text-emerald-700 hover:text-emerald-800" href="${escapeAttribute(repo.repoUrl)}">${escapeHtml(repo.repoName)}</a></h3>
      <p class="mt-1 text-zinc-700">${escapeHtml(repo.sentence)}</p>
    </section>`,
      )
      .join("\n")}
  </div>`;
}

function renderArchiveItem(report: ReportEntry): string {
  return `<li class="py-4">
    <a class="text-lg font-semibold text-emerald-700 hover:text-emerald-800" href="/reports/${escapeAttribute(report.id)}">${formatDate(report.createdAt)}</a>
    <p class="mt-1 text-sm text-zinc-600">${formatDate(report.windowStart)} through ${formatDate(report.windowEnd)} · ${report.activeUserCount}/${report.trackedUserCount} active users · ${report.repositoriesTouchedCount} repos</p>
  </li>`;
}

function metric(label: string, value: number): string {
  return `<div class="border border-zinc-200 bg-white px-4 py-3">
    <div class="text-2xl font-semibold text-zinc-950">${value}</div>
    <div class="text-sm text-zinc-500">${label}</div>
  </div>`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
