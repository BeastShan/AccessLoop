import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { makeReport } from "./report.ts";
import { localScanUrl } from "./scan-url.ts";

const timeout = 10_000;

export async function scanPage(input: string, outputRoot: string) {
  const url = localScanUrl(input);
  const browser = await chromium.launch({ headless: true, timeout }).catch((cause: unknown) => {
    throw new Error("Could not launch Chromium. Run npm run browser:install and check system dependencies.", {
      cause,
    });
  });

  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    let navigationError: string | undefined;
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== url.origin) {
        await route.abort("blockedbyclient");
        return;
      }

      // Playwright only routes the first request of a redirect chain. Inspect the
      // response here so Chromium never follows a redirect.
      const response = await route.fetch({ maxRedirects: 0, timeout }).catch((error: Error) => {
        if (request.isNavigationRequest() && request.url() === url.href.split("#", 1)[0]) {
          navigationError = error.message.split("\n", 1)[0];
        }
        return null;
      });
      if (!response) {
        await route.abort("failed");
        return;
      }
      try {
        if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
          if (request.isNavigationRequest()) {
            navigationError = "HTTP redirects are blocked. Scan the final loopback URL directly.";
          }
          await route.abort("blockedbyclient");
          return;
        }
        await route.fulfill({ response });
      } finally {
        await response.dispose();
      }
    });
    await context.routeWebSocket(/.*/, (socket) => socket.close());

    const page = await context.newPage();
    const response = await page.goto(url.href, { waitUntil: "load", timeout }).catch((error: Error) => {
      throw new Error(`Could not open ${url.href}: ${navigationError ?? error.message.split("\n", 1)[0]}`, {
        cause: error,
      });
    });
    if (!response?.ok()) {
      throw new Error(`Could not open ${url.href}: ${response ? `HTTP ${response.status()}` : "no HTTP response"}.`);
    }
    const contentType = response.headers()["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
      throw new Error(`Could not scan ${url.href}: expected an HTML response.`);
    }

    const results = await new AxeBuilder({ page }).analyze().catch((cause: unknown) => {
      throw new Error(`axe-core could not analyze ${url.href}.`, { cause });
    });
    const report = makeReport(page.url(), browser.version(), results);
    const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", timeout });

    const root = resolve(outputRoot);
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "scan-"));
    const reportPath = join(directory, "scan.json");
    await writeFile(join(directory, report.screenshot), screenshot);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return { report, reportPath };
  } finally {
    await browser.close();
  }
}
