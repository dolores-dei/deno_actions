import { octokit, config } from "./config.ts";

const SCENARIOS = {
  FRESH_INSTANCE: {
    title: "QA-Instance ready [test-fresh]",
    body: "Test scenario: Fresh instance that should not get warning",
  },
  EXPIRED_NO_WARNING: {
    title: "QA-Instance ready [test-expired]",
    body: "Test scenario: Old instance that should get warning",
  },
  WARNED_NO_ACTIVITY: {
    title: "QA-Instance ready [test-warned-inactive]",
    body: "Test scenario: Warned instance with no activity that should auto-close",
  },
  WARNED_WITH_ACTIVITY: {
    title: "QA-Instance ready [test-warned-active]",
    body: "Test scenario: Warned instance with recent activity that should have warning removed",
  },
  MULTIPLE_ACTIVITIES: {
    title: "QA-Instance ready [test-multiple-activities]",
    body: "Test scenario: Instance with multiple activities to test retention timer reset",
  }
};

/**
 * Creates all test scenarios in the repository
 */
async function setupScenarios() {
  console.log("Setting up test scenarios...");

  // Clean up any existing test issues
  await cleanupTestIssues();

  const now = new Date();
  const hoursAgoDate = (hours: number) => 
    new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  // Create fresh instance (should not get warning)
  await createIssue(SCENARIOS.FRESH_INSTANCE, hoursAgoDate(0.1));

  // Create expired instance (should get warning)
  await createIssue(SCENARIOS.EXPIRED_NO_WARNING, hoursAgoDate(0.3));
  
  // Create warned instance with no activity (should auto-close)
  const warnedInactiveIssue = await createIssue(SCENARIOS.WARNED_NO_ACTIVITY, hoursAgoDate(0.3));
  await addWarning(warnedInactiveIssue.number);

  // Create warned instance with activity (should remove warning)
  const warnedActiveIssue = await createIssue(SCENARIOS.WARNED_WITH_ACTIVITY, hoursAgoDate(0.3));
  await addWarning(warnedActiveIssue.number);
  await addComment(warnedActiveIssue.number, "Keeping this QA instance active!");

  // Create instance with multiple activities
  const multiActivityIssue = await createIssue(SCENARIOS.MULTIPLE_ACTIVITIES, hoursAgoDate(0.3));
  await addComment(multiActivityIssue.number, "First activity");
  await addComment(multiActivityIssue.number, "Second activity");
  await addComment(multiActivityIssue.number, "Third activity");

  console.log("✅ All test scenarios created!");
}

/**
 * Removes all test issues from previous runs
 */
async function cleanupTestIssues() {
  console.log("Cleaning up previous test issues...");
  
  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner: config.OWNER,
    repo: config.REPO,
    state: "all",
    per_page: 100,
  });

  const testIssues = issues.filter(issue => 
    issue.title.includes("[test-") && 
    !issue.pull_request // Exclude PRs
  );

  for (const issue of testIssues) {
    await octokit.rest.issues.update({
      owner: config.OWNER,
      repo: config.REPO,
      issue_number: issue.number,
      state: "closed",
    });
  }

  console.log(`Cleaned up ${testIssues.length} test issues`);
}

/**
 * Creates a new issue
 */
async function createIssue(scenario: { title: string; body: string }, created_at?: string) {
  const { data: issue } = await octokit.rest.issues.create({
    owner: config.OWNER,
    repo: config.REPO,
    title: scenario.title,
    body: scenario.body,
  });

  if (created_at) {
    // Update the creation date using a direct API call
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      owner: config.OWNER,
      repo: config.REPO,
      issue_number: issue.number,
      created_at: created_at
    });
  }

  console.log(`Created issue #${issue.number}: ${scenario.title}`);
  return issue;
}

/**
 * Adds a warning label and comment to an issue
 */
async function addWarning(issueNumber: number) {
  await octokit.rest.issues.addLabels({
    owner: config.OWNER,
    repo: config.REPO,
    issue_number: issueNumber,
    labels: [config.WARNING_LABEL],
  });

  await octokit.rest.issues.createComment({
    owner: config.OWNER,
    repo: config.REPO,
    issue_number: issueNumber,
    body: "⚠️ **QA Instance Retention Warning**\n\nTest warning comment",
  });

  console.log(`Added warning to issue #${issueNumber}`);
}

/**
 * Adds a comment to an issue
 */
async function addComment(issueNumber: number, body: string) {
  await octokit.rest.issues.createComment({
    owner: config.OWNER,
    repo: config.REPO,
    issue_number: issueNumber,
    body,
  });

  console.log(`Added comment to issue #${issueNumber}`);
}

// Run setup if this is the main module
if (import.meta.main) {
  await setupScenarios();
} 