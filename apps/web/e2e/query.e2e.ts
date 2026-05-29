import { test, expect } from "@playwright/test";

/**
 * Live E2E for the /query NL → Rule → Findings bar. The /v1/rules:compile
 * call is mocked at the network layer, so the test exercises the real page
 * (input → fixture select → Run → result render) without the API gateway.
 */
const mockCompileResponse = {
  rule: {
    id: "SALESFORCE-EDU-LLM-001",
    entity: "Contact",
    name: "duplicate emails",
    description: "Contacts sharing an email address",
    severity: "WARN",
    tags: ["llm", "demo"],
    messageTemplate: "duplicate email {email}",
    fieldsRead: [{ entity: "Contact", field: "email" }],
  },
  provenance: {
    callId: "call-e2e-1",
    timestamp: new Date().toISOString(),
    provider: "deterministic-mock",
    model: "mock-v1",
    promptHash: "a".repeat(64),
    responseHash: "b".repeat(64),
    latencyMs: 4,
    costUsd: 0,
  },
  dryRunFindings: 3,
};

test("compiles an NL prompt and renders the rule + provenance", async ({ page }) => {
  await page.route("**/v1/rules:compile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCompileResponse),
    });
  });

  await page.goto("/query");
  await expect(page.getByTestId("query-page")).toBeVisible();

  await page.getByTestId("nl-input").fill("contacts with duplicate emails");
  await page.getByTestId("run-button").click();

  const resultBox = page.getByTestId("result-box");
  await expect(resultBox).toBeVisible();
  await expect(resultBox).toContainText("deterministic-mock");
  await expect(resultBox).toContainText("SALESFORCE-EDU-LLM-001");
});
