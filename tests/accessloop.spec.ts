import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import type { ScanReport } from "../src/report.ts";
import { scanPage } from "../src/scan.ts";
import { generateTask } from "../src/task.ts";

function cli(args: string[], env = process.env) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(process.execPath, ["src/cli.ts", ...args], { env, timeout: 20_000 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ code: 0, stdout, stderr });
      } else if (typeof error.code === "number") {
        resolve({ code: error.code, stdout, stderr });
      } else {
        reject(error);
      }
    });
  });
}

function printedReport(stdout: string): string {
  const path = stdout.match(/^Report: (.+)$/m)?.[1];
  if (!path) throw new Error(`CLI produced no report path: ${stdout}`);
  return path;
}

test("A · detects both known violations and exits 1", async ({ baseURL }, testInfo) => {
  const result = await cli(["scan", "--url", `${baseURL}/before.html`, "--out", testInfo.outputPath("scan")]);
  expect(result.code, result.stderr).toBe(1);
  const report: ScanReport = JSON.parse(await readFile(printedReport(result.stdout), "utf8"));
  expect(report.violations.map((rule) => rule.id).sort()).toEqual(["button-name", "label"]);
  expect(report.violations.find((rule) => rule.id === "label")?.elements[0]?.target).toEqual(["#email"]);
  expect(report.violations.find((rule) => rule.id === "button-name")?.elements[0]?.target).toEqual(["#submit"]);
});

test("B · corrected page exits 0 and supports keyboard submission", async ({ page, baseURL }, testInfo) => {
  const result = await cli(["scan", "--url", `${baseURL}/after.html`, "--out", testInfo.outputPath("scan")]);
  expect(result.code, result.stderr).toBe(0);
  const report: ScanReport = JSON.parse(await readFile(printedReport(result.stdout), "utf8"));
  expect(report.violations).toEqual([]);
  expect(report.summary.violations).toBe(0);

  await page.goto("/after.html");
  const email = page.getByLabel("Email address", { exact: true });
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await page.keyboard.type("demo@example.test");
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Email accepted for this demo.");
  await expect(page).toHaveURL(/\/after\.html$/);
});

test("C · persists structured axe evidence and a browser screenshot", async ({ baseURL }, testInfo) => {
  const url = `${baseURL}/before.html`;
  const { report, reportPath } = await scanPage(url, testInfo.outputPath("scan"));
  expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(report);
  expect(report).toMatchObject({
    schemaVersion: 1,
    url,
    engine: { name: "axe-core", version: expect.stringMatching(/^\d+\.\d+\.\d+/) },
    browser: { name: "chromium", version: expect.stringMatching(/^\d+/) },
    screenshot: "page.png",
    summary: { violations: 2, passed: expect.any(Number), incomplete: expect.any(Number) },
  });
  expect(new Date(report.capturedAt).toISOString()).toBe(report.capturedAt);
  const label = report.violations.find((rule) => rule.id === "label");
  expect(label).toMatchObject({
    impact: "critical",
    description: expect.stringMatching(/label/i),
    helpUrl: expect.stringMatching(/^https:/),
    elements: [{
      target: ["#email"],
      html: expect.stringContaining('id="email"'),
      impact: "critical",
      failureSummary: expect.stringMatching(/label/i),
    }],
  });
  const png = await readFile(join(dirname(reportPath), report.screenshot));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBeGreaterThan(100);
  expect(png.readUInt32BE(20)).toBeGreaterThan(100);
});

test("D · generates a scoped task from a real report and rejects malformed evidence", async ({ baseURL }, testInfo) => {
  const { report, reportPath } = await scanPage(`${baseURL}/before.html`, testInfo.outputPath("scan"));
  const label = report.violations.find((rule) => rule.id === "label");
  const node = label?.elements[0];
  if (!label || !node) throw new Error("The live scan did not produce the label finding.");

  const output = testInfo.outputPath("task.json");
  const result = await cli([
    "task", "--report", reportPath, "--rule", "label", "--out", output,
    "--allow-file", "public/before.html", "--allow-file", "tests/accessloop.spec.ts",
  ]);
  expect(result.code, result.stderr).toBe(0);
  const task = JSON.parse(await readFile(output, "utf8"));
  expect(task).toMatchObject({
    schemaVersion: 1,
    rule: { id: label.id, description: label.description, help: label.help, impact: label.impact },
    element: node,
    reproduction: { url: report.url, argv: ["npm", "run", "scan", "--", "--url", report.url] },
    scope: { allowedFiles: ["public/before.html", "tests/accessloop.spec.ts"] },
  });
  expect(task.references).toContain(label.helpUrl);
  expect(task.acceptanceCriteria.join(" ")).toContain("no new axe violations");
  expect(task.regressionTests.join(" ")).toContain("keyboard");
  expect(task.humanReview.join(" ")).toContain("before merge");

  const malformed = { ...report, violations: [{ ...label, elements: [{ ...node, failureSummary: null }] }] };
  expect(() => generateTask(malformed, "label", 0, ["public/before.html"])).toThrow(/actual failure summary/);
  expect(() => generateTask(report, "label", 0, ["../outside.html"])).toThrow(/repository-relative/);
  expect(() => generateTask(report, "label", 0, [])).toThrow(/--allow-file/);
  expect(() => generateTask(report, "label", 1, ["public/before.html"])).toThrow(/missing element 1/);
  expect(() => generateTask(report, "missing", 0, ["public/before.html"])).toThrow(/was not found/);
});

test("E · invalid inputs, unavailable pages and browser failures exit 2", async ({ baseURL }, testInfo) => {
  const browserPath = testInfo.outputPath("empty-browser-cache");
  await mkdir(browserPath, { recursive: true });
  const invalidReport = testInfo.outputPath("malformed.json");
  await writeFile(invalidReport, "{");
  const unavailable = createServer();
  unavailable.on("request", (_request, response) => response.destroy());
  await new Promise<void>((resolve) => unavailable.listen(0, "127.0.0.1", resolve));
  try {
    const address = unavailable.address();
    if (!address || typeof address === "string") throw new Error("Expected a local test server address.");
    const checks = await Promise.all([
      cli(["scan", "--url", "https://example.com"]),
      cli(["scan", "--url", `${baseURL}/missing.html`]),
      cli(["scan", "--url", `http://127.0.0.1:${address.port}/`]),
      cli(["scan", "--url", `${baseURL}/before.html`], { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserPath }),
      cli(["task", "--report", invalidReport, "--rule", "label", "--allow-file", "public/before.html"]),
    ]);
    expect(checks.map((check) => check.code)).toEqual([2, 2, 2, 2, 2]);
    expect(checks.map((check) => check.stderr)).toEqual([
      expect.stringContaining("loopback URL"),
      expect.stringContaining("HTTP 404"),
      expect.stringContaining("Could not open"),
      expect.stringContaining("Could not launch Chromium. Run npm run browser:install"),
      expect.stringContaining("Could not read a JSON scan report"),
    ]);
  } finally {
    unavailable.close();
  }
});

test("blocks cross-origin subresources and HTTP redirects before requesting their targets", async ({}, testInfo) => {
  let crossOriginRequests = 0;
  let redirectTargetRequests = 0;
  const otherOrigin = createServer((_request, response) => {
    crossOriginRequests++;
    response.writeHead(204).end();
  });
  await new Promise<void>((resolve) => otherOrigin.listen(0, "127.0.0.1", resolve));
  const otherAddress = otherOrigin.address();
  if (!otherAddress || typeof otherAddress === "string") throw new Error("Expected an origin for the subresource.");
  const crossOrigin = `http://127.0.0.1:${otherAddress.port}/image.png`;

  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/target" }).end();
    } else if (request.url === "/target") {
      redirectTargetRequests++;
      response.writeHead(204).end();
    } else {
      response.writeHead(200, { "Content-Type": "text/html" }).end(
        `<!doctype html><html lang="en"><title>Boundary test</title>
        <main><h1>Boundary test</h1><img src="${crossOrigin}" alt=""></main></html>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local test server address.");
    const url = `http://127.0.0.1:${address.port}`;
    const output = testInfo.outputPath("scan");
    await expect(scanPage(`${url}/redirect`, output)).rejects.toThrow(/HTTP redirects are blocked/);
    const { report } = await scanPage(url, output);
    expect(report.url).toBe(`${url}/`);
    expect(crossOriginRequests).toBe(0);
    expect(redirectTargetRequests).toBe(0);
  } finally {
    server.close();
    otherOrigin.close();
  }
});
