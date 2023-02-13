// import fs from "node:fs";
// import path from "node:path";
import { defineConfig } from "tsup";
import pkgJson from "./package.json";

let { name: packageName, version: packageVersion } = pkgJson;

export default defineConfig((options) => {
	let entry = ["src/create-remix.ts"];
	let external = ["react", "react-dom"];
	let target = "es2020";
	let banner = createBanner({
		author: "Chance Strickland",
		creationYear: 2023,
		license: "MIT",
		packageName,
		version: packageVersion,
	});

	return [
		{
			entry,
			format: "esm",
			sourcemap: true,
			external,
			banner: { js: banner },
			target,
			dts: { banner },
		},
	];
});

function createBanner({
	packageName,
	version,
	author,
	license,
	creationYear,
}: {
	packageName: string;
	version: string;
	author: string;
	license: string;
	creationYear: string | number;
}) {
	let currentYear = new Date().getFullYear();
	let year =
		currentYear === Number(creationYear)
			? currentYear
			: `${creationYear}-${currentYear}`;

	return `/**
 * ${packageName} v${version}
 *
 * Copyright (c) ${year}, ${author}
 *
 * This source code is licensed under the ${license} license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @license ${license}
 */
`;
}
