import process from "node:process";
import { color } from "./color.js";

export let stdout = process.stdout;
/** @internal Used to mock `process.stdout.write` for testing purposes */
export function setStdout(writable: typeof process.stdout) {
	stdout = writable;
}

export function log(message: string) {
	return stdout.write(message + "\n");
}

export function info(prefix: string, text: string) {
	if (stdout.columns < 80) {
		log(`${" ".repeat(5)} ${color.cyan("◼")}  ${color.cyan(prefix)}`);
		log(`${" ".repeat(9)}${color.dim(text)}`);
	} else {
		log(
			`${" ".repeat(5)} ${color.cyan("◼")}  ${color.cyan(prefix)} ${color.dim(
				text
			)}`
		);
	}
}

export function error(prefix: string, text: string) {
	if (stdout.columns < 80) {
		log(`${" ".repeat(5)} ${color.red("▲")}  ${color.red(prefix)}`);
		log(`${" ".repeat(9)}${text}`);
	} else {
		log(`${" ".repeat(5)} ${color.red("▲")}  ${color.red(prefix)} ${text}`);
	}
}
