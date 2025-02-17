import { Issue, IssueComment } from "./types.ts";

const BASE_URL = 'https://api.github.com';

interface GitHubErrorResponse {
  message: string;
  documentation_url?: string;
}

interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

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
  user: GitHubUser;
  labels: GitHubLabel[];
}

interface GitHubComment {
  created_at: string;
  user: GitHubUser;
  body: string;
}

export class GitHubClient {
  constructor(
    private token: string,
    private owner: string,
    private repo: string,
    private debug = false
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Parse rate limit info
    const rateLimit: GitHubRateLimit = {
      limit: Number(response.headers.get('x-ratelimit-limit')),
      remaining: Number(response.headers.get('x-ratelimit-remaining')),
      reset: Number(response.headers.get('x-ratelimit-reset')),
    };

    if (this.debug) {
      console.log(`[GitHub API] ${options.method || 'GET'} ${path} - Rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`GitHub API error: ${(data as GitHubErrorResponse).message}`);
    }

    return data as T;
  }

  private async retryWithRateLimit<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (retries > 0 && error instanceof Error && error.message.includes('API rate limit exceeded')) {
        const waitTime = 1000 * 60; // Wait 1 minute before retrying
        if (this.debug) {
          console.log(`Rate limit hit, waiting ${waitTime}ms before retry. ${retries} retries left`);
        }
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.retryWithRateLimit(fn, retries - 1);
      }
      throw error;
    }
  }

  async listIssues(): Promise<Issue[]> {
    return this.retryWithRateLimit(async () => {
      const data = await this.request<GitHubIssue[]>(`/repos/${this.owner}/${this.repo}/issues?state=open&per_page=100`);
      return data.map(issue => ({
        number: issue.number,
        title: issue.title,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        user: { login: issue.user.login },
        labels: issue.labels.map(label => ({ name: label.name })),
      }));
    });
  }

  async listComments(issueNumber: number): Promise<IssueComment[]> {
    return this.retryWithRateLimit(async () => {
      const data = await this.request<GitHubComment[]>(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`);
      return data.map(comment => ({
        created_at: comment.created_at,
        user: { login: comment.user.login },
        body: comment.body,
      }));
    });
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    await this.retryWithRateLimit(() => 
      this.request<void>(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
    );
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.retryWithRateLimit(() => 
      this.request<void>(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`, {
        method: 'POST',
        body: JSON.stringify({ labels }),
      })
    );
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    await this.retryWithRateLimit(() => 
      this.request<void>(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
        method: 'DELETE',
      })
    );
  }

  async updateIssue(issueNumber: number, data: { state?: 'open' | 'closed' }): Promise<void> {
    await this.retryWithRateLimit(() => 
      this.request<void>(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    );
  }
} 