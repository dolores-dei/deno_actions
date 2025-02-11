/**
 * Represents a GitHub user with minimal required information
 */
export interface GitHubUser {
  login: string;
}

/**
 * Represents a comment on a GitHub issue
 */
export interface IssueComment {
  created_at: string;
  user: GitHubUser;
  body?: string;
}

/**
 * Represents a GitHub issue with all necessary fields for retention processing
 */
export interface Issue {
  number: number;
  title: string;
  created_at: string;
  updated_at: string;
  user: GitHubUser;
  comments?: IssueComment[];
  labels: { name: string }[];
}

/**
 * Result of an operation performed on an issue
 */
export interface OperationResult {
  issueNumber: number;
  success: boolean;
  error?: string;
}

/**
 * Valid environment variable names used in the application
 */
export type EnvVarName = 'GITHUB_TOKEN' | 'INACTIVITY_THRESHOLD_HOURS' | 'RETENTION_HOURS';

/**
 * Application configuration with all required settings
 */
export interface AppConfig {
  /** GitHub personal access token */
  GITHUB_TOKEN: string;
  /** Number of hours before an instance is considered expired */
  RETENTION_HOURS: number;
  /** Number of hours of inactivity before closing a warned issue */
  INACTIVITY_THRESHOLD_HOURS: number;
  /** GitHub repository owner */
  OWNER: string;
  /** GitHub repository name */
  REPO: string;
  /** Label used to mark warned issues */
  WARNING_LABEL: string;
  /** GitHub username of the bot */
  BOT_USERNAME: string;
}

/**
 * Activity types that can occur on an issue
 */
export type ActivityType = 'creation' | 'comment';

/**
 * Represents an activity on an issue
 */
export interface Activity {
  date: Date;
  type: ActivityType;
  isBot: boolean;
}

/**
 * Represents the current state of an issue
 */
export interface IssueState {
  lastHumanActivity: Date;
  warningDate?: Date;
  hasWarning: boolean;
  hoursSinceActivity: number;
}
