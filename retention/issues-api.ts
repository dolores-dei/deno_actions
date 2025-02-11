import { octokit, config } from "./config.ts";
import { Issue, IssueComment } from "./types.ts";

const { OWNER, REPO } = config;

const api = {
  async issues() {
    const { data } = await octokit.rest.issues.listForRepo({
      owner: OWNER, repo: REPO,
      state: "open", per_page: 100
    });
    return data.map(({ number, title, created_at, updated_at, labels }) => ({
      number, title, created_at, updated_at,
      labels: labels.map(l => ({ name: typeof l === "string" ? l : l.name }))
    }));
  },

  async comments(issueNumber: number): Promise<IssueComment[]> {
    const { data } = await octokit.rest.issues.listComments({
      owner: OWNER, repo: REPO, issue_number: issueNumber
    });
    return data.map(({ created_at, user, body }) => ({
      created_at,
      user: { login: user.login },
      body
    }));
  }
};

export const getOpenIssues = () => api.issues();

export const getQAReadyInstances = async () =>
  (await api.issues()).filter(i => i.title.includes("QA-Instance ready"));

export const getOpenIssuesWithComments = async () => {
  const issues = await api.issues();
  return Promise.all(
    issues.map(async i => ({ ...i, comments: await api.comments(i.number) }))
  );
};
