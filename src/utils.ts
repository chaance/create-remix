import os from "node:os";
import fs from "node:fs";
import { type Key as ActionKey } from "node:readline";
import { erase, cursor } from "sisteransi";

export { type ActionKey };

const unicode = { enabled: os.platform() !== "win32" };
export const useAscii = () => !unicode.enabled;

export function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function identity<V>(v: V) {
	return v;
}

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

export function clear(prompt: string, perLine: number) {
	if (!perLine) return erase.line + cursor.to(0);
	let rows = 0;
	const lines = prompt.split(/\r?\n/);
	for (let line of lines) {
		rows += 1 + Math.floor(Math.max(strip(line).length - 1, 0) / perLine);
	}

	return erase.lines(rows);
}

export function lines(msg: string, perLine: number) {
	let lines = String(strip(msg) || "").split(/\r?\n/);
	if (!perLine) return lines.length;
	return lines
		.map((l) => Math.ceil(l.length / perLine))
		.reduce((a, b) => a + b);
}

export function action(key: ActionKey, isSelect: boolean) {
	if (key.meta && key.name !== "escape") return;

	if (key.ctrl) {
		if (key.name === "a") return "first";
		if (key.name === "c") return "abort";
		if (key.name === "d") return "abort";
		if (key.name === "e") return "last";
		if (key.name === "g") return "reset";
	}

	if (isSelect) {
		if (key.name === "j") return "down";
		if (key.name === "k") return "up";
	}

	if (key.name === "return") return "submit";
	if (key.name === "enter") return "submit"; // ctrl + J
	if (key.name === "backspace") return "delete";
	if (key.name === "delete") return "deleteForward";
	if (key.name === "abort") return "abort";
	if (key.name === "escape") return "exit";
	if (key.name === "tab") return "next";
	if (key.name === "pagedown") return "nextPage";
	if (key.name === "pageup") return "prevPage";
	// TODO create home() in prompt types (e.g. TextPrompt)
	if (key.name === "home") return "home";
	// TODO create end() in prompt types (e.g. TextPrompt)
	if (key.name === "end") return "end";

	if (key.name === "up") return "up";
	if (key.name === "down") return "down";
	if (key.name === "right") return "right";
	if (key.name === "left") return "left";

	return false;
}
