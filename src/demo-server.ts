import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const pages = new Map([
  ["/", { file: "after.html", type: "text/html" }],
  ["/before.html", { file: "before.html", type: "text/html" }],
  ["/after.html", { file: "after.html", type: "text/html" }],
  ["/demo.css", { file: "demo.css", type: "text/css" }],
  ["/demo.js", { file: "demo.js", type: "text/javascript" }],
]);

const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const page = pages.get(request.url?.split("?", 1)[0] ?? "");
  if (!page) {
    response.writeHead(404).end("Demo page not found.");
    return;
  }
  try {
    const body = await readFile(new URL(`../public/${page.file}`, import.meta.url));
    response.writeHead(200, { "Content-Type": `${page.type}; charset=utf-8` });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end("Could not read the demo file.");
  }
});

server.once("error", (error) => {
  console.error(`Could not start demo server: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`AccessLoop demo at http://127.0.0.1:${port}`);
});
