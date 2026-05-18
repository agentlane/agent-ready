/**
 * Unit tests for the Linear adapter (loadTicketFromLinear).
 * Mocks globalThis.fetch — no real network calls.
 * Runs via: node --test test/adapters.linear.test.js
 * Requires: npm run build
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadTicketFromLinear } from "../dist/adapters/linear.js";

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

function linearIssuePayload(overrides = {}) {
  return {
    data: {
      issue: {
        identifier: "TEAM-123",
        title: "Implement dark mode toggle",
        description: "Users want a dark mode option in settings.\n\n- [ ] Add toggle to settings page",
        url: "https://linear.app/acme/issue/TEAM-123/implement-dark-mode-toggle",
        labels: {
          nodes: [{ name: "feature" }, { name: "ui" }],
        },
        ...overrides,
      },
    },
  };
}

// ─── Target parsing ────────────────────────────────────────────────────────

describe("loadTicketFromLinear — target parsing", () => {
  it("shorthand TEAM-123 POSTs to graphql with variables.id = 'TEAM-123'", async () => {
    process.env.LINEAR_API_KEY = "lin_api_test";

    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify(linearIssuePayload()), { status: 200 });
    };

    await loadTicketFromLinear("TEAM-123");

    assert.equal(capturedBody.variables.id, "TEAM-123");

    restoreFetch();
    delete process.env.LINEAR_API_KEY;
  });

  it("full URL extracts key and POSTs with variables.id correctly", async () => {
    process.env.LINEAR_API_KEY = "lin_api_test";

    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify(linearIssuePayload()), { status: 200 });
    };

    await loadTicketFromLinear("https://linear.app/acme/issue/TEAM-123/implement-dark-mode");

    assert.equal(capturedBody.variables.id, "TEAM-123");

    restoreFetch();
    delete process.env.LINEAR_API_KEY;
  });

  it("invalid target format throws", async () => {
    await assert.rejects(
      () => loadTicketFromLinear("not-valid"),
      /Invalid Linear target/
    );
  });
});

// ─── Auth ──────────────────────────────────────────────────────────────────

describe("loadTicketFromLinear — auth", () => {
  it("missing LINEAR_API_KEY throws with setup hint", async () => {
    const saved = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;

    await assert.rejects(
      () => loadTicketFromLinear("TEAM-123"),
      /LINEAR_API_KEY/
    );

    if (saved !== undefined) process.env.LINEAR_API_KEY = saved;
  });
});

// ─── HTTP + GraphQL error handling ────────────────────────────────────────

describe("loadTicketFromLinear — error handling", () => {
  it("HTTP 401 throws including status code", async () => {
    process.env.LINEAR_API_KEY = "bad-key";

    mockFetch(401, { errors: [{ message: "Unauthorized" }] });

    await assert.rejects(
      () => loadTicketFromLinear("TEAM-123"),
      (err) => {
        assert.ok(err.message.includes("401"), `Expected 401 in message, got: ${err.message}`);
        return true;
      }
    );

    restoreFetch();
    delete process.env.LINEAR_API_KEY;
  });

  it("HTTP 200 with GraphQL errors array throws with first error message", async () => {
    process.env.LINEAR_API_KEY = "lin_api_test";

    mockFetch(200, { errors: [{ message: "Not authorized to access this issue" }] });

    await assert.rejects(
      () => loadTicketFromLinear("TEAM-123"),
      /Not authorized to access this issue/
    );

    restoreFetch();
    delete process.env.LINEAR_API_KEY;
  });

  it("HTTP 200 with data.issue = null throws not found", async () => {
    process.env.LINEAR_API_KEY = "lin_api_test";

    mockFetch(200, { data: { issue: null } });

    await assert.rejects(
      () => loadTicketFromLinear("TEAM-456"),
      /not found/i
    );

    restoreFetch();
    delete process.env.LINEAR_API_KEY;
  });
});

// ─── Ticket normalization ──────────────────────────────────────────────────

describe("loadTicketFromLinear — normalization", () => {
  function withKey(fn) {
    return async () => {
      process.env.LINEAR_API_KEY = "lin_api_test";
      try {
        await fn();
      } finally {
        delete process.env.LINEAR_API_KEY;
        restoreFetch();
      }
    };
  }

  it("id is the Linear issue identifier", withKey(async () => {
    mockFetch(200, linearIssuePayload());
    const ticket = await loadTicketFromLinear("TEAM-123");
    assert.equal(ticket.id, "TEAM-123");
  }));

  it("labels normalized from labels.nodes[]", withKey(async () => {
    mockFetch(200, linearIssuePayload());
    const ticket = await loadTicketFromLinear("TEAM-123");
    assert.deepEqual(ticket.labels, ["feature", "ui"]);
  }));

  it("description: null results in body: ''", withKey(async () => {
    mockFetch(200, { data: { issue: { identifier: "TEAM-123", title: "Test", description: null, url: "https://linear.app/acme/issue/TEAM-123", labels: { nodes: [] } } } });
    const ticket = await loadTicketFromLinear("TEAM-123");
    assert.equal(ticket.body, "");
  }));

  it("url comes from the issue response", withKey(async () => {
    mockFetch(200, linearIssuePayload());
    const ticket = await loadTicketFromLinear("TEAM-123");
    assert.equal(ticket.url, "https://linear.app/acme/issue/TEAM-123/implement-dark-mode-toggle");
  }));
});
