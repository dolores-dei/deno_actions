import { github, config } from "./config.ts";
import { Issue } from "./types.ts";

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
  user: GitHubUser;
  labels: GitHubLabel[];
  pull_request?: unknown;
}

interface GitHubError {
  message: string;
}

/**
 * Creates a test issue with the specified title
 */
export async function createTestIssue(title: string): Promise<Issue> {
  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: "Test issue created by retention test script",
      }),
    });

    const data = await response.json() as GitHubIssue | GitHubError;
    
    if (!response.ok) {
      throw new Error(`Failed to create issue: ${(data as GitHubError).message}`);
    }

    const issue = data as GitHubIssue;
    return {
      number: issue.number,
      title: issue.title,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      user: { login: issue.user?.login || "unknown" },
      labels: issue.labels?.map(label => ({ name: label.name })) || [],
    };
  } catch (error) {
    console.error("Failed to create test issue:", error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Updates an issue's title and/or body
 */
export async function updateIssue(issueNumber: number, data: { title?: string; body?: string }): Promise<void> {
  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json() as GitHubError;
      throw new Error(`Failed to update issue: ${error.message}`);
    }
  } catch (error) {
    console.error(`Failed to update issue #${issueNumber}:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Creates a comment on an issue
 */
export async function createComment(issueNumber: number, body: string): Promise<void> {
  try {
    await github.createComment(issueNumber, body);
  } catch (error) {
    console.error(`Failed to create comment on issue #${issueNumber}:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Updates a comment
 */
export async function updateComment(commentId: number, body: string): Promise<void> {
  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/comments/${commentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      const error = await response.json() as GitHubError;
      throw new Error(`Failed to update comment: ${error.message}`);
    }
  } catch (error) {
    console.error(`Failed to update comment #${commentId}:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Creates test scenarios for manual testing
 */
async function main() {
  try {
    console.log("Creating test scenarios...");

    // Create a fresh QA instance
    const fresh = await createTestIssue("[QA-Instance ready] Fresh instance");
    console.log("Created fresh instance:", fresh.number);

    // Create an old instance
    const old = await createTestIssue("[QA-Instance ready] Old instance");
    console.log("Created old instance:", old.number);

    // Update the old instance's creation date to be older
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - (config.RETENTION_HOURS + 1));
    await updateIssue(old.number, {
      body: `Test issue created at ${oldDate.toISOString()}`,
    });

    // Clean up old test issues
    console.log("Cleaning up previous test issues...");
    
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?state=all&per_page=100`, {
      headers: {
        'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch issues: ${response.statusText}`);
    }

    const issues = await response.json() as GitHubIssue[];
    let cleanedCount = 0;

    for (const issue of issues) {
      if (issue.title.includes("[test-") && !issue.pull_request) {
        const closeResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${issue.number}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            state: "closed",
          }),
        });

        if (!closeResponse.ok) {
          console.warn(`Failed to close issue #${issue.number}: ${closeResponse.statusText}`);
          continue;
        }

        cleanedCount++;
      }
    }

    console.log(`Cleaned up ${cleanedCount} test issues`);
    console.log("Test scenarios created successfully");
  } catch (error) {
    console.error("Failed to create test scenarios:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
} 