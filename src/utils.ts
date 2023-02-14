import fs from "node:fs";

export const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export const identity = <V>(v: V) => v;

export function strip(str: string) {
	let pattern = [
		"[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
		"(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))",
	].join("|");
	let RGX = new RegExp(pattern, "g");
	return typeof str === "string" ? str.replace(RGX, "") : str;
}

export function getRandomItem<Arr extends any[]>(arr: Arr): Arr[number] {
	return arr[Math.floor(arr.length * Math.random())];
}

export function reverse<T>(arr: T[]): T[] {
	return [...arr].reverse();
}

export function isValidJsonObject(obj: any): obj is Record<string, unknown> {
	return !!(obj && typeof obj === "object" && !Array.isArray(obj));
}

export async function directoryExists(p: string) {
	try {
		let stat = await fs.promises.stat(p);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

export async function fileExists(p: string) {
	try {
		let stat = await fs.promises.stat(p);
		return stat.isFile();
	} catch {
		return false;
	}
}

export async function ensureDirectory(dir: string) {
	if (!(await directoryExists(dir))) {
		await fs.promises.mkdir(dir, { recursive: true });
	}
}

export function pathContains(path: string, dir: string) {
	let relative = path.replace(dir, "");
	return relative.length < path.length && !relative.startsWith("..");
}

export function isUrl(value: string | URL) {
	try {
		new URL(value);
		return true;
	} catch (_) {
		return false;
	}
}
