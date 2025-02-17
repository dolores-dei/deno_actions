import { GitHubClient } from "./github-api.ts";

/**
 * Configuration schema with defaults and validation
 */
export interface Config {
  // GitHub settings
  GITHUB_TOKEN: string;
  OWNER: string;
  REPO: string;
  BOT_USERNAME: string;

  // Retention settings
  RETENTION_HOURS: number;
  INACTIVITY_THRESHOLD_HOURS: number;
  WARNING_LABEL: string;

  // Debug settings
  DEBUG: boolean;
}

/**
 * Default configuration values
 */
const defaults: Partial<Config> = {
  WARNING_LABEL: "retention-warning",
  DEBUG: false,
  BOT_USERNAME: "github-actions[bot]",
};

/**
 * Validates a number is positive
 */
function validatePositiveNumber(value: number, name: string): void {
  if (value <= 0) {
    throw new Error(`${name} must be a positive number, got: ${value}`);
  }
}

/**
 * Validates required string is not empty
 */
function validateRequiredString(value: string | undefined, name: string): void {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
}

/**
 * Loads and validates configuration from environment variables
 */
export function loadConfig(): Config {
  // Load from environment
  const githubRepo = Deno.env.get("GITHUB_REPO") || Deno.env.get("GITHUB_REPOSITORY");
  const repoName = githubRepo?.includes("/") ? githubRepo.split("/")[1] : githubRepo;

  const config = {
    GITHUB_TOKEN: Deno.env.get("GITHUB_TOKEN"),
    OWNER: Deno.env.get("GITHUB_OWNER") || Deno.env.get("GITHUB_REPOSITORY_OWNER"),
    REPO: repoName,
    BOT_USERNAME: Deno.env.get("BOT_USERNAME") || defaults.BOT_USERNAME,
    RETENTION_HOURS: Number(Deno.env.get("RETENTION_HOURS")),
    INACTIVITY_THRESHOLD_HOURS: Number(Deno.env.get("INACTIVITY_THRESHOLD_HOURS")),
    WARNING_LABEL: Deno.env.get("WARNING_LABEL") || defaults.WARNING_LABEL,
    DEBUG: Deno.env.get("DEBUG") === "true" || defaults.DEBUG,
  };

  // Validate required fields
  validateRequiredString(config.GITHUB_TOKEN, "GITHUB_TOKEN");
  validateRequiredString(config.OWNER, "GITHUB_OWNER");
  validateRequiredString(config.REPO, "GITHUB_REPO");
  validateRequiredString(config.WARNING_LABEL, "WARNING_LABEL");

  // Validate numbers
  validatePositiveNumber(config.RETENTION_HOURS, "RETENTION_HOURS");
  validatePositiveNumber(config.INACTIVITY_THRESHOLD_HOURS, "INACTIVITY_THRESHOLD_HOURS");

  if (config.INACTIVITY_THRESHOLD_HOURS >= config.RETENTION_HOURS) {
    throw new Error("INACTIVITY_THRESHOLD_HOURS must be less than RETENTION_HOURS");
  }

  return config as Config;
}

/**
 * Validates environment variables and returns config
 */
export function validateEnv(): void {
  const config = loadConfig();
  console.log("✅ Config:", {
    RETENTION_HOURS: config.RETENTION_HOURS,
    INACTIVITY_THRESHOLD_HOURS: config.INACTIVITY_THRESHOLD_HOURS,
    DEBUG: config.DEBUG,
  });
}

// Load config once at startup
export const config = loadConfig();

// Create GitHub client instance with retry and rate limiting
export const github = new GitHubClient(
  config.GITHUB_TOKEN,
  config.OWNER,
  config.REPO,
  config.DEBUG
);
