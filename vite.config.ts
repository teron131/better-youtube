import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    nodePolyfills({
      include: ["async_hooks"],
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "@ui", replacement: path.resolve(__dirname, "./src/sidepanel") },
      { find: /^@langchain\/langgraph$/, replacement: path.resolve(__dirname, "./src/lib/langgraph-web-shim.ts") },
    ],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        background: path.resolve(__dirname, "src/background/index.ts"),
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
});
