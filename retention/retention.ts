import { octokit as defaultOctokit, config } from "./config.ts";
import { Issue, OperationResult, Activity, IssueState } from "./types.ts";
import { getQAReadyInstances, getOpenIssuesWithComments } from "./issues-api.ts";

const { OWNER, REPO, WARNING_LABEL, BOT_USERNAME, RETENTION_HOURS, INACTIVITY_THRESHOLD_HOURS } = config;

/**
 * Calculates the number of hours between now and a given date
 */
const hoursSince = (date: string): number =>
  Number(((Date.now() - new Date(date).getTime()) / 3600000).toFixed(2));

/**
 * debug logging helper with timing information
 */
const debug = (msg: string, data: unknown, startTime?: number): void => {
  if (!config.DEBUG) return;

  const logData = {
    ...typeof data === 'object' ? data : { value: data },
    ...(startTime ? { ms: Date.now() - startTime } : {}),
  };

  // Format the message to be more concise
  const formattedData = Object.entries(logData)
    .map(([k, v]) => {
      if (k === 'ms') return `${v}ms`;
      if (typeof v === 'number') return `${k}=${v}`;
      if (typeof v === 'string') return `${k}="${v}"`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .join(' ');

  console.log(`[${msg}] ${formattedData}`);
};

/**
 * Checks if one date is after another
 */
const isAfter = (date1: Date, date2: Date): boolean => date1.getTime() > date2.getTime();

/**
 * Gets all activity on an issue, including comments and label changes
 */
const getIssueActivity = (issue: Issue): Activity[] => {
  const activities: Activity[] = [];

  // Add issue creation
  activities.push({
    type: 'create',
    date: new Date(issue.created_at),
    isBot: issue.user.login === BOT_USERNAME,
  });

  // Add comments
  issue.comments?.forEach(comment => {
    activities.push({
      type: 'comment',
      date: new Date(comment.created_at),
      isBot: comment.user.login === BOT_USERNAME,
    });
  });

  return activities.sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * Gets the current state of an issue including last activity and warning status
 */
const getIssueState = (issue: Issue): IssueState => {
  const activities = getIssueActivity(issue);
  const hasWarning = issue.labels.some(l => l.name === WARNING_LABEL);

  // Find the last warning comment if any
  const warningComment = activities
    .filter(a => a.isBot && a.type === 'comment')
    .find(a => issue.comments?.find(c =>
      c.user.login === BOT_USERNAME &&
      c.body?.includes('QA instance inactive for') &&
      new Date(c.created_at).getTime() === a.date.getTime()
    ));

  // Find the last human activity
  const humanActivities = activities.filter(a => !a.isBot);
  const lastHumanActivity = humanActivities.length > 0
    ? humanActivities.reduce((latest, current) =>
        current.date.getTime() > latest.date.getTime() ? current : latest
      ).date
    : new Date(issue.created_at);

  const hoursSinceActivity = hoursSince(lastHumanActivity.toISOString());
  
  debug("Issue state calculated", {
    issueNumber: issue.number,
    hasWarning,
    hoursSinceActivity,
    lastHumanActivity: lastHumanActivity.toISOString(),
    warningDate: warningComment?.date.toISOString(),
    totalActivities: activities.length,
    humanActivities: humanActivities.length,
  });

  return {
    lastHumanActivity,
    warningDate: warningComment?.date,
    hasWarning,
    hoursSinceActivity,
  };
};

/**
 * Gets all QA instances that have expired but haven't been warned yet
 */
export async function getExpiredQAInstances(octokitOverride = defaultOctokit): Promise<Issue[]> {
  const startTime = Date.now();
  try {
    const [instances, instancesWithComments] = await Promise.all([
      getQAReadyInstances(octokitOverride),
      getOpenIssuesWithComments(octokitOverride),
    ]);

    debug("Fetched QA instances", { 
      totalInstances: instances.length,
      totalWithComments: instancesWithComments.length 
    }, startTime);

    // First, check all issues with warning labels for activity and track which ones had labels removed
    const removedWarningLabels = new Set<number>();
    await Promise.all(instancesWithComments
      .filter(issue => issue.labels.some(l => l.name === WARNING_LABEL))
      .map(async (issue) => {
        const { lastHumanActivity, warningDate } = getIssueState(issue);
        // Only remove warning if there's been activity after the warning
        if (warningDate && lastHumanActivity > warningDate) {
          debug("Removing warning due to activity after warning", {
            issueNumber: issue.number,
            warningDate: warningDate.toISOString(),
            lastHumanActivity: lastHumanActivity.toISOString()
          });
          await removeWarningLabel(issue.number, octokitOverride);
          removedWarningLabels.add(issue.number);
        }
      }));

    // Then process expired instances that need warnings, excluding ones that just had labels removed
    const result = await Promise.all(instances.map(async (issue) => {
      const fullIssue = instancesWithComments.find(i => i.number === issue.number);
      if (!fullIssue) return null;

      // Skip if we just removed the warning label from this issue
      if (removedWarningLabels.has(issue.number)) return null;

      const { hoursSinceActivity, hasWarning } = getIssueState(fullIssue);

      // Return issue if it's expired and doesn't have a warning
      return hoursSinceActivity > RETENTION_HOURS && !hasWarning ? issue : null;
    }));

    const expiredInstances = result.filter((issue): issue is Issue => issue !== null);
    debug("Found expired instances", { count: expiredInstances.length }, startTime);
    return expiredInstances;
  } catch (error) {
    console.error("Failed to get expired QA instances:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Gets all warned issues that have been inactive for too long
 */
export async function getInactiveWarnedIssues(octokitOverride = defaultOctokit): Promise<Issue[]> {
  const startTime = Date.now();
  try {
    const issues = await getOpenIssuesWithComments(octokitOverride);
    debug("Fetched issues with comments", { count: issues.length }, startTime);

    const inactiveIssues = issues.filter(issue => {
      const { lastHumanActivity, warningDate, hasWarning } = getIssueState(issue);

      // Must have a warning label and warning comment
      if (!hasWarning || !warningDate) return false;

      // Check if there was activity after the warning
      const activityAfterWarning = isAfter(lastHumanActivity, warningDate);
      if (activityAfterWarning) return false;

      // Calculate hours since warning was issued
      const hoursSinceWarning = hoursSince(warningDate.toISOString());

      debug("Checking inactive status", {
        issueNumber: issue.number,
        hoursSinceWarning,
        threshold: INACTIVITY_THRESHOLD_HOURS,
      });

      // Only close if enough time has passed since the warning
      return hoursSinceWarning >= INACTIVITY_THRESHOLD_HOURS;
    });

    debug("Found inactive warned issues", { count: inactiveIssues.length }, startTime);
    return inactiveIssues;
  } catch (error) {
    console.error("Failed to get inactive warned issues:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Adds warning comments and labels to the specified issues
 */
export async function addWarningToIssues(
  issues: Issue[],
  commentText: string,
  octokitOverride = defaultOctokit,
): Promise<OperationResult[]> {
  const startTime = Date.now();
  debug("Starting warning process", { issueCount: issues.length });

  const addWarning = async (issue: Issue): Promise<OperationResult> => {
    const warningStartTime = Date.now();
    try {
      await octokitOverride.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: commentText,
      });

      await octokitOverride.rest.issues.addLabels({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        labels: [WARNING_LABEL],
      });

      debug("Added warning", { issueNumber: issue.number }, warningStartTime);
      return { issueNumber: issue.number, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      debug("Warning failed", { issueNumber: issue.number, error: errorMessage }, warningStartTime);
      return {
        issueNumber: issue.number,
        success: false,
        error: errorMessage,
      };
    }
  };

  const results = await Promise.all(issues.map(addWarning));
  debug("Completed warning process", {
    total: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  }, startTime);
  return results;
}

/**
 * Closes the specified inactive issues with a closing comment
 */
export async function closeInactiveIssues(
  issues: Issue[],
  octokitOverride = defaultOctokit,
): Promise<OperationResult[]> {
  const startTime = Date.now();
  debug("Starting close process", { issueCount: issues.length });

  const closeIssue = async (issue: Issue): Promise<OperationResult> => {
    const closeStartTime = Date.now();
    try {
      const { lastHumanActivity } = getIssueState(issue);
      const closeMessage = `🔒 Auto-closed: No activity since ${lastHumanActivity.toISOString()}\n\n` +
        `This QA instance exceeded the ${INACTIVITY_THRESHOLD_HOURS}h inactivity threshold after receiving a warning.\n` +
        `If you need this instance again, please reopen the issue and add a comment explaining why.`;

      await octokitOverride.rest.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        state: "closed",
        state_reason: "completed",
      });

      await octokitOverride.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: closeMessage,
      });

      debug("Closed inactive issue", { issueNumber: issue.number }, closeStartTime);
      return { issueNumber: issue.number, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      debug("Close failed", { issueNumber: issue.number, error: errorMessage }, closeStartTime);
      return {
        issueNumber: issue.number,
        success: false,
        error: errorMessage,
      };
    }
  };

  const results = await Promise.all(issues.map(closeIssue));
  debug("Completed close process", {
    total: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  }, startTime);
  return results;
}

/**
 * Removes the warning label from an issue
 */
async function removeWarningLabel(issueNumber: number, octokitOverride = defaultOctokit): Promise<void> {
  const startTime = Date.now();
  try {
    await octokitOverride.rest.issues.removeLabel({
      owner: OWNER,
      repo: REPO,
      issue_number: issueNumber,
      name: WARNING_LABEL,
    });
    debug("Removed warning label", { issueNumber }, startTime);
  } catch (error) {
    console.error(`Failed to remove warning label from issue #${issueNumber}:`, error instanceof Error ? error.message : error);
  }
}
