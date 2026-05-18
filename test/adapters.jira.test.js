/**
 * Unit tests for the Jira adapter (loadTicketFromJira).
 * Mocks globalThis.fetch — no real network calls.
 * Runs via: node --test test/adapters.jira.test.js
 * Requires: npm run build
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadTicketFromJira } from "../dist/adapters/jira.js";

// Save and restore fetch / env around tests that mutate them
const originalFetch = globalThis.fetch;

function mockFetch(status, body) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Minimal valid Jira issue response (v2 API)
function jiraIssueFixture(overrides = {}) {
  return {
    key: "PROJ-123",
    fields: {
      summary: "Fix the login redirect bug",
      description: "Users are redirected to a blank page after login.",
      labels: ["auth", "bug"],
      components: [{ name: "Frontend" }],
    },
    ...overrides,
  };
}

// ─── Target parsing + base URL ─────────────────────────────────────────────

describe("loadTicketFromJira — target parsing", () => {
  const savedEnv = {};

  it("shorthand PROJ-123 with JIRA_BASE_URL fetches correct URL", async () => {
    savedEnv.JIRA_BASE_URL = process.env.JIRA_BASE_URL;
    savedEnv.JIRA_EMAIL = process.env.JIRA_EMAIL;
    savedEnv.JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
    process.env.JIRA_BASE_URL = "https://acme.atlassian.net";
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";

    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify(jiraIssueFixture()), { status: 200 });
    };

    await loadTicketFromJira("PROJ-123");

    assert.ok(
      capturedUrl.startsWith("https://acme.atlassian.net/rest/api/2/issue/PROJ-123"),
      `Expected URL to start with Jira v2 path, got: ${capturedUrl}`
    );

    restoreFetch();
    process.env.JIRA_BASE_URL = savedEnv.JIRA_BASE_URL ?? "";
    process.env.JIRA_EMAIL = savedEnv.JIRA_EMAIL ?? "";
    process.env.JIRA_API_TOKEN = savedEnv.JIRA_API_TOKEN ?? "";
  });

  it("full URL https://acme.atlassian.net/browse/PROJ-123 fetches correct URL", async () => {
    savedEnv.JIRA_EMAIL = process.env.JIRA_EMAIL;
    savedEnv.JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";

    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify(jiraIssueFixture()), { status: 200 });
    };

    await loadTicketFromJira("https://acme.atlassian.net/browse/PROJ-123");

    assert.ok(
      capturedUrl.startsWith("https://acme.atlassian.net/rest/api/2/issue/PROJ-123"),
      `Expected URL to start with Jira v2 path, got: ${capturedUrl}`
    );

    restoreFetch();
    process.env.JIRA_EMAIL = savedEnv.JIRA_EMAIL ?? "";
    process.env.JIRA_API_TOKEN = savedEnv.JIRA_API_TOKEN ?? "";
  });

  it("shorthand without JIRA_BASE_URL throws with setup hint", async () => {
    savedEnv.JIRA_BASE_URL = process.env.JIRA_BASE_URL;
    savedEnv.JIRA_EMAIL = process.env.JIRA_EMAIL;
    savedEnv.JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
    delete process.env.JIRA_BASE_URL;
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";

    await assert.rejects(
      () => loadTicketFromJira("PROJ-123"),
      (err) => {
        assert.ok(err.message.includes("JIRA_BASE_URL"), `Expected JIRA_BASE_URL mention, got: ${err.message}`);
        return true;
      }
    );

    process.env.JIRA_BASE_URL = savedEnv.JIRA_BASE_URL ?? "";
    process.env.JIRA_EMAIL = savedEnv.JIRA_EMAIL ?? "";
    process.env.JIRA_API_TOKEN = savedEnv.JIRA_API_TOKEN ?? "";
  });

  it("invalid target format throws", async () => {
    await assert.rejects(
      () => loadTicketFromJira("not-a-valid-target"),
      /Invalid Jira target/
    );
  });
});

// ─── Auth ──────────────────────────────────────────────────────────────────

describe("loadTicketFromJira — auth", () => {
  it("missing JIRA_EMAIL throws", async () => {
    const saved = { e: process.env.JIRA_EMAIL, t: process.env.JIRA_API_TOKEN, b: process.env.JIRA_BASE_URL };
    delete process.env.JIRA_EMAIL;
    process.env.JIRA_API_TOKEN = "token";
    process.env.JIRA_BASE_URL = "https://acme.atlassian.net";

    await assert.rejects(
      () => loadTicketFromJira("PROJ-123"),
      /JIRA_EMAIL/
    );

    process.env.JIRA_EMAIL = saved.e ?? "";
    process.env.JIRA_API_TOKEN = saved.t ?? "";
    process.env.JIRA_BASE_URL = saved.b ?? "";
  });

  it("missing JIRA_API_TOKEN throws", async () => {
    const saved = { e: process.env.JIRA_EMAIL, t: process.env.JIRA_API_TOKEN, b: process.env.JIRA_BASE_URL };
    process.env.JIRA_EMAIL = "user@example.com";
    delete process.env.JIRA_API_TOKEN;
    process.env.JIRA_BASE_URL = "https://acme.atlassian.net";

    await assert.rejects(
      () => loadTicketFromJira("PROJ-123"),
      /JIRA_API_TOKEN/
    );

    process.env.JIRA_EMAIL = saved.e ?? "";
    process.env.JIRA_API_TOKEN = saved.t ?? "";
    process.env.JIRA_BASE_URL = saved.b ?? "";
  });
});

// ─── HTTP error handling ───────────────────────────────────────────────────

describe("loadTicketFromJira — HTTP errors", () => {
  it("HTTP 404 with errorMessages throws including the message", async () => {
    const saved = { e: process.env.JIRA_EMAIL, t: process.env.JIRA_API_TOKEN, b: process.env.JIRA_BASE_URL };
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "test-token";
    process.env.JIRA_BASE_URL = "https://acme.atlassian.net";

    mockFetch(404, { errorMessages: ["Issue does not exist or you do not have permission to see it."], errors: {} });

    await assert.rejects(
      () => loadTicketFromJira("PROJ-999"),
      (err) => {
        assert.ok(err.message.includes("404"), `Expected 404 in message, got: ${err.message}`);
        assert.ok(err.message.includes("Issue does not exist"), `Expected error detail, got: ${err.message}`);
        return true;
      }
    );

    restoreFetch();
    process.env.JIRA_EMAIL = saved.e ?? "";
    process.env.JIRA_API_TOKEN = saved.t ?? "";
    process.env.JIRA_BASE_URL = saved.b ?? "";
  });

  it("HTTP 401 throws including status code", async () => {
    const saved = { e: process.env.JIRA_EMAIL, t: process.env.JIRA_API_TOKEN, b: process.env.JIRA_BASE_URL };
    process.env.JIRA_EMAIL = "user@example.com";
    process.env.JIRA_API_TOKEN = "bad-token";
    process.env.JIRA_BASE_URL = "https://acme.atlassian.net";

    mockFetch(401, { message: "Unauthorized" });

    await assert.rejects(
      () => loadTicketFromJira("PROJ-123"),
      (err) => {
        assert.ok(err.message.includes("401"), `Expected 401 in message, got: ${err.message}`);
        return true;
      }
    );

    restoreFetch();
    process.env.JIRA_EMAIL = saved.e ?? "";
    process.env.JIRA_API_TOKEN = saved.t ?? "";
    process.env.JIRA_BASE_URL = saved.b ?? "";
  });
});

// ─── Ticket normalization ──────────────────────────────────────────────────

describe("loadTicketFromJira — normalization", () => {
  function withCreds(fn) {
    return async () => {
      const saved = { e: process.env.JIRA_EMAIL, t: process.env.JIRA_API_TOKEN };
      process.env.JIRA_EMAIL = "user@example.com";
      process.env.JIRA_API_TOKEN = "test-token";
      try {
        await fn();
      } finally {
        process.env.JIRA_EMAIL = saved.e ?? "";
        process.env.JIRA_API_TOKEN = saved.t ?? "";
        restoreFetch();
      }
    };
  }

  it("labels and components are merged into labels[]", withCreds(async () => {
    mockFetch(200, jiraIssueFixture());
    const ticket = await loadTicketFromJira("https://acme.atlassian.net/browse/PROJ-123");
    assert.deepEqual(ticket.labels, ["auth", "bug", "Frontend"]);
  }));

  it("description: null results in body: ''", withCreds(async () => {
    mockFetch(200, jiraIssueFixture({ fields: { summary: "Test", description: null, labels: [], components: [] } }));
    const ticket = await loadTicketFromJira("https://acme.atlassian.net/browse/PROJ-123");
    assert.equal(ticket.body, "");
  }));

  it("id is the Jira issue key", withCreds(async () => {
    mockFetch(200, jiraIssueFixture());
    const ticket = await loadTicketFromJira("https://acme.atlassian.net/browse/PROJ-123");
    assert.equal(ticket.id, "PROJ-123");
  }));

  it("url points to the browse path", withCreds(async () => {
    mockFetch(200, jiraIssueFixture());
    const ticket = await loadTicketFromJira("https://acme.atlassian.net/browse/PROJ-123");
    assert.equal(ticket.url, "https://acme.atlassian.net/browse/PROJ-123");
  }));
});
