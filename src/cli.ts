import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { scanPage } from "./scan.ts";
import { generateTask } from "./task.ts";

const usage = `AccessLoop
  npm run scan -- --url <loopback-url> [--out <directory>]
  npm run task:generate -- --report <scan.json> --rule <axe-rule-id>
    [--element <zero-based-index>] --allow-file <relative-file> [--allow-file <relative-file> ...]
    [--out <task.json>]

Scan exits 0 for no violations, 1 for violations, and 2 for operational errors.
Task generation writes JSON to stdout unless --out is provided.`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || (args.length === 1 && args[0] === "--help")) {
    console.log(usage);
    return;
  }

  if (command === "scan") {
    const { values } = parseArgs({
      args,
      options: { url: { type: "string" }, out: { type: "string", default: "reports/local" } },
    });
    if (!values.url || !values.out) throw new Error("Scan requires --url and a non-empty output directory.");
    const { report, reportPath } = await scanPage(values.url, values.out);
    console.log(`Axe violations: ${report.summary.violations}. Incomplete rules: ${report.summary.incomplete}.`);
    console.log(`Report: ${reportPath}`);
    process.exitCode = report.summary.violations > 0 ? 1 : 0;
    return;
  }

  if (command === "task") {
    const { values } = parseArgs({
      args,
      options: {
        report: { type: "string" },
        rule: { type: "string" },
        element: { type: "string", default: "0" },
        "allow-file": { type: "string", multiple: true, default: [] },
        out: { type: "string" },
      },
    });
    if (!values.report || !values.rule) throw new Error("Task generation requires --report and --rule.");
    if (!/^\d+$/u.test(values.element)) throw new Error("--element must be a non-negative integer.");
    let report: unknown;
    try {
      report = JSON.parse(await readFile(values.report, "utf8"));
    } catch (cause) {
      throw new Error(`Could not read a JSON scan report from "${values.report}".`, { cause });
    }
    const task = generateTask(report, values.rule, Number(values.element), values["allow-file"]);
    const json = `${JSON.stringify(task, null, 2)}\n`;
    if (values.out) {
      const path = resolve(values.out);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, json);
      console.log(`Task: ${path}`);
    } else {
      process.stdout.write(json);
    }
    return;
  }

  throw new Error(`Unknown command "${command}". Run node src/cli.ts --help.`);
}

try {
  await main();
} catch (error) {
  console.error(`AccessLoop: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
