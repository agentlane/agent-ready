/**
 * Unit tests for the OPA policy bridge (runOpaRule).
 * Remote mode: mocks globalThis.fetch.
 * Embedded mode: creates a fake `opa` shell script in tmpdir and prepends it to PATH.
 * Runs via: node --test test/opa.test.js
 * Requires: npm run build
 */
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runOpaRule } from "../dist/rules/opa.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TICKET = {
  id: "PROJ-1",
  title: "Add user login",
  body: "Implement OAuth2 login flow with GitHub.\n\nAcceptance criteria:\n- [ ] User can log in\n- [ ] Token is stored securely",
  labels: ["feature", "risk:low"],
  url: "https://example.com",
};

const SIGNALS = {
  path_recommendation: "B",
  context_tier: "T2",
  risk_classification: "low",
};

const OPA_CFG_REMOTE = {
  type: "opa",
  mode: "remote",
  server: "http://localhost:8181",
  query: "data.security.allow",
  severity: "error",
};

// ── Remote mode ───────────────────────────────────────────────────────────────

describe("runOpaRule — remote mode", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  function mockOpa(result) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  }

  it("returns pass when OPA result is boolean true", async () => {
    mockOpa(true);
    const r = await runOpaRule(TICKET, SIGNALS, "my-opa-rule", OPA_CFG_REMOTE);
    assert.equal(r.status, "pass");
    assert.equal(r.id, "my-opa-rule");
  });

  it("returns fail when OPA result is boolean false", async () => {
    mockOpa(false);
    const r = await runOpaRule(TICKET, SIGNALS, "my-opa-rule", OPA_CFG_REMOTE);
    assert.equal(r.status, "fail");
    assert.equal(r.severity, "error");
  });

  it("returns pass when OPA result is object with allow: true", async () => {
    mockOpa({ allow: true, reason: "Policy satisfied", hint: undefined });
    const r = await runOpaRule(TICKET, SIGNALS, "my-opa-rule", OPA_CFG_REMOTE);
    assert.equal(r.status, "pass");
    assert.equal(r.message, "Policy satisfied");
  });

  it("returns fail when OPA result is object with allow: false", async () => {
    mockOpa({ allow: false, reason: "Missing risk:high label", hint: "Add label" });
    const r = await runOpaRule(TICKET, SIGNALS, "my-opa-rule", OPA_CFG_REMOTE);
    assert.equal(r.status, "fail");
    assert.equal(r.message, "Missing risk:high label");
    assert.equal(r.hint, "Add label");
  });

  it("uses correct URL path from query string", async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ result: true }), { status: 200 });
    };

    await runOpaRule(TICKET, SIGNALS, "r", {
      type: "opa", mode: "remote",
      server: "http://opa.internal:8181",
      query: "data.pii.decision",
    });

    assert.ok(
      capturedUrl.includes("/v1/data/pii/decision"),
      `Expected /v1/data/pii/decision in URL, got: ${capturedUrl}`
    );
  });

  it("sends ticket and signals in input body by default", async () => {
    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({ result: true }), { status: 200 });
    };

    await runOpaRule(TICKET, SIGNALS, "r", OPA_CFG_REMOTE);

    assert.deepEqual(capturedBody.input.ticket, TICKET);
    assert.deepEqual(capturedBody.input.signals, SIGNALS);
  });

  it("respects input_includes: only ticket", async () => {
    let capturedBody;
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({ result: true }), { status: 200 });
    };

    await runOpaRule(TICKET, SIGNALS, "r", {
      ...OPA_CFG_REMOTE,
      input_includes: ["ticket"],
    });

    assert.ok(capturedBody.input.ticket, "ticket should be in input");
    assert.equal(capturedBody.input.signals, undefined, "signals should be omitted");
  });

  it("respects custom severity from config", async () => {
    mockOpa(false);
    const r = await runOpaRule(TICKET, SIGNALS, "r", { ...OPA_CFG_REMOTE, severity: "warn" });
    assert.equal(r.severity, "warn");
  });

  it("returns fail status on HTTP error (fail-graceful)", async () => {
    globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
    const r = await runOpaRule(TICKET, SIGNALS, "r", OPA_CFG_REMOTE);
    assert.equal(r.status, "fail");
    assert.ok(r.message.includes("403"), `Expected 403 in message: ${r.message}`);
  });

  it("returns fail status on network error (fail-graceful)", async () => {
    globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
    const r = await runOpaRule(TICKET, SIGNALS, "r", OPA_CFG_REMOTE);
    assert.equal(r.status, "fail");
    assert.ok(r.message.includes("OPA evaluation error"));
  });

  it("returns fail when result is undefined (unknown OPA document)", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({}), { status: 200 }); // no 'result' key
    const r = await runOpaRule(TICKET, SIGNALS, "r", OPA_CFG_REMOTE);
    assert.equal(r.status, "fail");
    assert.ok(r.message.includes("undefined"));
  });
});

// ── Embedded mode ─────────────────────────────────────────────────────────────

describe("runOpaRule — embedded mode", () => {
  let tmpDir;
  let fakeOpaTrue;
  let fakeOpaFalse;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "opa-fake-"));

    // Write two stable fake binaries — one always returns "true", one "false".
    // Use the OPA_BINARY env var override (read by evalEmbedded) so we don't
    // rely on PATH mutation, which is unreliable across CI environments.
    fakeOpaTrue = join(tmpDir, "opa-true");
    fakeOpaFalse = join(tmpDir, "opa-false");

    await writeFile(fakeOpaTrue,  "#!/bin/sh\necho 'true'\n",  "utf8");
    await writeFile(fakeOpaFalse, "#!/bin/sh\necho 'false'\n", "utf8");
    await chmod(fakeOpaTrue,  0o755);
    await chmod(fakeOpaFalse, 0o755);

    // Point evalEmbedded at the true-returning binary by default
    process.env.OPA_BINARY = fakeOpaTrue;
  });

  after(async () => {
    delete process.env.OPA_BINARY;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns pass when opa eval outputs 'true'", async () => {
    const policyPath = join(tmpDir, "policy.rego");
    await writeFile(policyPath, "package test\nallow := true\n");

    const r = await runOpaRule(TICKET, SIGNALS, "embedded-rule", {
      type: "opa",
      mode: "embedded",
      policy: policyPath,
      query: "data.test.allow",
    });

    assert.equal(r.status, "pass");
  });

  it("returns fail when opa eval outputs 'false'", async () => {
    // Temporarily switch to the false-returning binary
    process.env.OPA_BINARY = fakeOpaFalse;

    const policyPath = join(tmpDir, "policy.rego");
    await writeFile(policyPath, "package test\nallow := false\n");

    const r = await runOpaRule(TICKET, SIGNALS, "embedded-rule", {
      type: "opa",
      mode: "embedded",
      policy: policyPath,
      query: "data.test.allow",
    });

    assert.equal(r.status, "fail");

    // Restore to true-returning binary
    process.env.OPA_BINARY = fakeOpaTrue;
  });

  it("returns fail with error message when policy path missing", async () => {
    const r = await runOpaRule(TICKET, SIGNALS, "r", {
      type: "opa",
      mode: "embedded",
      // no policy field
      query: "data.test.allow",
    });
    assert.equal(r.status, "fail");
    assert.ok(r.message.includes("policy"), `Expected 'policy' mention: ${r.message}`);
  });
});

// ── lintTicket integration (OPA as a rule pack entry) ─────────────────────────

describe("runOpaRule — lintTicket integration", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("OPA allow:true contributes a passing check to the final LintOutput", async () => {
    // Import lintTicket from the barrel
    const { lintTicket } = await import("../dist/index.js");

    globalThis.fetch = async (url, opts) => {
      // Only intercept OPA calls (links-resolve also uses fetch)
      if (url.includes("8181")) {
        return new Response(JSON.stringify({ result: { allow: true, reason: "Risk policy satisfied" } }), { status: 200 });
      }
      // For any other fetch (links-resolve etc.) return 200
      return new Response("ok", { status: 200 });
    };

    const ticket = {
      id: "PROJ-99",
      title: "Add user profile page",
      body: "Allow users to view and update their profile.\n\nAcceptance criteria:\n- [ ] View profile\n- [ ] Edit profile\n\nDefinition of Done:\n- Tests written\n\nHow to verify: Playwright tests\n\nrepo: frontend\nsize: M",
      labels: ["feature", "risk:low", "size:M"],
    };

    const pack = {
      version: 1,
      rules: {
        "custom-risk-gate": {
          type: "opa",
          mode: "remote",
          server: "http://localhost:8181",
          query: "data.security.allow",
          severity: "error",
        },
      },
    };

    const result = await lintTicket(ticket, pack, { adapter: "file", rulePackName: "default" });
    const opaCheck = result.checks.find((c) => c.id === "custom-risk-gate");
    assert.ok(opaCheck, "OPA check should appear in checks");
    assert.equal(opaCheck.status, "pass");
    assert.equal(opaCheck.message, "Risk policy satisfied");
  });
});
