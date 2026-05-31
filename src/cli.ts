import { loadConfig } from "./config.js";
import { sendDiscordNotification } from "./discord.js";
import { fetchActivityForUsers } from "./github.js";
import { createReportEntry, writeReport } from "./reportManifest.js";
import { renderReport } from "./renderReport.js";
import { startScheduler } from "./scheduler.js";
import { startServer } from "./server.js";
import { summarizeResults } from "./summarize.js";

const command = process.argv[2] ?? "serve";
const notify = process.argv.includes("--notify");

try {
  if (command === "generate") {
    const { config, secrets } = await loadConfig({ requireDiscord: notify });
    const entry = await generateReport({ notify, config, secrets });
    console.log(`Generated report: ${entry.fileName}`);
  } else if (command === "serve") {
    const { config, secrets } = await loadConfig({ requireDiscord: true });
    await startServer(config);
    startScheduler({
      config,
      run: async () => {
        await generateReport({ notify: true, config, secrets });
      },
    });
  } else {
    throw new Error(`Unknown command "${command}". Use "serve" or "generate".`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

export async function generateReport(options: {
  notify: boolean;
  config: Awaited<ReturnType<typeof loadConfig>>["config"];
  secrets: Awaited<ReturnType<typeof loadConfig>>["secrets"];
}) {
  const runAt = new Date();
  const windowStart = new Date(runAt);
  windowStart.setDate(
    windowStart.getDate() - options.config.reports.lookbackDays,
  );

  const results = await fetchActivityForUsers({
    githubToken: options.secrets.githubToken,
    users: options.config.users,
    windowStart,
    windowEnd: runAt,
  });
  const summary = summarizeResults(results);
  const entry = createReportEntry({
    createdAt: runAt,
    windowStart,
    windowEnd: runAt,
    trackedUserCount: options.config.users.length,
    activeUserCount: summary.activeUserCount,
    repositoriesTouchedCount: summary.repositoriesTouchedCount,
  });
  const html = renderReport({ config: options.config, summary, entry });

  await writeReport(options.config, entry, html);

  if (options.notify) {
    if (!options.secrets.discordWebhookUrl)
      throw new Error(
        "Missing required environment variable DISCORD_WEBHOOK_URL.",
      );
    await sendDiscordNotification({
      webhookUrl: options.secrets.discordWebhookUrl,
      publicBaseUrl: options.config.server.publicBaseUrl,
    });
  }

  return entry;
}
