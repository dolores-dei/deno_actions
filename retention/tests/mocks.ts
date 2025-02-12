import { Issue, IssueComment } from "../types.ts";

export const WARNING_LABEL = "retention-warning";
export const BOT_USERNAME = "github-actions[bot]";
export const RETENTION_HOURS = 48;
export const INACTIVITY_THRESHOLD_HOURS = 24;

/**
 * Creates a mock issue with the given parameters
 */
export function createMockIssue(params: {
  number: number;
  created_at: string;
  labels?: Array<{ name: string }>;
  comments?: IssueComment[];
  user?: { login: string };
  state?: "open" | "closed";
}): Issue {
  return {
    number: params.number,
    title: `Test Issue #${params.number}`,
    created_at: params.created_at,
    updated_at: params.created_at,
    user: params.user || { login: "test-user" },
    labels: params.labels || [],
    comments: params.comments || [],
    state: params.state || "open",
  };
}

/**
 * Creates a mock comment with the given parameters
 */
export function createMockComment(params: {
  created_at: string;
  user_login: string;
  body?: string;
}): IssueComment {
  return {
    created_at: params.created_at,
    user: { login: params.user_login },
    body: params.body || "Test comment",
  };
}

/**
 * Helper to create timestamps relative to now
 */
export function hoursAgo(hours: number): string {
  const date = new Date(Date.now() - hours * 60 * 60 * 1000);
  return date.toISOString();
}

/**
 * Mock Octokit instance for testing
 */
export class MockOctokit {
  private issues: Map<number, Issue> = new Map();

  constructor(initialIssues: Issue[] = []) {
    initialIssues.forEach(issue => this.issues.set(issue.number, issue));
  }

  get rest() {
    return {
      issues: {
        async addLabels({ owner, repo, issue_number, labels }: {
          owner: string;
          repo: string;
          issue_number: number;
          labels: string[];
        }) {
          const issue = this.issues.get(issue_number);
          if (!issue) throw new Error(`Issue #${issue_number} not found`);
          labels.forEach(label => issue.labels.push({ name: label }));
        },

        async removeLabel({ owner, repo, issue_number, name }: {
          owner: string;
          repo: string;
          issue_number: number;
          name: string;
        }) {
          const issue = this.issues.get(issue_number);
          if (!issue) throw new Error(`Issue #${issue_number} not found`);
          issue.labels = issue.labels.filter(l => l.name !== name);
        },

        async createComment({ owner, repo, issue_number, body }: {
          owner: string;
          repo: string;
          issue_number: number;
          body: string;
        }) {
          const issue = this.issues.get(issue_number);
          if (!issue) throw new Error(`Issue #${issue_number} not found`);
          
          const comment = createMockComment({
            created_at: new Date().toISOString(),
            user_login: BOT_USERNAME,
            body,
          });
          
          if (!issue.comments) issue.comments = [];
          issue.comments.push(comment);
        },

        async update({ owner, repo, issue_number, state }: {
          owner: string;
          repo: string;
          issue_number: number;
          state: string;
        }) {
          const issue = this.issues.get(issue_number);
          if (!issue) throw new Error(`Issue #${issue_number} not found`);
          issue.state = state as "open" | "closed";
        }
      }
    };
  }

  getIssue(issueNumber: number): Issue | undefined {
    return this.issues.get(issueNumber);
  }

  getAllIssues(): Issue[] {
    return Array.from(this.issues.values());
  }
} 