import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "../product-demo/node_modules/playwright/index.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const three =
	process.env.TURNWISE_THREE ||
	"/private/tmp/turnwise-runtime/node_modules/three";
const out = path.join(here, "out");
await fs.mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url, "http://localhost");
		let file = url.pathname.startsWith("/three/")
			? path.join(three, url.pathname.slice(7))
			: path.join(here, "scene.html");
		let content = await fs.readFile(file, "utf8");
		if (file.endsWith(".html"))
			content = content.replace(
				'<script type="module">',
				'<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><script type="module">',
			);
		res.setHeader(
			"Content-Type",
			file.endsWith(".js") ? "text/javascript" : "text/html",
		);
		res.end(content);
	} catch (e) {
		res.statusCode = 404;
		res.end(String(e));
	}
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const browser = await chromium.launch({
	channel: "chrome",
	headless: true,
	args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
	viewport: { width: 1080, height: 1920 },
	deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error(e));
try {
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.waitForFunction(() => window.ready);
	for (const t of [0, 2.2, 6.8, 10.8, 13.5, 15.5, 17, 20, 21.9]) {
		await page.evaluate((t) => window.renderAt(t), t);
		await page.screenshot({ path: path.join(out, `frame-${t}.png`) });
	}
	if (!process.argv.includes("--samples")) {
		const ff = spawn(
			"ffmpeg",
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-f",
				"image2pipe",
				"-vcodec",
				"png",
				"-framerate",
				"30",
				"-i",
				"pipe:0",
				"-an",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-crf",
				"16",
				"-pix_fmt",
				"yuv420p",
				"-movflags",
				"+faststart",
				path.join(here, "assets", "turnwise-001-picture.mp4"),
			],
			{ stdio: ["pipe", "inherit", "inherit"] },
		);
		for (let i = 0; i < 660; i++) {
			const data = await page.evaluate((t) => {
				window.renderAt(t);
				return document
					.querySelector("canvas")
					.toDataURL("image/png")
					.split(",")[1];
			}, i / 30);
			if (!ff.stdin.write(Buffer.from(data, "base64")))
				await once(ff.stdin, "drain");
			if (i % 90 === 0) console.log(`Rendered ${i}/660 frames`);
		}
		ff.stdin.end();
		const [code] = await once(ff, "close");
		if (code !== 0) throw new Error(`FFmpeg exit ${code}`);
		console.log("Completed 660 frames / 22 seconds / 1080 × 1920.");
	}
} finally {
	await browser.close();
	server.close();
}
