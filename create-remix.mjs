#!/usr/bin/env node
"use strict";

import process from "node:process";

const currentVersion = process.versions.node;
const requiredMajorVersion = parseInt(currentVersion.split(".")[0], 10);
const minimumMajorVersion = 14;

if (requiredMajorVersion < minimumMajorVersion) {
	console.error(`Node.js v${currentVersion} is out of date and unsupported!`);
	console.error(`Please use Node.js v${minimumMajorVersion} or higher.`);
	process.exit(1);
}

import("./dist/create-remix.js").then(({ main }) => main());
