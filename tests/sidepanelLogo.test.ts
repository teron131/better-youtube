import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const LOGO_SERVICE_PATH = new URL("../src/sidepanel/services/logo.ts", import.meta.url);
const OPENAI_LOGO_PATH = new URL("../public/provider-logos/openai.png", import.meta.url);

test("sidepanel logo resolver uses normalized provider png assets first", async () => {
  const { resolveModelLogo } = await import(`${LOGO_SERVICE_PATH.href}?case=${Date.now()}`);

  const logo = resolveModelLogo({ provider: "open-ai" });
  const logoSource = await readFile(OPENAI_LOGO_PATH);

  assert.equal(logo, "/provider-logos/openai.png");
  assert.deepEqual(pngDimensions(logoSource), { width: 64, height: 64 });
});

test("sidepanel logo resolver maps provider aliases to png cache", async () => {
  const { resolveModelLogo } = await import(`${LOGO_SERVICE_PATH.href}?case=${Date.now()}`);

  assert.equal(resolveModelLogo({ provider: "qwen" }), "/provider-logos/qwen.png");
  assert.equal(resolveModelLogo({ provider: "xai" }), "/provider-logos/x-ai.png");
  assert.equal(resolveModelLogo({ provider: "moonshot-ai" }), "/provider-logos/moonshotai.png");
});

function pngDimensions(buffer: Buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
