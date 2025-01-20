import { Octokit } from "https://esm.sh/octokit?dts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const RETENTION_HOURS = Number(Deno.env.get("RETENTION_HOURS"));
const INACTIVITY_THRESHOLD_HOURS = Number(Deno.env.get("INACTIVITY_THRESHOLD_HOURS"));
const OWNER = "dolores-dei";
const REPO = "deno_actions";

// Debug print environment variables
console.log("Environment Variables:");
console.log({
  GITHUB_TOKEN: GITHUB_TOKEN ? "***" : undefined,  // Hide actual token
  INACTIVITY_THRESHOLD_HOURS,
  RETENTION_HOURS,
  OWNER,
  REPO
});

const requiredEnvVars = ["GITHUB_TOKEN", "INACTIVITY_THRESHOLD_HOURS", "RETENTION_HOURS"] as const;
type EnvVar = typeof requiredEnvVars[number];

interface EnvVarEntry {
  key: EnvVar;
  value: string | undefined;
}

const checkEnvVars = (): EnvVar[] =>
  requiredEnvVars
    .map(key => ({ key, value: Deno.env.get(key) }))
    .filter((entry): entry is EnvVarEntry & { value: undefined } => entry.value === undefined)
    .map(({ key }) => key);

const missingVars = checkEnvVars();
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
}

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Function to fetch open issues
async function getOpenIssues() {
  try {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      state: 'open',
      per_page: 100  // Adjust if you need more
    });

    return issues.map(issue => ({
      number: issue.number,
      title: issue.title,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      url: issue.html_url
    }));
  } catch (error) {
    console.error('Error fetching open issues:', error);
    throw error;
  }
}

// returns an object containing all qa instances
async function getQAReadyInstances() {
  try {
    const issues = await getOpenIssues();
    return issues.filter(issue => issue.title.includes("QA-Instance ready"));
  } catch (error) {
    console.error('Error getting QA ready instances:', error);
    throw error;
  }
}

function isOlderThanRetentionPeriod(date: string): boolean {
  const issueDate = new Date(date);
  const now = new Date();
  const hoursDifference = (now.getTime() - issueDate.getTime()) / (1000 * 60 * 60);
  return hoursDifference > RETENTION_HOURS;
}

async function getExpiredQAInstances() {
  try {
    const qaReadyInstances = await getQAReadyInstances();
    return qaReadyInstances.filter(issue => isOlderThanRetentionPeriod(issue.created_at));
  } catch (error) {
    console.error('Error getting expired QA instances:', error);
    throw error;
  }
}

async function main() {
  try {
    const allIssues = await getOpenIssues();
    console.log("found" + allIssues.length + "issues");
    const expiredInstances = await getExpiredQAInstances();
    console.log('Expired QA Instances:', JSON.stringify(expiredInstances, null, 2));
    console.log(`Found ${expiredInstances.length} QA instances older than the retention period  (${RETENTION_HOURS} hours`);
  } catch (error) {
    console.error('Error in main:', error);
    Deno.exit(1);
  }
}

main();
