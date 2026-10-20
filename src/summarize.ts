import type { ActivityKind, ActivityRecord, UserActivityResult } from "./types.js";

export type RepoSummary = {
  repoName: string;
  repoUrl: string;
  counts: Record<ActivityKind, number>;
  sentence: string;
};

export type UserSummary = {
  username: string;
  label: string;
  error?: string;
  totalCount: number;
  repositories: RepoSummary[];
};

export type ReportSummary = {
  users: UserSummary[];
  activeUserCount: number;
  repositoriesTouchedCount: number;
  hasFailures: boolean;
};

const kindLabels: Record<ActivityKind, [singular: string, plural: string]> = {
  pushedCommit: ["pushed 1 commit", "pushed {count} commits"],
  openedPullRequest: ["opened 1 PR", "opened {count} PRs"],
  closedPullRequest: ["closed 1 PR", "closed {count} PRs"],
  mergedPullRequest: ["merged 1 PR", "merged {count} PRs"],
  openedIssue: ["opened 1 issue", "opened {count} issues"],
  closedIssue: ["closed 1 issue", "closed {count} issues"],
  createdBranch: ["created 1 branch", "created {count} branches"],
  createdTag: ["created 1 tag", "created {count} tags"],
  createdRepository: ["created 1 repository", "created {count} repositories"],
  starredRepository: ["starred 1 repository", "starred {count} repositories"],
};

const displayOrder: ActivityKind[] = [
  "pushedCommit",
  "openedPullRequest",
  "closedPullRequest",
  "mergedPullRequest",
  "openedIssue",
  "closedIssue",
  "createdBranch",
  "createdTag",
  "createdRepository",
  "starredRepository",
];

export function summarizeResults(results: UserActivityResult[]): ReportSummary {
  const repoNames = new Set<string>();

  const users = results.map((result) => {
    const byRepo = new Map<string, RepoSummary>();
    const pullRequestRepos = findPullRequestRepos(result.records);

    for (const record of result.records) {
      const repo = (record.branch
        ? pullRequestRepos.get(branchKey(record.repoName, record.branch))
        : undefined) ?? record;
      repoNames.add(repo.repoName.toLowerCase());
      const repoKey = repo.repoName.toLowerCase();
      const existing = byRepo.get(repoKey) ?? {
        repoName: repo.repoName,
        repoUrl: repo.repoUrl,
        counts: zeroCounts(),
        sentence: "",
      };
      existing.counts[record.kind] += 1;
      byRepo.set(repoKey, existing);
    }

    const repositories = [...byRepo.values()]
      .map((repo) => ({ ...repo, sentence: countSentence(repo.counts) }))
      .sort((a, b) => a.repoName.localeCompare(b.repoName));

    return {
      username: result.user.username,
      label: result.user.label,
      error: result.error,
      totalCount: result.records.length,
      repositories,
    };
  });

  return {
    users,
    activeUserCount: users.filter((user) => user.totalCount > 0).length,
    repositoriesTouchedCount: repoNames.size,
    hasFailures: users.some((user) => Boolean(user.error)),
  };
}

function findPullRequestRepos(records: ActivityRecord[]) {
  const repos = new Map<
    string,
    { repoName: string; repoUrl: string } | null
  >();
  for (const record of records) {
    const head = record.pullRequestHead;
    if (!head) continue;
    const key = branchKey(head.repoName, head.branch);
    const existing = repos.get(key);
    // A branch used for PRs to different repositories has no single destination.
    if (existing === null) continue;
    if (existing && existing.repoName.toLowerCase() !== record.repoName.toLowerCase()) {
      repos.set(key, null);
    } else {
      repos.set(key, { repoName: record.repoName, repoUrl: record.repoUrl });
    }
  }
  return repos;
}

function branchKey(repoName: string, branch: string): string {
  return JSON.stringify([repoName.toLowerCase(), branch]);
}

function zeroCounts(): Record<ActivityKind, number> {
  return {
    pushedCommit: 0,
    openedPullRequest: 0,
    closedPullRequest: 0,
    mergedPullRequest: 0,
    openedIssue: 0,
    closedIssue: 0,
    createdBranch: 0,
    createdTag: 0,
    createdRepository: 0,
    starredRepository: 0,
  };
}

function countSentence(counts: Record<ActivityKind, number>): string {
  const parts = displayOrder.flatMap((kind) => {
    const count = counts[kind];
    if (count === 0) return [];
    const [singular, plural] = kindLabels[kind];
    return count === 1 ? singular : plural.replace("{count}", String(count));
  });

  if (parts.length === 0) return "No public activity found.";
  if (parts.length === 1) return capitalize(`${parts[0]}.`);
  if (parts.length === 2) return capitalize(`${parts[0]} and ${parts[1]}.`);
  return capitalize(`${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}.`);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
