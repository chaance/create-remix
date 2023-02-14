import https from "node:https";
let _versionCache: string | null = null;
export async function getLatestRemixVersion() {
	return new Promise<string>((resolve) => {
		if (_versionCache) {
			return resolve(_versionCache);
		}
		let request = https.get(
			"https://registry.npmjs.org/remix/latest",
			(res) => {
				let body = "";
				res.on("data", (chunk) => (body += chunk));
				res.on("end", () => {
					let { version } = JSON.parse(body);
					_versionCache = version;
					resolve(version);
				});
			}
		);

		// set a short timeout to avoid super slow initiation
		request.setTimeout(5000);

		// This avoids annoying connection reset issues as a result of a closed
		// connection at the end, after we already have what we need from our get
		// request to npm. If the request fails entirely we'll just hard-code a
		// value and try to keep it updated.
		request.on("error", () => {
			resolve(_versionCache || "1.12.0");
		});
	});
}
