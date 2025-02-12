import { assertEquals } from "@std/assert";
import {
  createMockIssue,
  createMockComment,
  hoursAgo,
  MockOctokit,
  WARNING_LABEL,
  BOT_USERNAME,
  RETENTION_HOURS,
  INACTIVITY_THRESHOLD_HOURS,
} from "./mocks.ts";
import { getExpiredQAInstances, getInactiveWarnedIssues } from "../retention.ts";

// Mock the config module
const mockConfig = {
  WARNING_LABEL,
  BOT_USERNAME,
  RETENTION_HOURS,
  INACTIVITY_THRESHOLD_HOURS,
};

// Replace the real config with our mock
import { config } from "../config.ts";
Object.assign(config, mockConfig);

Deno.test("Basic Retention Flow", async (t) => {
  await t.step("New QA instance should not have warning", async () => {
    const issue = createMockIssue({
      number: 1,
      created_at: hoursAgo(1), // Created 1 hour ago
    });

    const mockOctokit = new MockOctokit([issue]);
    const expiredInstances = await getExpiredQAInstances(mockOctokit);
    
    assertEquals(expiredInstances.length, 0, "New instance should not be expired");
  });

  await t.step("QA instance exceeding retention period should get warning", async () => {
    const issue = createMockIssue({
      number: 1,
      created_at: hoursAgo(50), // Created 50 hours ago (beyond retention period)
    });

    const mockOctokit = new MockOctokit([issue]);
    const expiredInstances = await getExpiredQAInstances(mockOctokit);
    
    assertEquals(expiredInstances.length, 1, "Instance should be marked as expired");
    assertEquals(expiredInstances[0].number, 1, "Expired instance should be #1");
  });
});

Deno.test("Activity Reset Scenarios", async (t) => {
  await t.step("Comment after warning should remove warning label", async () => {
    const issue = createMockIssue({
      number: 1,
      created_at: hoursAgo(50),
      labels: [{ name: WARNING_LABEL }],
      comments: [
        createMockComment({
          created_at: hoursAgo(25),
          user_login: BOT_USERNAME,
          body: "QA Instance Retention Warning"
        }),
        createMockComment({
          created_at: hoursAgo(1),
          user_login: "test-user"
        })
      ]
    });

    const mockOctokit = new MockOctokit([issue]);
    await getExpiredQAInstances(mockOctokit);
    
    const updatedIssue = mockOctokit.getIssue(1);
    assertEquals(
      updatedIssue?.labels.some(l => l.name === WARNING_LABEL),
      false,
      "Warning label should be removed after activity"
    );
  });

  await t.step("Multiple comments should reset retention timer", async () => {
    const issue = createMockIssue({
      number: 1,
      created_at: hoursAgo(100),
      comments: [
        createMockComment({
          created_at: hoursAgo(75),
          user_login: "test-user"
        }),
        createMockComment({
          created_at: hoursAgo(50),
          user_login: "test-user"
        }),
        createMockComment({
          created_at: hoursAgo(25),
          user_login: "test-user"
        })
      ]
    });

    const mockOctokit = new MockOctokit([issue]);
    const expiredInstances = await getExpiredQAInstances(mockOctokit);
    
    assertEquals(expiredInstances.length, 0, "Instance should not be expired due to recent activity");
  });
});

Deno.test("Inactivity Scenarios", async (t) => {
  await t.step("Warned issue with no activity should be closed", async () => {
    const issue = createMockIssue({
      number: 1,
      created_at: hoursAgo(50),
      labels: [{ name: WARNING_LABEL }],
      comments: [
        createMockComment({
          created_at: hoursAgo(25),
          user_login: BOT_USERNAME,
          body: "QA Instance Retention Warning"
        })
      ]
    });

    const mockOctokit = new MockOctokit([issue]);
    const inactiveIssues = await getInactiveWarnedIssues(mockOctokit);
    
    assertEquals(inactiveIssues.length, 1, "Issue should be marked as inactive");
    assertEquals(inactiveIssues[0].number, 1, "Inactive issue should be #1");
  });

  await t.step("Warned issue with recent activity should not be closed", async () => {
    const issue = createMockIssue({
      number: 1,
      created_at: hoursAgo(50),
      labels: [{ name: WARNING_LABEL }],
      comments: [
        createMockComment({
          created_at: hoursAgo(25),
          user_login: BOT_USERNAME,
          body: "QA Instance Retention Warning"
        }),
        createMockComment({
          created_at: hoursAgo(1),
          user_login: "test-user"
        })
      ]
    });

    const mockOctokit = new MockOctokit([issue]);
    const inactiveIssues = await getInactiveWarnedIssues(mockOctokit);
    
    assertEquals(inactiveIssues.length, 0, "Issue should not be marked as inactive due to recent activity");
  });
}); 