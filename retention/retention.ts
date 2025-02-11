import { octokit, config } from "./config.ts";
import { Issue, OperationResult, IssueComment } from "./types.ts";
import { getQAReadyInstances, getOpenIssuesWithComments } from "./issues-api.ts";

const { OWNER, REPO, WARNING_LABEL, BOT_USERNAME, RETENTION_HOURS, INACTIVITY_THRESHOLD_HOURS } = config;

const hoursSince = (date: string) =>
  Number(((Date.now() - new Date(date).getTime()) / 3600000).toFixed(2));
//could do with a rewrite tbh
const debug = (msg: string, data: unknown) =>
  console.log(`[DEBUG] ${msg}:`, JSON.stringify(data, null, 2));

// Helper to check if a date is after another date
const isAfter = (date1: Date, date2: Date) => date1.getTime() > date2.getTime();

type Activity = {
  date: Date;
  type: 'creation' | 'comment';
  isBot: boolean;
};

// Get all activity on an issue, sorted by date
const getIssueActivity = (issue: Issue): Activity[] => {
  const activities: Activity[] = [
    {
      date: new Date(issue.created_at),
      type: 'creation',
      isBot: issue.user.login === BOT_USERNAME
    }
  ];

  if (issue.comments) {
    const commentActivities: Activity[] = issue.comments.map(comment => ({
      date: new Date(comment.created_at),
      type: 'comment',
      isBot: comment.user.login === BOT_USERNAME
    }));
    activities.push(...commentActivities);
  }

  return activities.sort((a, b) => a.date.getTime() - b.date.getTime());
};

// Get the last human activity and warning state
const getIssueState = (issue: Issue) => {
  const activities = getIssueActivity(issue);
  const hasWarning = issue.labels.some(l => l.name === WARNING_LABEL);

  // Find the last warning comment if any
  const warningComment = activities
    .filter(a => a.isBot && a.type === 'comment')
    .find(a => issue.comments?.find(c =>
      new Date(c.created_at).getTime() === a.date.getTime() &&
      c.body?.includes('WARNING:')
    ));

  // Find the last human activity
  const lastHumanActivity = activities
    .filter(a => !a.isBot)
    .reduce((latest, current) =>
      current.date.getTime() > latest.date.getTime() ? current : latest
    );

  return {
    lastHumanActivity: lastHumanActivity.date,
    warningDate: warningComment?.date,
    hasWarning,
    hoursSinceActivity: hoursSince(lastHumanActivity.date.toISOString())
  };
};

//removes the warning label if a non-bot user comments after a warning has been issued
async function removeWarningLabel(issueNumber: number): Promise<void> {
  try {
    await octokit.rest.issues.removeLabel({
      owner: OWNER,
      repo: REPO,
      issue_number: issueNumber,
      name: WARNING_LABEL
    });
    debug("Removed warning label", { issueNumber });
  } catch (error) {
    console.error(`Failed to remove warning label from issue #${issueNumber}:`, error);
  }
}

export async function getExpiredQAInstances(): Promise<Issue[]> {
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
}

export async function getInactiveWarnedIssues(): Promise<Issue[]> {
  const issues = await getOpenIssuesWithComments();

  return issues.filter(issue => {
    const { lastHumanActivity, warningDate, hasWarning, hoursSinceActivity } = getIssueState(issue);

    if (!hasWarning || !warningDate) return false;

    const activityAfterWarning = isAfter(lastHumanActivity, warningDate);
    return !activityAfterWarning && hoursSinceActivity > INACTIVITY_THRESHOLD_HOURS;
  });
}

export async function addWarningToIssues(
  issues: Issue[],
  commentText: string
): Promise<OperationResult[]> {
  return Promise.all(issues.map(async issue => {
    try {
      await octokit.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: commentText
      });

      await octokit.rest.issues.addLabels({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        labels: [WARNING_LABEL]
      });

      debug("Added warning", { issueNumber: issue.number });
      return { issueNumber: issue.number, success: true };
    } catch (error) {
      return {
        issueNumber: issue.number,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }));
}

export async function closeInactiveIssues(issues: Issue[]): Promise<OperationResult[]> {
  return Promise.all(issues.map(async issue => {
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
        state_reason: "completed"
      });

      await octokit.rest.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: closeMessage
      });

      debug("Closed inactive issue", { issueNumber: issue.number });
      return { issueNumber: issue.number, success: true };
    } catch (error) {
      return {
        issueNumber: issue.number,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }));
}
