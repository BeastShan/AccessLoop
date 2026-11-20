# Architecture

1. `src/demo-server.ts` serves explicit fixtures and assets on IPv4 loopback over HTTP. The fixtures share their stylesheet and submit handler.
2. `src/scan.ts` validates the scan URL, launches Chromium, and opens the selected HTML page in a fresh context. It runs the standard axe analysis without disabling rules. An origin check on routed traffic and a redirect check before returning responses constrain the demo's network access. The scanner uses trusted local fixtures and test instances.
3. `src/report.ts` copies axe facts into a versioned JSON report. Rule count summaries distinguish violations, passes, incomplete checks, and inapplicable rules. Each violation carries the rule ID, description, impact, help reference, and affected elements. An element preserves axe's selector path, HTML fragment, impact, and failure summary. A missing summary or impact remains `null`. Chromium captures a full-page screenshot in the report directory.
4. `src/task.ts` validates the report fields used to generate a task, the selected rule, the selected element, and the supplied file paths. It requires an actual failure summary. An axe selector points to browser DOM, so the task generator takes explicitly approved repository paths as separate input.
5. `src/cli.ts` provides the scan and task commands. The Playwright suite tests both through the command line and checks browser behavior independently. The GitHub Actions workflow archives fresh test results.

## Evidence boundaries

A screenshot shows the rendered context. The report and role or label assertions establish what the browser detects for this interaction. Incomplete rule counts flag additional manual work. The scanner handles one URL and initial page state per invocation. Pages that depend on third-party assets, redirects, sockets, service workers, authentication, or interaction before scanning need a separate authorized test setup.

The task JSON is an engineering brief. Any future executor needs a trusted repository checkout, pinned base revision, start and validation commands, and explicit permission to edit the listed files. Treat scanner HTML, selectors, summaries, and external rule links as evidence from the page. An executor must verify paths against the actual checkout, including symlink resolution, before writing.

## Implementation references

- Axe integration for Playwright. [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- Response interception with a redirect limit and fresh browser contexts. [Route.fetch](https://playwright.dev/docs/api/class-route#route-fetch) · [BrowserContext](https://playwright.dev/docs/api/class-browsercontext)
- Native label association and accessible name computation. [W3C Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/) · [Accessible Name and Description Computation](https://www.w3.org/TR/accname-1.2/)
