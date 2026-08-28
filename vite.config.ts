/** Builds the extension side panel and background worker with browser-compatible aliases. */

import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(() => {
  return {
    plugins: [react(), nodePolyfills()],
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "./src") },
        {
          find: "@ui",
          replacement: path.resolve(__dirname, "./src/sidepanel"),
        },
        {
          find: /^@langchain\/langgraph$/,
          replacement: path.resolve(__dirname, "./src/core/langgraph-web-shim.ts"),
        },
      ],
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        input: {
          sidepanel: path.resolve(__dirname, "sidepanel.html"),
          background: path.resolve(__dirname, "src/handlers/index.ts"),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            // Output background script to root of dist
            if (chunkInfo.name === "background") {
              return "[name].js";
            }
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    define: {
      __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    },
  };
});
