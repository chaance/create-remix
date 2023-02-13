import https from "node:https";
let _versionCache: string | null = null;
export async function getLatestRemixVersion() {
	return new Promise<string>((resolve) => {
		if (_versionCache) {
			return resolve(_versionCache);
		}
		https.get("https://registry.npmjs.org/remix/latest", (res) => {
			let body = "";
			res.on("data", (chunk) => (body += chunk));
			res.on("end", () => {
				let { version } = JSON.parse(body);
				_versionCache = version;
				resolve(version);
			});
		});
	});
}
