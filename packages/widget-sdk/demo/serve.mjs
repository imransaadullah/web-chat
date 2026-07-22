// Tiny static file server for the demo page — avoids pulling in an extra
// dependency just to serve two files locally.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)); // packages/widget-sdk
const MIME = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json" };

createServer(async (req, res) => {
  const urlPath = req.url === "/" ? "/demo/index.html" : req.url.split("?")[0];
  const filePath = join(root, urlPath);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(5173, () => console.log("Demo running at http://localhost:5173"));
