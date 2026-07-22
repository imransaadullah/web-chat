import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "web-chat": "src/index.ts" },
  format: ["iife", "esm"],
  globalName: "WebChat",
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  outExtension({ format }) {
    if (format === "esm") return { js: ".esm.js" };
    return { js: ".js" };
  },
});
