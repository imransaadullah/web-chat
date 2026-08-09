import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "web-chat": "src/index.ts" },
    format: ["iife", "esm"],
    platform: "browser",
    dts: true,
    sourcemap: true,
    clean: true,
    minify: true,
    outExtension({ format }) {
      if (format === "esm") return { js: ".esm.js" };
      return { js: ".js" };
    },
  },
  {
    // Loaded via a plain <script src> injected by the "share a page"
    // bookmarklet — self-executing, no exports, no globalName needed.
    entry: { bookmarklet: "src/bookmarklet.ts" },
    format: ["iife"],
    platform: "browser",
    sourcemap: true,
    clean: false,
    minify: true,
    outExtension: () => ({ js: ".js" }),
  },
]);
