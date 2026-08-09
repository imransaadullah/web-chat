import { defineConfig } from "tsup";

export default defineConfig({
  entry: { lib: "src/lib.ts" },
  // Not "dist" — that's vite build's output dir for the standalone app
  // (see App.tsx/main.tsx); the two would otherwise clobber each other,
  // and tsup's clean:true would delete the other build's output on rerun.
  outDir: "dist-lib",
  format: ["esm", "cjs"],
  platform: "browser",
  dts: true,
  sourcemap: true,
  clean: true,
  // react/react-dom (peerDependencies) and socket.io-client (a dependency)
  // are externalized automatically from package.json — a host app
  // (trustmail) supplies its own React instance and can share one
  // socket.io-client across its own bundle and this one. @web-chat/shared
  // is the opposite case: it's a workspace-internal, unpublished package
  // (types + a couple of constants, no runtime deps of its own — see
  // packages/shared/package.json), so it must be inlined rather than left
  // as an external dependency trustmail's npm install could never resolve.
  noExternal: [/^@web-chat\//],
});
