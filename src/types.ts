export type ActivityKind =
  | "pushedCommit"
  | "openedPullRequest"
  | "closedPullRequest"
  | "mergedPullRequest"
  | "openedIssue"
  | "closedIssue"
  | "createdBranch"
  | "createdTag"
  | "createdRepository";

export type ActivityRecord = {
  id: string;
  user: string;
  repoName: string;
  repoUrl: string;
  kind: ActivityKind;
  occurredAt: string;
};

export type TrackedUser = {
  username: string;
  label: string;
};

export type AppConfig = {
  server: {
    host: string;
    port: number;
    publicBaseUrl: string;
  };
  schedule: {
    timezone: string;
    dayOfWeek:
      | "sunday"
      | "monday"
      | "tuesday"
      | "wednesday"
      | "thursday"
      | "friday"
      | "saturday";
    time: string;
  };
  reports: {
    dataDir: string;
    lookbackDays: number;
  };
  users: TrackedUser[];
};

export type RuntimeSecrets = {
  githubToken: string;
  discordWebhookUrl?: string;
};

export type UserActivityResult = {
  user: TrackedUser;
  records: ActivityRecord[];
  error?: string;
};

export type ReportEntry = {
  id: string;
  fileName: string;
  createdAt: string;
  windowStart: string;
  windowEnd: string;
  trackedUserCount: number;
  activeUserCount: number;
  repositoriesTouchedCount: number;
};

export type ReportManifest = {
  reports: ReportEntry[];
};
