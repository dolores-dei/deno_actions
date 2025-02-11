export interface GitHubUser {
  login: string;
}

export interface IssueComment {
  created_at: string;
  user: GitHubUser;
  body?: string;
}

export interface Issue {
  number: number;
  title: string;
  created_at: string;
  updated_at: string;
  user: GitHubUser;
  comments?: IssueComment[];
  labels: { name: string }[];
}

export interface OperationResult {
  issueNumber: number;
  success: boolean;
  error?: string;
}

export type EnvVarName = 'GITHUB_TOKEN' | 'INACTIVITY_THRESHOLD_HOURS' | 'RETENTION_HOURS';

export interface AppConfig {
  GITHUB_TOKEN: string;
  RETENTION_HOURS: number;
  INACTIVITY_THRESHOLD_HOURS: number;
  OWNER: string;
  REPO: string;
  WARNING_LABEL: string;
  BOT_USERNAME: string;
}
