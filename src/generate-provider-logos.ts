import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const LOGO_SIZE = 64;
const FORCE = process.argv.includes("--force");
const PROVIDER_LOGO_DIR = "public/provider-logos";

const providerLogoPaths = await readProviderLogoPaths();
const result = await normalizeProviderLogoAssets(providerLogoPaths);

console.log(
	JSON.stringify(
		{
			outputDir: PROVIDER_LOGO_DIR,
			size: LOGO_SIZE,
			providers: providerLogoPaths.length,
			written: result.written,
			skipped: result.skipped,
			force: FORCE,
		},
		null,
		2,
	),
);

async function readProviderLogoPaths() {
	const entries = await readdir(resolve(PROVIDER_LOGO_DIR));
	return entries
		.filter((entry) => /^[a-z0-9-]+\.png$/.test(entry))
		.map((entry) => `${PROVIDER_LOGO_DIR}/${entry}`)
		.sort((left, right) => left.localeCompare(right));
}

async function normalizeProviderLogoAssets(paths: string[]) {
	const written: string[] = [];
	const skipped: string[] = [];

	for (const path of paths) {
		if (!FORCE && (await isNormalizedLogo(path))) {
			skipped.push(path);
			continue;
		}

		const sourceBuffer = await readFile(resolve(path));
		const normalizedLogo = await resizeLogoToPng(sourceBuffer);
		await writeFile(resolve(path), normalizedLogo);
		written.push(path);
	}

	return { written, skipped };
}

async function resizeLogoToPng(imageBuffer: Buffer) {
	return sharp(imageBuffer, { density: 300 })
		.trim({
			background: {
				r: 0,
				g: 0,
				b: 0,
				alpha: 0,
			},
			threshold: 8,
		})
		.resize(LOGO_SIZE, LOGO_SIZE, {
			fit: "contain",
			background: {
				r: 0,
				g: 0,
				b: 0,
				alpha: 0,
			},
		})
		.png()
		.toBuffer();
}

async function isNormalizedLogo(path: string) {
	try {
		const metadata = await sharp(await readFile(resolve(path))).metadata();
		return (
			metadata.format === "png" &&
			metadata.width === LOGO_SIZE &&
			metadata.height === LOGO_SIZE
		);
	} catch {
		return false;
	}
}
