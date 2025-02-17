import { github, config } from "./config.ts";
import { Issue, IssueComment } from "./types.ts";

const { OWNER, REPO } = config;

/**
 * Cache for API responses to minimize GitHub API calls
 */
const cache = {
  issues: new Map<string, Issue[]>(),
  comments: new Map<number, IssueComment[]>(),
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const api = {
  async issues(githubOverride = github): Promise<Issue[]> {
    const cacheKey = `${OWNER}/${REPO}`;
    const cached = cache.issues.get(cacheKey);
    if (cached) return cached;

    try {
      const issues = await githubOverride.listIssues();
      cache.issues.set(cacheKey, issues);
      setTimeout(() => cache.issues.delete(cacheKey), CACHE_TTL);
      return issues;
    } catch (error) {
      console.error("Failed to fetch issues:", error instanceof Error ? error.message : error);
      throw new Error("Failed to fetch issues from GitHub");
    }
  },

  async comments(issueNumber: number, githubOverride = github): Promise<IssueComment[]> {
    const cached = cache.comments.get(issueNumber);
    if (cached) return cached;

    try {
      const comments = await githubOverride.listComments(issueNumber);
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
export const getOpenIssues = (githubOverride = github) => api.issues(githubOverride);

/**
 * Retrieves all QA-ready instances (open issues with "QA-Instance ready" in title)
 */
export const getQAReadyInstances = async (githubOverride = github) => {
  const issues = await api.issues(githubOverride);
  return issues.filter(i => i.title.includes("QA-Instance ready"));
};

/**
 * Retrieves all open issues with their comments
 */
export const getOpenIssuesWithComments = async (githubOverride = github) => {
  const issues = await api.issues(githubOverride);
  return Promise.all(
    issues.map(async i => ({ ...i, comments: await api.comments(i.number, githubOverride) }))
  );
};

/**
 * Clears the API cache
 */
export const clearCache = () => {
  cache.issues.clear();
  cache.comments.clear();
};
