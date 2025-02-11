import { octokit, config } from "./config.ts";
import { Issue, OperationResult, Activity, IssueState } from "./types.ts";
import { getQAReadyInstances, getOpenIssuesWithComments } from "./issues-api.ts";

const { OWNER, REPO, WARNING_LABEL, BOT_USERNAME, RETENTION_HOURS, INACTIVITY_THRESHOLD_HOURS } = config;

/**
 * Calculates the number of hours between now and a given date
 */
const hoursSince = (date: string): number =>
  Number(((Date.now() - new Date(date).getTime()) / 3600000).toFixed(2));

/**
 * Debug logging helper
 */
const debug = (msg: string, data: unknown): void => {
  console.log(`[DEBUG] ${msg}:`, JSON.stringify(data, null, 2));
};

/**
 * Checks if one date is after another
 */
const isAfter = (date1: Date, date2: Date): boolean => date1.getTime() > date2.getTime();

/**
 * Gets all activity on an issue, sorted by date
 */
const getIssueActivity = (issue: Issue): Activity[] => {
  const activities: Activity[] = [
    {
      date: new Date(issue.created_at),
      type: 'creation',
      isBot: issue.user.login === BOT_USERNAME,
    },
  ];

  if (issue.comments) {
    const commentActivities: Activity[] = issue.comments.map(comment => ({
      date: new Date(comment.created_at),
      type: 'comment',
      isBot: comment.user.login === BOT_USERNAME,
    }));
    activities.push(...commentActivities);
  }

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
      new Date(c.created_at).getTime() === a.date.getTime() &&
      c.body?.includes('QA Instance Retention Warning')
    ));

  // Find the last human activity
  const humanActivities = activities.filter(a => !a.isBot);
  const lastHumanActivity = humanActivities.length > 0
    ? humanActivities.reduce((latest, current) =>
        current.date.getTime() > latest.date.getTime() ? current : latest
      ).date
    : new Date(issue.created_at);

  return {
    lastHumanActivity,
    warningDate: warningComment?.date,
    hasWarning,
    hoursSinceActivity: hoursSince(lastHumanActivity.toISOString()),
  };
};

/**
 * Removes the warning label from an issue
 */
async function removeWarningLabel(issueNumber: number): Promise<void> {
  try {
    await octokit.rest.issues.removeLabel({
      owner: OWNER,
      repo: REPO,
      issue_number: issueNumber,
      name: WARNING_LABEL,
    });
    debug("Removed warning label", { issueNumber });
  } catch (error) {
    console.error(`Failed to remove warning label from issue #${issueNumber}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Gets all QA instances that have expired but haven't been warned yet
 */
export async function getExpiredQAInstances(): Promise<Issue[]> {
  try {
    const instances = await getQAReadyInstances();
    const instancesWithComments = await getOpenIssuesWithComments();

    const result = await Promise.all(instances.map(async (issue) => {
      const fullIssue = instancesWithComments.find(i => i.number === issue.number);
      if (!fullIssue) return null;

      const { lastHumanActivity, warningDate, hasWarning, hoursSinceActivity } = getIssueState(fullIssue);

      // If there's a warning but activity after it, remove the warning
      if (hasWarning && warningDate && isAfter(lastHumanActivity, warningDate)) {
        await removeWarningLabel(issue.number);
        return null;
      }

      // Return issue if it's expired and doesn't have a warning
      return hoursSinceActivity > RETENTION_HOURS && !hasWarning ? issue : null;
    }));

    return result.filter((issue): issue is Issue => issue !== null);
  } catch (error) {
    console.error("Failed to get expired QA instances:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Gets all warned issues that have been inactive for too long
 */
export async function getInactiveWarnedIssues(): Promise<Issue[]> {
  try {
    const issues = await getOpenIssuesWithComments();

    return issues.filter(issue => {
      const { lastHumanActivity, warningDate, hasWarning, hoursSinceActivity } = getIssueState(issue);

      if (!hasWarning || !warningDate) return false;

      const activityAfterWarning = isAfter(lastHumanActivity, warningDate);
      return !activityAfterWarning && hoursSinceActivity > INACTIVITY_THRESHOLD_HOURS;
    });
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
): Promise<OperationResult[]> {
  const addWarning = async (issue: Issue): Promise<OperationResult> => {
    try {
      await octokit.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: commentText,
      });

      await octokit.rest.issues.addLabels({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        labels: [WARNING_LABEL],
      });

      debug("Added warning", { issueNumber: issue.number });
      return { issueNumber: issue.number, success: true };
    } catch (error) {
      return {
        issueNumber: issue.number,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  const results = await Promise.all(issues.map(addWarning));
  return results;
}

/**
 * Closes the specified inactive issues with a closing comment
 */
export async function closeInactiveIssues(issues: Issue[]): Promise<OperationResult[]> {
  const closeIssue = async (issue: Issue): Promise<OperationResult> => {
    try {
      const { lastHumanActivity } = getIssueState(issue);
      const closeMessage = `🔒 Auto-closed: No activity since ${lastHumanActivity.toISOString()}\n\n` +
        `This QA instance exceeded the ${INACTIVITY_THRESHOLD_HOURS}h inactivity threshold after receiving a warning.\n` +
        `If you need this instance again, please reopen the issue and add a comment explaining why.`;

      await octokit.rest.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        state: "closed",
        state_reason: "completed",
      });

      await octokit.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: closeMessage,
      });

      debug("Closed inactive issue", { issueNumber: issue.number });
      return { issueNumber: issue.number, success: true };
    } catch (error) {
      return {
        issueNumber: issue.number,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  const results = await Promise.all(issues.map(closeIssue));
  return results;
}
