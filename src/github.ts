import { Octokit } from "@octokit/rest";
import type {
  ActivityRecord,
  TrackedUser,
  UserActivityResult,
} from "./types.js";

type GitHubEvent = {
  id: string;
  type?: string;
  public?: boolean;
  created_at?: string;
  repo?: { name?: string; url?: string };
  payload?: Record<string, unknown>;
};

export async function fetchActivityForUsers(options: {
  githubToken: string;
  users: TrackedUser[];
  windowStart: Date;
  windowEnd: Date;
}): Promise<UserActivityResult[]> {
  const octokit = new Octokit({ auth: options.githubToken });
  return Promise.all(
    options.users.map(async (user) => {
      try {
        const events = await fetchRecentEvents(
          octokit,
          user.username,
          options.windowStart,
        );
        const records = events.flatMap((event) =>
          normalizeEvent(
            user.username,
            event,
            options.windowStart,
            options.windowEnd,
          ),
        );
        return { user, records: dedupe(records) };
      } catch (error) {
        return {
          user,
          records: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

async function fetchRecentEvents(
  octokit: Octokit,
  username: string,
  windowStart: Date,
): Promise<GitHubEvent[]> {
  const events: GitHubEvent[] = [];

  for (let page = 1; page <= 3; page++) {
    const response = await octokit.rest.activity.listPublicEventsForUser({
      username,
      per_page: 100,
      page,
    });
    const pageEvents = response.data as GitHubEvent[];
    events.push(...pageEvents);

    const oldest = pageEvents.at(-1)?.created_at;
    if (!oldest || new Date(oldest) < windowStart || pageEvents.length < 100)
      break;
  }

  return events;
}

export function normalizeEvent(
  username: string,
  event: GitHubEvent,
  windowStart: Date,
  windowEnd: Date,
): ActivityRecord[] {
  if (event.public === false || !event.created_at || !event.repo?.name)
    return [];

  const occurredAt = new Date(event.created_at);
  if (occurredAt < windowStart || occurredAt > windowEnd) return [];

  const repoName = event.repo.name;
  const repoUrl = `https://github.com/${repoName}`;
  const base = {
    user: username,
    repoName,
    repoUrl,
    occurredAt: event.created_at,
  };

  switch (event.type) {
    case "WatchEvent": {
      if (event.payload?.action !== "started") return [];
      return [{
        ...base,
        id: `star:${repoName.toLowerCase()}`,
        kind: "starredRepository",
      }];
    }
    case "PushEvent": {
      const commits = Array.isArray(event.payload?.commits)
        ? event.payload.commits
        : [];
      return commits
        .map((commit) =>
          isRecord(commit) && typeof commit.sha === "string"
            ? commit.sha
            : undefined,
        )
        .filter((sha): sha is string => Boolean(sha))
        .map((sha) => ({
          ...base,
          id: `push:${event.id}:${sha}`,
          kind: "pushedCommit",
          branch:
            typeof event.payload?.ref === "string" &&
            event.payload.ref.startsWith("refs/heads/")
              ? event.payload.ref.slice("refs/heads/".length)
              : undefined,
        }));
    }
    case "PullRequestEvent": {
      const action = event.payload?.action;
      const pullRequest = isRecord(event.payload?.pull_request)
        ? event.payload.pull_request
        : undefined;
      const number =
        typeof event.payload?.number === "number"
          ? event.payload.number
          : undefined;
      const merged = pullRequest?.merged === true;
      const pullRequestBase = {
        ...base,
        pullRequestHead: readPullRequestHead(pullRequest),
      };
      if (action === "opened" && number)
        return [
          {
            ...pullRequestBase,
            id: `pr:${repoName}#${number}:opened`,
            kind: "openedPullRequest",
          },
        ];
      if (action === "closed" && number && merged)
        return [
          {
            ...pullRequestBase,
            id: `pr:${repoName}#${number}:merged`,
            kind: "mergedPullRequest",
          },
        ];
      if (action === "closed" && number)
        return [
          {
            ...pullRequestBase,
            id: `pr:${repoName}#${number}:closed`,
            kind: "closedPullRequest",
          },
        ];
      return [];
    }
    case "IssuesEvent": {
      const action = event.payload?.action;
      const issue = isRecord(event.payload?.issue)
        ? event.payload.issue
        : undefined;
      const number =
        typeof issue?.number === "number" ? issue.number : undefined;
      if (action === "opened" && number)
        return [
          {
            ...base,
            id: `issue:${repoName}#${number}:opened`,
            kind: "openedIssue",
          },
        ];
      if (action === "closed" && number)
        return [
          {
            ...base,
            id: `issue:${repoName}#${number}:closed`,
            kind: "closedIssue",
          },
        ];
      return [];
    }
    case "CreateEvent": {
      const refType = event.payload?.ref_type;
      const ref =
        typeof event.payload?.ref === "string" ? event.payload.ref : event.id;
      const createKinds = {
        branch: "createdBranch",
        tag: "createdTag",
        repository: "createdRepository",
      } as const;
      const kind =
        typeof refType === "string"
          ? createKinds[refType as keyof typeof createKinds]
          : undefined;

      if (kind) {
        const id =
          refType === "repository"
            ? `repo:${repoName}:created`
            : `${refType}:${repoName}:${ref}:created`;
        return [{
          ...base,
          id,
          kind,
          branch:
            refType === "branch" && typeof event.payload?.ref === "string"
              ? event.payload.ref
              : undefined,
        }];
      }
      return [];
    }
    default:
      return [];
  }
}

function readPullRequestHead(
  pullRequest: Record<string, unknown> | undefined,
): ActivityRecord["pullRequestHead"] {
  const head = isRecord(pullRequest?.head) ? pullRequest.head : undefined;
  const repo = isRecord(head?.repo) ? head.repo : undefined;
  if (typeof head?.ref !== "string" || !repo) return undefined;

  let repoName = typeof repo.full_name === "string" ? repo.full_name : undefined;
  // Public event payloads can contain only the API URL, without full_name.
  if (!repoName && typeof repo.url === "string") {
    const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/.exec(repo.url);
    repoName = match?.[1];
  }
  return repoName ? { repoName, branch: head.ref } : undefined;
}

function dedupe(records: ActivityRecord[]): ActivityRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
