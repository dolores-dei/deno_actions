import { config, validateEnv } from "./config.ts";
import { getOpenIssues, getQAReadyInstances } from "./issues-api.ts";
import { getExpiredQAInstances, getInactiveWarnedIssues, addWarningToIssues, closeInactiveIssues } from "./retention.ts";
import { Issue } from "./types.ts";

/**
 * Prints a section header to the console
 */
function logSection(title: string): void {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80) + "\n");
}

/**
 * Generates the warning message for expired QA instances
 */
function generateWarningMessage(): string {
  return `⚠️ **QA Instance Retention Warning**

This QA instance has exceeded the ${config.RETENTION_HOURS}h retention period.
Created: ${new Date().toISOString()}

**What does this mean?**
- If there is no activity within ${config.INACTIVITY_THRESHOLD_HOURS}h, this issue will be automatically closed
- Any comment from a team member will reset the retention timer
- The warning label will be removed after new activity

**Actions needed:**
1. If you still need this QA instance:
   - Add a comment explaining why it's still needed
   - The retention timer will reset automatically
2. If you no longer need this instance:
   - You can close this issue now
   - Or let it auto-close after ${config.INACTIVITY_THRESHOLD_HOURS}h of inactivity

For questions about this process, please contact the infrastructure team.`;
}

/**
 * Processes warnings for expired QA instances
 */
async function processWarnings(needWarning: Issue[]): Promise<void> {
  if (needWarning.length === 0) {
    console.log("✓ No expired instances need warnings");
    return;
  }

  console.log(`⚠️ Adding warnings to ${needWarning.length} expired instances...`);
  const results = await addWarningToIssues(needWarning, generateWarningMessage());
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✓ Warning results: ${succeeded} succeeded, ${failed} failed`);

  if (failed > 0) {
    results
      .filter(r => !r.success)
      .forEach(r => console.error(`Failed to warn issue #${r.issueNumber}:`, r.error));
  }
}

/**
 * Processes inactive issues that need to be closed
 */
async function processInactiveIssues(inactiveIssues: Issue[]): Promise<void> {
  if (inactiveIssues.length === 0) {
    console.log("✓ No inactive warned issues to close");
    return;
  }

  console.log(`🔒 Found ${inactiveIssues.length} inactive warned issues to close...`);
  const results = await closeInactiveIssues(inactiveIssues);
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✓ Closing results: ${succeeded} succeeded, ${failed} failed`);

  if (failed > 0) {
    results
      .filter(r => !r.success)
      .forEach(r => console.error(`Failed to close issue #${r.issueNumber}:`, r.error));
  }
}

/**
 * Main function that runs the retention check process
 */
async function main() {
  try {
    logSection("Starting QA Instance Retention Check");
    validateEnv();

    // Log initial state
    const [allIssues, qaIssues] = await Promise.all([
      getOpenIssues(),
      getQAReadyInstances(),
    ]);

    console.log("📊 Current state:", {
      totalOpenIssues: allIssues.length,
      qaInstances: qaIssues.length,
    });

    // Get list of issues that need warnings and those that are inactive
    const needWarning = await getExpiredQAInstances();
    const inactiveIssues = await getInactiveWarnedIssues();

    // Filter out any issues that just received warnings from the inactive list
    const trulyInactiveIssues = inactiveIssues.filter(inactive =>
      !needWarning.some(warning => warning.number === inactive.number)
    );

    // Process warnings and inactive issues
    await Promise.all([
      processWarnings(needWarning),
      processInactiveIssues(trulyInactiveIssues),
    ]);

    logSection("Retention Check Completed Successfully");
  } catch (error) {
    console.error("❌ Fatal error:", error instanceof Error ? error.message : error);
    logSection("Retention Check Failed");
    Deno.exit(1);
  }
}

// Run the main function if this is the entry point
if (import.meta.main) {
  main().catch(error => {
    console.error("❌ Fatal error:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  });
}
