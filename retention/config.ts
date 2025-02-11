import { Octokit } from "https://esm.sh/octokit@4.1.0?dts";
import { AppConfig } from "./types.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Load environment variables from .env file
await load({ export: true });

const env = {
  number: (name: string, defaultValue: number): number => {
    const val = Number(Deno.env.get(name));
    return !isNaN(val) ? val : defaultValue;
  },
  string: (name: string, required = false): string => {
    const val = Deno.env.get(name);
    if (!val && required) throw new Error(`Missing required env var: ${name}`);
    return val || "";
  }
};

export const config: AppConfig = {
  GITHUB_TOKEN: env.string("GITHUB_TOKEN", true),
  RETENTION_HOURS: env.number("RETENTION_HOURS", 0.1),
  INACTIVITY_THRESHOLD_HOURS: env.number("INACTIVITY_THRESHOLD_HOURS", 0.05),
  OWNER: env.string("GITHUB_OWNER", true),
  REPO: env.string("GITHUB_REPO", true),
  WARNING_LABEL: "retention-warning",
  BOT_USERNAME: env.string("GITHUB_OWNER", true)
} as const;

export const octokit = new Octokit({
  auth: config.GITHUB_TOKEN,
  retry: { enabled: true, retries: 3 },
  throttle: {
    enabled: true,
    onRateLimit: (retryAfter: number) => {
      console.warn(`Rate limit hit, retrying after ${retryAfter}s`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter: number) => {
      console.warn(`Secondary rate limit hit, retrying after ${retryAfter}s`);
      return true;
    }
  }
});

export function validateEnv(): void {
  const { RETENTION_HOURS, INACTIVITY_THRESHOLD_HOURS } = config;

  if (RETENTION_HOURS <= 0) throw new Error("RETENTION_HOURS must be > 0");
  if (INACTIVITY_THRESHOLD_HOURS <= 0) throw new Error("INACTIVITY_THRESHOLD_HOURS must be > 0");
  if (INACTIVITY_THRESHOLD_HOURS >= RETENTION_HOURS) {
    throw new Error("INACTIVITY_THRESHOLD_HOURS must be < RETENTION_HOURS");
  }

  console.log("✅ Config:", { RETENTION_HOURS, INACTIVITY_THRESHOLD_HOURS });
}
