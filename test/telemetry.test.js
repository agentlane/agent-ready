/**
 * Unit tests for telemetry sinks (emitLintOutput).
 * Mocks globalThis.fetch for webhook + OTel; uses a real tmpdir for JSONL.
 * Runs via: node --test test/telemetry.test.js
 * Requires: npm run build
 */
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { emitLintOutput } from "../dist/telemetry/emit.js";

// ── Fixture ────────────────────────────────────────────────────────────────────

function makeLintOutput(overrides = {}) {
  return {
    schema_version: "1.2",
    agent_ready_version: "0.0.4",
    ticket_id: "PROJ-123",
    adapter: "file",
    rule_pack: "default",
    rule_pack_version: "1",
    source: { adapter: "file" },
    signals: { path_recommendation: "A", context_tier: "T1", risk_classification: "low" },
    path_recommendation: "A",
    context_tier: "T1",
    checked_at: new Date().toISOString(),
    ready: true,
    summary: { passed: 5, failed: 0, warnings: 0 },
    checks: [
      { id: "has-acceptance-criteria", status: "pass", severity: "error", message: "Found 2 AC" },
      { id: "body-min-length", status: "fail", severity: "warn", message: "Body too short" },
    ],
    ...overrides,
  };
}

// ── Webhook sink ───────────────────────────────────────────────────────────────

describe("telemetry — webhook sink", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => { globalThis.fetch = originalFetch; });

  it("POSTs the LintOutput JSON to the configured URL", async () => {
    let capturedUrl, capturedBody, capturedMethod, capturedHeaders;

    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedMethod = opts.method;
      capturedBody = JSON.parse(opts.body);
      capturedHeaders = opts.headers;
      return new Response("{}", { status: 200 });
    };

    const out = makeLintOutput();
    await emitLintOutput(out, [{ type: "webhook", url: "https://example.com/hook" }]);

    assert.equal(capturedUrl, "https://example.com/hook");
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedBody.ticket_id, "PROJ-123");
    assert.equal(capturedHeaders["Content-Type"], "application/json");
  });

  it("interpolates ${ENV_VAR} in URL and headers", async () => {
    process.env.WEBHOOK_TOKEN = "secret-token";
    let capturedUrl, capturedHeaders;

    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return new Response("{}", { status: 200 });
    };

    await emitLintOutput(makeLintOutput(), [
      {
        type: "webhook",
        url: "https://example.com/${WEBHOOK_TOKEN}/hook",
        headers: { Authorization: "Bearer ${WEBHOOK_TOKEN}" },
      },
    ]);

    assert.equal(capturedUrl, "https://example.com/secret-token/hook");
    assert.equal(capturedHeaders["Authorization"], "Bearer secret-token");

    delete process.env.WEBHOOK_TOKEN;
  });

  it("does not throw when webhook returns non-200 (fail-soft)", async () => {
    globalThis.fetch = async () => new Response("Bad Gateway", { status: 502 });

    // Should resolve without throwing
    await assert.doesNotReject(() =>
      emitLintOutput(makeLintOutput(), [{ type: "webhook", url: "https://example.com/hook" }])
    );
  });

  it("does not throw when fetch rejects (network error, fail-soft)", async () => {
    globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };

    await assert.doesNotReject(() =>
      emitLintOutput(makeLintOutput(), [{ type: "webhook", url: "https://example.com/hook" }])
    );
  });
});

// ── JSONL sink ─────────────────────────────────────────────────────────────────

describe("telemetry — JSONL sink", () => {
  let tmpDir;

  before(async () => { tmpDir = await mkdtemp(join(tmpdir(), "agent-ready-test-")); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it("appends a JSON line to the configured file", async () => {
    const filePath = join(tmpDir, "runs.jsonl");
    const out = makeLintOutput();

    await emitLintOutput(out, [{ type: "jsonl", path: filePath }]);

    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content.trim());
    assert.equal(parsed.ticket_id, "PROJ-123");
    assert.ok(content.endsWith("\n"), "JSONL line should end with newline");
  });

  it("appends multiple records on repeated calls", async () => {
    const filePath = join(tmpDir, "multi.jsonl");

    await emitLintOutput(makeLintOutput({ ticket_id: "A-1" }), [{ type: "jsonl", path: filePath }]);
    await emitLintOutput(makeLintOutput({ ticket_id: "A-2" }), [{ type: "jsonl", path: filePath }]);

    const content = await readFile(filePath, "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).ticket_id, "A-1");
    assert.equal(JSON.parse(lines[1]).ticket_id, "A-2");
  });

  it("creates parent directories if they don't exist", async () => {
    const filePath = join(tmpDir, "nested", "deep", "runs.jsonl");

    await emitLintOutput(makeLintOutput(), [{ type: "jsonl", path: filePath }]);

    const content = await readFile(filePath, "utf8");
    assert.ok(content.length > 0);
  });

  it("interpolates ${ENV_VAR} in path", async () => {
    process.env.LOG_DIR = tmpDir;
    const filePath = join(tmpDir, "env-interpolated.jsonl");

    await emitLintOutput(makeLintOutput(), [
      { type: "jsonl", path: "${LOG_DIR}/env-interpolated.jsonl" },
    ]);

    const content = await readFile(filePath, "utf8");
    assert.ok(content.length > 0);

    delete process.env.LOG_DIR;
  });
});

// ── OTel sink ─────────────────────────────────────────────────────────────────

describe("telemetry — OTel sink", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => { globalThis.fetch = originalFetch; });

  it("POSTs OTLP JSON to the configured endpoint", async () => {
    let capturedUrl, capturedBody;

    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return new Response("{}", { status: 200 });
    };

    await emitLintOutput(makeLintOutput(), [
      { type: "otel", endpoint: "http://localhost:4318/v1/traces" },
    ]);

    assert.equal(capturedUrl, "http://localhost:4318/v1/traces");
    assert.ok(capturedBody.resourceSpans, "Should have resourceSpans");
    assert.equal(capturedBody.resourceSpans.length, 1);
  });

  it("sets service.name resource attribute", async () => {
    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response("{}", { status: 200 });
    };

    await emitLintOutput(makeLintOutput(), [
      { type: "otel", endpoint: "http://localhost:4318/v1/traces", service_name: "my-pipeline" },
    ]);

    const attrs = capturedBody.resourceSpans[0].resource.attributes;
    const nameAttr = attrs.find(a => a.key === "service.name");
    assert.equal(nameAttr?.value?.stringValue, "my-pipeline");
  });

  it("maps LintOutput signals to span attributes", async () => {
    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response("{}", { status: 200 });
    };

    const out = makeLintOutput({ ready: false });
    await emitLintOutput(out, [{ type: "otel", endpoint: "http://localhost:4318/v1/traces" }]);

    const spans = capturedBody.resourceSpans[0].scopeSpans[0].spans;
    assert.equal(spans.length, 1);
    const span = spans[0];

    const getAttr = (key) => span.attributes.find(a => a.key === key)?.value;
    assert.equal(getAttr("ticket_id")?.stringValue, "PROJ-123");
    assert.equal(getAttr("ready")?.boolValue, false);
    assert.equal(getAttr("path_recommendation")?.stringValue, "A");
  });

  it("maps each CheckResult to a span event", async () => {
    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response("{}", { status: 200 });
    };

    await emitLintOutput(makeLintOutput(), [
      { type: "otel", endpoint: "http://localhost:4318/v1/traces" },
    ]);

    const span = capturedBody.resourceSpans[0].scopeSpans[0].spans[0];
    assert.equal(span.events.length, 2);
    assert.equal(span.events[0].name, "check.has-acceptance-criteria");
    assert.equal(span.events[1].name, "check.body-min-length");
  });

  it("does not throw when OTel endpoint is unreachable (fail-soft)", async () => {
    globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };

    await assert.doesNotReject(() =>
      emitLintOutput(makeLintOutput(), [{ type: "otel", endpoint: "http://127.0.0.1:9999/v1/traces" }])
    );
  });

  it("treats 202 Accepted as success (common OTel collector response)", async () => {
    let called = false;
    globalThis.fetch = async (_url, opts) => {
      called = true;
      // Verify it's a POST with the right content-type
      assert.equal(opts.method, "POST");
      return new Response("{}", { status: 202 });
    };

    await assert.doesNotReject(() =>
      emitLintOutput(makeLintOutput(), [{ type: "otel", endpoint: "http://localhost:4318/v1/traces" }])
    );
    assert.ok(called, "fetch should have been called");
  });
});

// ── Multi-sink fan-out ─────────────────────────────────────────────────────────

describe("telemetry — multi-sink fan-out", () => {
  let tmpDir;
  const originalFetch = globalThis.fetch;

  before(async () => { tmpDir = await mkdtemp(join(tmpdir(), "agent-ready-test-")); });
  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  it("emits to all configured sinks in parallel", async () => {
    let webhookCalled = false;
    globalThis.fetch = async () => {
      webhookCalled = true;
      return new Response("{}", { status: 200 });
    };

    const jsonlPath = join(tmpDir, "fanout.jsonl");
    const out = makeLintOutput();

    await emitLintOutput(out, [
      { type: "webhook", url: "https://example.com/hook" },
      { type: "jsonl", path: jsonlPath },
    ]);

    assert.ok(webhookCalled, "webhook should have been called");
    const content = await readFile(jsonlPath, "utf8");
    assert.ok(content.length > 0, "JSONL file should have content");
  });

  it("continues emitting remaining sinks even if one fails", async () => {
    // Webhook fails, JSONL should still succeed
    globalThis.fetch = async () => { throw new Error("network error"); };

    const jsonlPath = join(tmpDir, "partial.jsonl");
    await emitLintOutput(makeLintOutput(), [
      { type: "webhook", url: "https://example.com/hook" },
      { type: "jsonl", path: jsonlPath },
    ]);

    const content = await readFile(jsonlPath, "utf8");
    assert.ok(content.length > 0, "JSONL should have been written despite webhook failure");
  });

  it("no-op when sinks array is empty", async () => {
    // Should resolve immediately with no side effects
    await assert.doesNotReject(() => emitLintOutput(makeLintOutput(), []));
  });
});
