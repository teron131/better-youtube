import path from "path";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ["async_hooks"],
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^@langchain\/langgraph$/, replacement: path.resolve(__dirname, "./src/lib/langgraph-web-shim.ts") },
    ],
  },
  build: {
    emptyOutDir: false,
    outDir: "dist",
    lib: {
      entry: path.resolve(__dirname, "src/content/index.ts"),
      name: "ContentScript",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
