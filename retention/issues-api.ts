import { octokit, config } from "./config.ts";
import { Issue, IssueComment } from "./types.ts";

const { OWNER, REPO } = config;

interface GitHubLabel {
  name: string;
}

interface GitHubUser {
  login: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  created_at: string;
  updated_at: string;
  labels: GitHubLabel[];
  user: GitHubUser;
}

interface GitHubComment {
  created_at: string;
  user: GitHubUser;
  body?: string;
}

/**
 * Cache for API responses to minimize GitHub API calls
 */
const cache = {
  issues: new Map<string, Issue[]>(),
  comments: new Map<number, IssueComment[]>(),
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const api = {
  async issues(): Promise<Issue[]> {
    const cacheKey = `${OWNER}/${REPO}`;
    const cached = cache.issues.get(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await octokit.rest.issues.listForRepo({
        owner: OWNER,
        repo: REPO,
        state: "open",
        per_page: 100,
      });

      const issues = data.map(({ number, title, created_at, updated_at, labels, user }: GitHubIssue) => ({
        number,
        title,
        created_at,
        updated_at,
        user: { login: user.login },
        labels: labels.map((l: GitHubLabel) => ({ name: l.name })),
      }));

      cache.issues.set(cacheKey, issues);
      setTimeout(() => cache.issues.delete(cacheKey), CACHE_TTL);

      return issues;
    } catch (error) {
      console.error("Failed to fetch issues:", error instanceof Error ? error.message : error);
      throw new Error("Failed to fetch issues from GitHub");
    }
  },

  async comments(issueNumber: number): Promise<IssueComment[]> {
    const cached = cache.comments.get(issueNumber);
    if (cached) return cached;

    try {
      const { data } = await octokit.rest.issues.listComments({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
      });

      const comments = data.map(({ created_at, user, body }: GitHubComment) => ({
        created_at,
        user: { login: user.login },
        body,
      }));

      cache.comments.set(issueNumber, comments);
      setTimeout(() => cache.comments.delete(issueNumber), CACHE_TTL);

      return comments;
    } catch (error) {
      console.error(`Failed to fetch comments for issue #${issueNumber}:`, error instanceof Error ? error.message : error);
      throw new Error(`Failed to fetch comments for issue #${issueNumber}`);
    }
  },
};

/**
 * Retrieves all open issues from the repository
 */
export const getOpenIssues = () => api.issues();

/**
 * Retrieves all QA-ready instances (open issues with "QA-Instance ready" in title)
 */
export const getQAReadyInstances = async () => {
  const issues = await api.issues();
  return issues.filter(i => i.title.includes("QA-Instance ready"));
};

/**
 * Retrieves all open issues with their comments
 */
export const getOpenIssuesWithComments = async () => {
  const issues = await api.issues();
  return Promise.all(
    issues.map(async i => ({ ...i, comments: await api.comments(i.number) }))
  );
};

/**
 * Clears the API cache
 */
export const clearCache = () => {
  cache.issues.clear();
  cache.comments.clear();
};
