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

  // Create fresh instance (should not get warning)
  // Created just now, so it's well within retention period
  await createIssue(SCENARIOS.FRESH_INSTANCE);
  console.log("Created fresh instance");

  // Create expired instance (should get warning)
  // Created just over retention period ago
  await createIssue(SCENARIOS.EXPIRED_NO_WARNING);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  console.log("Created expired instance");
  
  // Create warned instance with no activity (should auto-close)
  // Created and warned long enough ago to trigger auto-close
  const warnedInactiveIssue = await createIssue(SCENARIOS.WARNED_NO_ACTIVITY);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  await addWarning(warnedInactiveIssue.number);
  console.log("Created warned inactive instance");

  // Create warned instance with activity (should remove warning)
  // Created a while ago, warned, but has recent activity
  const warnedActiveIssue = await createIssue(SCENARIOS.WARNED_WITH_ACTIVITY);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  await addWarning(warnedActiveIssue.number);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  await addComment(warnedActiveIssue.number, "Keeping this QA instance active!");
  console.log("Created warned active instance");

  // Create instance with multiple activities
  // Created a while ago but kept active with regular comments
  const multiActivityIssue = await createIssue(SCENARIOS.MULTIPLE_ACTIVITIES);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  await addComment(multiActivityIssue.number, "First activity");
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  await addComment(multiActivityIssue.number, "Second activity");
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  await addComment(multiActivityIssue.number, "Third activity");
  console.log("Created multiple activities instance");

  console.log("\n✅ All test scenarios created!");
  console.log("\nTest scenario timing:");
  console.log("- Fresh instance: created just now (should not get warning)");
  console.log("- Expired instance: created ~5s ago (should get warning)");
  console.log("- Warned inactive: created ~15s ago, warned ~10s ago (should auto-close)");
  console.log("- Warned active: created ~30s ago, warned ~25s ago, activity ~20s ago (warning should be removed)");
  console.log("- Multiple activities: created ~45s ago, activities at ~40s, ~35s, and ~30s ago (should stay active)");
  console.log("\nWaiting 60 seconds for timestamps to settle...");
  await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60s
  console.log("\nDone waiting. You can now run the retention check with:");
  console.log("RETENTION_HOURS=0.02 (72 seconds)");
  console.log("INACTIVITY_THRESHOLD_HOURS=0.01 (36 seconds)");
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
 * Creates a new issue with a specific creation date
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
 * Adds a warning label and comment to an issue with a specific date
 */
async function addWarning(issueNumber: number, created_at?: string) {
  await octokit.rest.issues.addLabels({
    owner: config.OWNER,
    repo: config.REPO,
    issue_number: issueNumber,
    labels: [config.WARNING_LABEL],
  });

  const { data: comment } = await octokit.rest.issues.createComment({
    owner: config.OWNER,
    repo: config.REPO,
    issue_number: issueNumber,
    body: "⚠️ **QA Instance Retention Warning**\n\nTest warning comment",
  });

  if (created_at) {
    // Update the comment's creation date
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner: config.OWNER,
      repo: config.REPO,
      comment_id: comment.id,
      body: comment.body || "",
      created_at: created_at
    });
  }

  console.log(`Added warning to issue #${issueNumber}`);
}

/**
 * Adds a comment to an issue with a specific date
 */
async function addComment(issueNumber: number, body: string, created_at?: string) {
  const { data: comment } = await octokit.rest.issues.createComment({
    owner: config.OWNER,
    repo: config.REPO,
    issue_number: issueNumber,
    body,
  });

  if (created_at) {
    // Update the comment's creation date
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner: config.OWNER,
      repo: config.REPO,
      comment_id: comment.id,
      body: body,
      created_at: created_at
    });
  }

  console.log(`Added comment to issue #${issueNumber}`);
}

// Run setup if this is the main module
if (import.meta.main) {
  await setupScenarios();
} 