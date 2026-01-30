import path from "path";
import { defineConfig, loadEnv } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [nodePolyfills()],
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "./src") },
        {
          find: /^@langchain\/langgraph$/,
          replacement: path.resolve(
            __dirname,
            "./src/core/langgraph-web-shim.ts",
          ),
        },
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
  };
});
