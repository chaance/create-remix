import os from "node:os";
import { type Key as ActionKey } from "node:readline";
import { erase, cursor } from "sisteransi";
import { color } from "../color.js";
import { strip } from "../utils.js";

export { color, strip, type ActionKey };

const unicode = { enabled: os.platform() !== "win32" };
export const useAscii = () => !unicode.enabled;

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
