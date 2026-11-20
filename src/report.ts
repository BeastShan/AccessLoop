import type AxeBuilder from "@axe-core/playwright";

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type AxeViolation = AxeResults["violations"][number];

export type Impact = NonNullable<AxeViolation["impact"]> | null;
export type ElementTarget = AxeViolation["nodes"][number]["target"];

export interface AffectedElement {
  target: ElementTarget;
  html: string;
  impact: Impact;
  failureSummary: string | null;
}

export interface Violation {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  impact: Impact;
  elements: AffectedElement[];
}

export interface ScanReport {
  schemaVersion: 1;
  url: string;
  capturedAt: string;
  engine: AxeResults["testEngine"];
  browser: { name: "chromium"; version: string };
  screenshot: "page.png";
  summary: {
    violations: number;
    passed: number;
    incomplete: number;
    inapplicable: number;
  };
  violations: Violation[];
}

export function makeReport(url: string, browserVersion: string, results: AxeResults): ScanReport {
  return {
    schemaVersion: 1,
    url,
    capturedAt: results.timestamp,
    engine: results.testEngine,
    browser: { name: "chromium", version: browserVersion },
    screenshot: "page.png",
    summary: {
      violations: results.violations.length,
      passed: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
    },
    violations: results.violations.map(({ id, description, help, helpUrl, impact, nodes }) => ({
      id,
      description,
      help,
      helpUrl,
      impact: impact ?? null,
      elements: nodes.map(({ target, html, impact, failureSummary }) => ({
        target,
        html,
        impact: impact ?? null,
        failureSummary: failureSummary ?? null,
      })),
    })),
  };
}
