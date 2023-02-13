import path from "node:path";
import { fileExists } from "./utils.js";

const packageManagerCache = new Map();

export type PackageManager = "npm" | "yarn" | "pnpm";

export async function detectPackageManager({
	cwd,
	default: defaultPM,
}: { cwd?: string; default?: PackageManager } = {}) {
	let type = await getTypeofLockFile(cwd);
	if (type) return type;
	if (defaultPM) return defaultPM;
	return type || defaultPM || "npm";
}

async function getTypeofLockFile(cwd = "."): Promise<PackageManager | null> {
	let key = `lockfile_${cwd}`;
	if (packageManagerCache.has(key)) {
		return Promise.resolve(packageManagerCache.get(key));
	}

	let [isYarn, isNpm, isPnpm] = await Promise.all([
		fileExists(path.resolve(cwd, "yarn.lock")),
		fileExists(path.resolve(cwd, "package-lock.json")),
		fileExists(path.resolve(cwd, "pnpm-lock.yaml")),
	]);
	let value: PackageManager | null = null;
	if (isYarn) {
		value = "yarn";
	} else if (isPnpm) {
		value = "pnpm";
	} else if (isNpm) {
		value = "npm";
	}
	if (value) {
		packageManagerCache.set(key, value);
	}
	return value;
}
