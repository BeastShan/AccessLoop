import type { AffectedElement, Impact } from "./report.ts";
import { localScanUrl } from "./scan-url.ts";

const ariaInHtml = "https://www.w3.org/TR/html-aria/";
const waiAria = "https://www.w3.org/TR/wai-aria/";
const labels = "https://www.w3.org/WAI/tutorials/forms/labels/";
const impacts: readonly Impact[] = ["minor", "moderate", "serious", "critical", null];

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function httpsUrl(value: unknown): value is string {
  if (!text(value)) return false;
  const url = URL.parse(value);
  return url?.protocol === "https:" && !url.username && !url.password;
}

function impact(value: unknown): value is Impact {
  return impacts.some((level) => level === value);
}

function target(value: unknown): value is AffectedElement["target"] {
  return Array.isArray(value) && value.length > 0 && value.every(
    (selector: unknown) => text(selector) || (
      Array.isArray(selector) && selector.length >= 2 && selector.every(text)
    ),
  );
}

export function generateTask(
  report: unknown,
  ruleId: string,
  elementIndex: number,
  allowedFiles: readonly string[],
) {
  if (!object(report) || report.schemaVersion !== 1 || !text(report.url) || !Array.isArray(report.violations)) {
    throw new Error("Invalid scan report: expected a version 1 AccessLoop report.");
  }
  const scanUrl = localScanUrl(report.url).href;
  if (!text(ruleId) || !Number.isSafeInteger(elementIndex) || elementIndex < 0) {
    throw new Error("Select a rule ID and a non-negative integer element index.");
  }

  const finding = report.violations.find((candidate: unknown) => object(candidate) && candidate.id === ruleId);
  if (!object(finding)) {
    throw new Error(`Rule "${ruleId}" was not found in the report.`);
  }
  if (!text(finding.description) || !text(finding.help) || !httpsUrl(finding.helpUrl) ||
      !impact(finding.impact) || !Array.isArray(finding.elements)) {
    throw new Error(`Malformed axe finding for "${ruleId}": rule metadata or elements are invalid.`);
  }

  const element: unknown = finding.elements[elementIndex];
  if (!object(element) || !target(element.target) || !text(element.html) ||
      !impact(element.impact) || !text(element.failureSummary)) {
    throw new Error(`Malformed or missing element ${elementIndex} for "${ruleId}": expected axe target, HTML, impact and actual failure summary.`);
  }

  if (allowedFiles.length === 0 || allowedFiles.some((file) =>
    !text(file) || file !== file.trim() || /[\\:*?\[\]{}\u0000-\u001f\u007f]/u.test(file) ||
    file.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git"),
  )) {
    throw new Error("Provide one or more explicitly authorized repository-relative file paths with --allow-file. Globs are invalid.");
  }

  return {
    schemaVersion: 1,
    title: `Fix accessibility rule ${ruleId}: ${finding.help}`,
    rule: {
      id: ruleId,
      description: finding.description,
      help: finding.help,
      impact: finding.impact,
    },
    element: {
      target: element.target,
      html: element.html,
      impact: element.impact,
      failureSummary: element.failureSummary,
    },
    reproduction: {
      url: scanUrl,
      argv: ["npm", "run", "scan", "--", "--url", scanUrl],
      steps: [
        "Start the authorized local application at the recorded origin.",
        "Run the scanner with the recorded arguments from the AccessLoop checkout.",
        "Open the printed report path and confirm the rule and target against the browser evidence.",
      ],
    },
    references: [...new Set([finding.helpUrl, ariaInHtml, waiAria, ...(ruleId === "label" ? [labels] : [])])],
    scope: {
      allowedFiles: [...new Set(allowedFiles)],
      restrictions: [
        "Change only the explicitly authorized files.",
        "Keep authentication, billing, production configuration and unrelated infrastructure out of scope.",
      ],
    },
    acceptanceCriteria: [
      "The recorded violation no longer occurs at the affected control or its replacement.",
      "The audited page introduces no new axe violations with the same scan settings and rule coverage.",
      "Accessible names, keyboard navigation, focus and existing functionality are verified for the affected interaction.",
    ],
    regressionTests: [
      "Add or update a browser regression test for the affected control using its role and accessible name or label where applicable.",
      "Exercise the affected behavior and its keyboard path, and run the relevant existing regression suite.",
      "Rerun the same axe scan and compare findings against the original report.",
    ],
    humanReview: [
      "A reviewer confirms the scope, semantics, and keyboard and focus behavior before merge.",
      "Report incomplete axe checks, unverified behavior and any needed scope changes to the reviewer.",
      "Leave merge and deployment to authorized humans.",
    ],
  };
}
