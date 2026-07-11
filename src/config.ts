import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { AppConfig, RuntimeSecrets } from "./types.js";

const dayNames = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const githubUsernamePattern = /^[a-zA-Z0-9-]{1,39}$/;
const scheduleTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const defaultConfigYaml = `server:
  host: "0.0.0.0"
  port: 3000
  publicBaseUrl: "http://localhost:3000"

schedule:
  timezone: "America/New_York"
  dayOfWeek: "monday"
  time: "09:00"

reports:
  lookbackDays: 7

users: []
`;

type LoadConfigOptions = {
  configPath?: string;
  requireDiscord?: boolean;
};

type FileConfig = Omit<AppConfig, "reports"> & {
  reports: Omit<AppConfig["reports"], "dataDir">;
};

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<{ config: AppConfig; secrets: RuntimeSecrets }> {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) {
    throw new Error("Missing required environment variable DATA_DIR.");
  }

  const configPath = path.resolve(
    options.configPath ?? path.join(dataDir, "config.yaml"),
  );
  const parsed = await readConfig(configPath);
  let config: FileConfig;

  try {
    config = validateConfig(parsed);
  } catch (error) {
    throw new Error(
      `Could not load config at ${configPath}: ${formatError(error)}`,
    );
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!githubToken) {
    throw new Error("Missing required environment variable GITHUB_TOKEN.");
  }

  if (options.requireDiscord && !discordWebhookUrl) {
    throw new Error(
      "Missing required environment variable DISCORD_WEBHOOK_URL.",
    );
  }

  return {
    config: { ...config, reports: { ...config.reports, dataDir } },
    secrets: {
      githubToken,
      discordWebhookUrl,
    },
  };
}

async function readConfig(configPath: string): Promise<unknown> {
  try {
    return YAML.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw new Error(
        `Could not load config at ${configPath}: ${formatError(error)}`,
      );
    }

    await writeDefaultConfig(configPath);
    return YAML.parse(defaultConfigYaml);
  }
}

async function writeDefaultConfig(configPath: string): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, defaultConfigYaml, { flag: "wx" });
}

function validateConfig(raw: unknown): FileConfig {
  if (!isRecord(raw)) throw new Error("Config must be a YAML object.");

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatConfigError(result.error));
  }

  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");

const configSchema = z.object({
  server: z.object({
    host: nonEmptyString,
    port: z.number().int().min(1).max(65535),
    publicBaseUrl: nonEmptyString
      .transform((value) => value.replace(/\/$/, ""))
      .refine(isValidUrl, "must be a valid URL"),
  }),
  schedule: z.object({
    timezone: nonEmptyString.refine(
      isValidTimezone,
      "must be a valid IANA timezone",
    ),
    dayOfWeek: nonEmptyString
      .transform((value) => value.toLowerCase())
      .pipe(z.enum(dayNames, `must be one of: ${dayNames.join(", ")}`)),
    time: nonEmptyString.regex(
      scheduleTimePattern,
      "must use HH:mm 24-hour format",
    ),
  }),
  reports: z.object({
    lookbackDays: z.number().int().min(1).max(90),
  }),
  users: z.array(
    z.object({
      username: nonEmptyString.refine(
        (value) =>
          githubUsernamePattern.test(value) &&
          !value.startsWith("-") &&
          !value.endsWith("-"),
        "is not a valid GitHub username",
      ),
      label: nonEmptyString,
    }),
  ),
}) satisfies z.ZodType<FileConfig>;

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatConfigError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = formatIssuePath(issue.path);

  if (issue.code === "invalid_type") {
    if (issue.expected === "object" && path)
      return `${path} must be an object.`;
    if (issue.expected === "array" && path === "users")
      return "users must be an array.";
    if (issue.expected === "string" && path)
      return `${path} must be a non-empty string.`;
    if (issue.expected === "number" && path) return `${path} must be a number.`;
  }

  if (
    path === "server.port" &&
    (issue.code === "too_small" ||
      issue.code === "too_big" ||
      issue.code === "invalid_type")
  ) {
    return "server.port must be an integer from 1 to 65535.";
  }

  if (
    path === "reports.lookbackDays" &&
    (issue.code === "too_small" ||
      issue.code === "too_big" ||
      issue.code === "invalid_type")
  ) {
    return "reports.lookbackDays must be an integer from 1 to 90.";
  }

  if (path) return `${path} ${issue.message}.`;
  return issue.message;
}

function formatIssuePath(path: PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") return `${formatted}[${segment}]`;
    if (typeof segment === "symbol") return formatted;
    return formatted ? `${formatted}.${segment}` : segment;
  }, "");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
