import cron from "node-cron";
import type { AppConfig } from "./types.js";

const dayToCron: Record<AppConfig["schedule"]["dayOfWeek"], number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function startScheduler(options: {
  config: AppConfig;
  run: () => Promise<void>;
}): void {
  const [hour, minute] = options.config.schedule.time.split(":");
  const expression = `${Number(minute)} ${Number(hour)} * * ${dayToCron[options.config.schedule.dayOfWeek]}`;

  cron.schedule(
    expression,
    () => {
      options.run().catch((error) => {
        console.error(
          "Scheduled report failed:",
          error instanceof Error ? error.message : error,
        );
      });
    },
    { timezone: options.config.schedule.timezone },
  );

  console.log(
    `Scheduler active: ${options.config.schedule.dayOfWeek} at ${options.config.schedule.time} ${options.config.schedule.timezone}`,
  );
}
