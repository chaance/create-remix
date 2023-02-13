import os from "node:os";
import EventEmitter from "node:events";
import readline, { type Key as ActionKey } from "node:readline";
import color from "chalk";
import { beep, erase, cursor } from "sisteransi";
import { strip, identity } from "./utils.js";

const unicode = { enabled: os.platform() !== "win32" };
const useAscii = () => !unicode.enabled;

const prompts = {
	text: (args: TextPromptOptions) => toPrompt("TextPrompt", args),
	confirm: (args: ConfirmPromptOptions) => toPrompt("ConfirmPrompt", args),
	select: <Choices extends readonly Readonly<SelectChoice>[]>(
		args: SelectPromptOptions<Choices>
	) => toPrompt("SelectPrompt", args),
	multiselect: <Choices extends readonly Readonly<SelectChoice>[]>(
		args: MultiSelectPromptOptions<Choices>
	) => toPrompt("MultiselectPrompt", args),
};

async function prompt<
	T extends Readonly<PromptType<any>> | Readonly<PromptType<any>[]>,
	P extends T extends Readonly<any[]> ? T[number] : T = T extends Readonly<
		any[]
	>
		? T[number]
		: T
>(questions: T, opts: PromptTypeOptions<P> = {}): Promise<Answers<T>> {
	let {
		onSubmit = identity,
		onCancel = () => process.exit(0),
		stdin = process.stdin,
		stdout = process.stdout,
	} = opts;

	let answers = {} as Answers<T>;

	let questionz = (
		Array.isArray(questions) ? questions : [questions]
	) as Readonly<P[]>;
	let answer: Answer<P>;
	let quit: any;
	let name: string;
	let type: P["type"];

	for (let question of questionz) {
		({ name, type } = question);

		try {
			// Get the injected answer if there is one or prompt the user
			// @ts-expect-error
			answer = await prompts[type](Object.assign({ stdin, stdout }, question));
			answers[name] = answer as any;
			quit = await onSubmit(question, answer, answers);
		} catch (err) {
			quit = !(await onCancel(question, answers));
		}
		if (quit) {
			return answers;
		}
	}
	return answers;
}

function toPrompt<T extends PromptType["name"]>(
	name: T,
	args: any,
	opts: any = {}
) {
	if (
		name !== "TextPrompt" &&
		name !== "ConfirmPrompt" &&
		name !== "SelectPrompt" &&
		name !== "MultiSelectPrompt"
	) {
		throw new Error(`Invalid prompt type: ${name}`);
	}

	return new Promise((res, rej) => {
		const El =
			name === "TextPrompt"
				? TextPrompt
				: name === "ConfirmPrompt"
				? ConfirmPrompt
				: name === "SelectPrompt"
				? SelectPrompt
				: MultiSelectPrompt;

		let p = new El(
			args,
			// @ts-expect-error
			opts
		);
		let onAbort = args.onAbort || opts.onAbort || identity;
		let onSubmit = args.onSubmit || opts.onSubmit || identity;
		let onExit = args.onExit || opts.onExit || identity;
		p.on("state", args.onState || identity);
		p.on("submit", (x: any) => res(onSubmit(x)));
		p.on("exit", (x: any) => res(onExit(x)));
		p.on("abort", (x: any) => rej(onAbort(x)));
	});
}

interface PromptOptions {
	stdin?: typeof process.stdin;
	stdout?: typeof process.stdout;
	onRender?(render: (...text: unknown[]) => string): void;
	onSubmit?(
		v: any
	): void | undefined | boolean | Promise<void | undefined | boolean>;
	onCancel?(
		v: any
	): void | undefined | boolean | Promise<void | undefined | boolean>;
	onAbort?(
		v: any
	): void | undefined | boolean | Promise<void | undefined | boolean>;
	onExit?(
		v: any
	): void | undefined | boolean | Promise<void | undefined | boolean>;
	onState?(
		v: any
	): void | undefined | boolean | Promise<void | undefined | boolean>;
}

class Prompt extends EventEmitter {
	firstRender: boolean;
	in: any;
	out: any;
	onRender: any;
	close: () => void;
	aborted: any;
	exited: any;
	closed: boolean | undefined;
	name = "Prompt";

	constructor(opts: PromptOptions = {}) {
		super();
		this.firstRender = true;
		this.in = opts.stdin || process.stdin;
		this.out = opts.stdout || process.stdout;
		this.onRender = (opts.onRender || (() => void 0)).bind(this);
		const rl = readline.createInterface({
			input: this.in,
			escapeCodeTimeout: 50,
		});
		readline.emitKeypressEvents(this.in, rl);

		if (this.in.isTTY) this.in.setRawMode(true);
		let isSelect =
			["SelectPrompt", "MultiSelectPrompt"].indexOf(this.constructor.name) > -1;

		let keypress = (str: string, key: ActionKey) => {
			if (this.in.isTTY) this.in.setRawMode(true);
			let a = action(key, isSelect);
			if (a === false) {
				try {
					this._(str, key);
				} catch (_) {}
				// @ts-expect-error
			} else if (typeof this[a] === "function") {
				// @ts-expect-error
				this[a](key);
			}
		};

		this.close = () => {
			this.out.write(cursor.show);
			this.in.removeListener("keypress", keypress);
			if (this.in.isTTY) this.in.setRawMode(false);
			rl.close();
			this.emit(
				this.aborted ? "abort" : this.exited ? "exit" : "submit",
				// @ts-expect-error
				this.value
			);
			this.closed = true;
		};

		this.in.on("keypress", keypress);
	}

	get type(): string {
		throw new Error("Method type not implemented.");
	}

	bell() {
		this.out.write(beep);
	}

	fire() {
		this.emit("state", {
			// @ts-expect-error
			value: this.value,
			aborted: !!this.aborted,
			exited: !!this.exited,
		});
	}

	render() {
		this.onRender(color);
		if (this.firstRender) this.firstRender = false;
	}

	_(c: string, key: ActionKey) {
		throw new Error("Method _ not implemented.");
	}
}

interface TextPromptOptions extends PromptOptions {
	label: string;
	message: string;
	initial?: string;
	style?: string;
	validate?: (v: any) => v is string;
	error?: string;
	hint?: string;
}

class TextPrompt extends Prompt {
	transform: { render: (v: string) => any; scale: number };
	label: string;
	scale: number;
	msg: string;
	initial: string;
	hint?: string;
	validator: (v: any) => boolean | Promise<boolean>;
	errorMsg: string;
	cursor: number;
	cursorOffset: number;
	clear: any;
	done: boolean | undefined;
	error: boolean | undefined;
	red: boolean | undefined;
	outputError: string | undefined;
	name = "TextPrompt" as const;

	// set by value setter, value is set in constructor
	_value!: string;
	placeholder!: boolean;
	rendered!: string;

	// set by render which is called in constructor
	outputText!: string;

	constructor(opts: TextPromptOptions) {
		super(opts);
		this.transform = { render: (v) => v, scale: 1 };
		this.label = opts.label;
		this.scale = this.transform.scale;
		this.msg = opts.message;
		this.hint = opts.hint;
		this.initial = opts.initial || "";
		this.validator = opts.validate || (() => true);
		this.value = "";
		this.errorMsg = opts.error || "Please enter a valid value";
		this.cursor = Number(!!this.initial);
		this.cursorOffset = 0;
		this.clear = clear(``, this.out.columns);
		this.render();
	}

	get type() {
		return "text" as const;
	}

	set value(v: string) {
		if (!v && this.initial) {
			this.placeholder = true;
			this.rendered = color.dim(this.initial);
		} else {
			this.placeholder = false;
			this.rendered = this.transform.render(v);
		}
		this._value = v;
		this.fire();
	}

	get value() {
		return this._value;
	}

	reset() {
		this.value = "";
		this.cursor = Number(!!this.initial);
		this.cursorOffset = 0;
		this.fire();
		this.render();
	}

	exit() {
		this.abort();
	}

	abort() {
		this.value = this.value || this.initial;
		this.done = this.aborted = true;
		this.error = false;
		this.red = false;
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	async validate() {
		let valid = await this.validator(this.value);
		if (typeof valid === `string`) {
			this.errorMsg = valid;
			valid = false;
		}
		this.error = !valid;
	}

	async submit() {
		this.value = this.value || this.initial;
		this.cursorOffset = 0;
		this.cursor = this.rendered.length;
		await this.validate();
		if (this.error) {
			this.red = true;
			this.fire();
			this.render();
			return;
		}
		this.done = true;
		this.aborted = false;
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	next() {
		if (!this.placeholder) return this.bell();
		this.value = this.initial;
		this.cursor = this.rendered.length;
		this.fire();
		this.render();
	}

	moveCursor(n: number) {
		if (this.placeholder) return;
		this.cursor = this.cursor + n;
		this.cursorOffset += n;
	}

	_(c: string, key: ActionKey) {
		let s1 = this.value.slice(0, this.cursor);
		let s2 = this.value.slice(this.cursor);
		this.value = `${s1}${c}${s2}`;
		this.red = false;
		this.cursor = this.placeholder ? 0 : s1.length + 1;
		this.render();
	}

	delete() {
		if (this.isCursorAtStart()) return this.bell();
		let s1 = this.value.slice(0, this.cursor - 1);
		let s2 = this.value.slice(this.cursor);
		this.value = `${s1}${s2}`;
		this.red = false;
		this.outputError = "";
		this.error = false;
		if (this.isCursorAtStart()) {
			this.cursorOffset = 0;
		} else {
			this.cursorOffset++;
			this.moveCursor(-1);
		}
		this.render();
	}

	deleteForward() {
		if (this.cursor * this.scale >= this.rendered.length || this.placeholder)
			return this.bell();
		let s1 = this.value.slice(0, this.cursor);
		let s2 = this.value.slice(this.cursor + 1);
		this.value = `${s1}${s2}`;
		this.red = false;
		this.outputError = "";
		this.error = false;
		if (this.isCursorAtEnd()) {
			this.cursorOffset = 0;
		} else {
			this.cursorOffset++;
		}
		this.render();
	}

	first() {
		this.cursor = 0;
		this.render();
	}

	last() {
		this.cursor = this.value.length;
		this.render();
	}

	left() {
		if (this.cursor <= 0 || this.placeholder) return this.bell();
		this.moveCursor(-1);
		this.render();
	}

	right() {
		if (this.cursor * this.scale >= this.rendered.length || this.placeholder)
			return this.bell();
		this.moveCursor(1);
		this.render();
	}

	isCursorAtStart() {
		return this.cursor === 0 || (this.placeholder && this.cursor === 1);
	}

	isCursorAtEnd() {
		return (
			this.cursor === this.rendered.length ||
			(this.placeholder && this.cursor === this.rendered.length + 1)
		);
	}

	render() {
		if (this.closed) return;
		if (!this.firstRender) {
			if (this.outputError)
				this.out.write(
					cursor.down(lines(this.outputError, this.out.columns) - 1) +
						clear(this.outputError, this.out.columns)
				);
			this.out.write(clear(this.outputText, this.out.columns));
		}
		super.render();
		this.outputError = "";

		let prefix = " ".repeat(strip(this.label).length);

		this.outputText = [
			"\n",
			this.label,
			" ",
			this.msg,
			this.done
				? ""
				: this.hint
				? (this.out.columns < 80 ? "\n" + " ".repeat(8) : "") +
				  color.dim(` (${this.hint})`)
				: "",
			"\n" + prefix,
			" ",
			this.done ? color.dim(this.rendered) : this.rendered,
		].join("");

		if (this.error) {
			this.outputError += `  ${color.redBright(
				(useAscii() ? "> " : "▶ ") + this.errorMsg
			)}`;
		}

		this.out.write(
			erase.line +
				cursor.to(0) +
				this.outputText +
				cursor.save +
				this.outputError +
				cursor.restore +
				cursor.move(
					this.placeholder
						? (this.rendered.length - 9) * -1
						: this.cursorOffset,
					0
				)
		);
	}
}

interface ConfirmPromptOptions extends PromptOptions {
	label: string;
	message: string;
	initial?: boolean;
	hint?: string;
	validate?: (v: any) => boolean;
	error?: string;
}

type ConfirmPromptChoices = [
	{ value: true; label: string },
	{ value: false; label: string }
];

class ConfirmPrompt extends Prompt {
	label: string;
	msg: string;
	value: boolean | undefined;
	initialValue: boolean;
	hint?: string;
	choices: ConfirmPromptChoices;
	cursor: number;
	done: boolean | undefined;
	name = "ConfirmPrompt" as const;

	// set by render which is called in constructor
	outputText!: string;

	constructor(opts: ConfirmPromptOptions) {
		super(opts);
		this.label = opts.label;
		this.hint = opts.hint;
		this.msg = opts.message;
		this.value = opts.initial;
		this.initialValue = !!opts.initial;
		this.choices = [
			{ value: true, label: "Yes" },
			{ value: false, label: "No" },
		];
		this.cursor = this.choices.findIndex((c) => c.value === this.initialValue);
		this.render();
	}

	get type() {
		return "confirm" as const;
	}

	exit() {
		this.abort();
	}

	abort() {
		this.done = this.aborted = true;
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	submit() {
		this.value = this.value || false;
		this.cursor = this.choices.findIndex((c) => c.value === this.value);
		this.done = true;
		this.aborted = false;
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	moveCursor(n: number) {
		this.cursor = n;
		this.value = this.choices[n].value;
		this.fire();
	}

	reset() {
		this.moveCursor(0);
		this.fire();
		this.render();
	}

	first() {
		this.moveCursor(0);
		this.render();
	}

	last() {
		this.moveCursor(this.choices.length - 1);
		this.render();
	}

	left() {
		if (this.cursor === 0) {
			this.moveCursor(this.choices.length - 1);
		} else {
			this.moveCursor(this.cursor - 1);
		}
		this.render();
	}

	right() {
		if (this.cursor === this.choices.length - 1) {
			this.moveCursor(0);
		} else {
			this.moveCursor(this.cursor + 1);
		}
		this.render();
	}

	_(c: string, key: ActionKey) {
		if (!Number.isNaN(Number.parseInt(c))) {
			let n = Number.parseInt(c) - 1;
			this.moveCursor(n);
			this.render();
			return this.submit();
		}
		if (c.toLowerCase() === "y") {
			this.value = true;
			return this.submit();
		}
		if (c.toLowerCase() === "n") {
			this.value = false;
			return this.submit();
		}
		return;
	}

	render() {
		if (this.closed) {
			return;
		}
		if (this.firstRender) {
			this.out.write(cursor.hide);
		} else {
			this.out.write(clear(this.outputText, this.out.columns));
		}
		super.render();
		let outputText = [
			"\n",
			this.label,
			" ",
			this.msg,
			this.done ? "" : this.hint ? color.dim(` (${this.hint})`) : "",
			"\n",
		];

		outputText.push(" ".repeat(strip(this.label).length));

		if (this.done) {
			outputText.push(" ", color.dim(`${this.choices[this.cursor].label}`));
		} else {
			outputText.push(
				" ",
				this.choices
					.map((choice, i) =>
						i === this.cursor
							? `${color.green("●")} ${choice.label} `
							: color.dim(`○ ${choice.label} `)
					)
					.join(color.dim(" "))
			);
		}
		this.outputText = outputText.join("");

		this.out.write(erase.line + cursor.to(0) + this.outputText);
	}
}

interface SelectChoice {
	value: unknown;
	label: string;
	hint?: string;
}

interface SelectPromptOptions<
	Choices extends Readonly<Readonly<SelectChoice>[]>
> extends PromptOptions {
	hint?: string;
	message: string;
	label: string;
	initial?: Choices[number]["value"] | undefined;
	validate?: (v: any) => boolean;
	error?: string;
	choices: Choices;
}

class SelectPrompt<
	Choices extends Readonly<Readonly<SelectChoice>[]>
> extends Prompt {
	choices: Choices;
	label: string;
	msg: string;
	hint?: string;
	value: Choices[number]["value"] | undefined;
	initialValue: Choices[number]["value"];
	search: string | null;
	done: boolean | undefined;
	cursor: number;
	name = "SelectPrompt" as const;
	private _timeout: NodeJS.Timeout | undefined;

	// set by render which is called in constructor
	outputText!: string;

	constructor(opts: SelectPromptOptions<Choices>) {
		if (
			!opts.choices ||
			!Array.isArray(opts.choices) ||
			opts.choices.length < 1
		) {
			throw new Error("SelectPrompt must contain choices");
		}
		super(opts);
		this.label = opts.label;
		this.hint = opts.hint;
		this.msg = opts.message;
		this.value = opts.initial;
		this.choices = opts.choices;
		this.initialValue = opts.initial || this.choices[0].value;
		this.cursor = this.choices.findIndex((c) => c.value === this.initialValue);
		this.search = null;
		this.render();
	}

	get type() {
		return "select" as const;
	}

	exit() {
		this.abort();
	}

	abort() {
		this.done = this.aborted = true;
		this.cursor = this.choices.findIndex((c) => c.value === this.initialValue);
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	submit() {
		this.value = this.value || undefined;
		this.cursor = this.choices.findIndex((c) => c.value === this.value);
		this.done = true;
		this.aborted = false;
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	delete() {
		this.search = null;
		this.render();
	}

	_(c: string, key: ActionKey) {
		if (this._timeout) clearTimeout(this._timeout);
		if (!Number.isNaN(Number.parseInt(c))) {
			const n = Number.parseInt(c) - 1;
			this.moveCursor(n);
			this.render();
			return this.submit();
		}
		this.search = this.search || "";
		this.search += c.toLowerCase();
		const choices = !this.search
			? this.choices.slice(this.cursor)
			: this.choices;
		const n = choices.findIndex((c) =>
			c.label.toLowerCase().includes(this.search!)
		);
		if (n > -1) {
			this.moveCursor(n);
			this.render();
		}
		this._timeout = setTimeout(() => {
			this.search = null;
		}, 500);
	}

	moveCursor(n: number) {
		this.cursor = n;
		this.value = this.choices[n].value;
		this.fire();
	}

	reset() {
		this.moveCursor(0);
		this.fire();
		this.render();
	}

	first() {
		this.moveCursor(0);
		this.render();
	}

	last() {
		this.moveCursor(this.choices.length - 1);
		this.render();
	}

	up() {
		if (this.cursor === 0) {
			this.moveCursor(this.choices.length - 1);
		} else {
			this.moveCursor(this.cursor - 1);
		}
		this.render();
	}

	down() {
		if (this.cursor === this.choices.length - 1) {
			this.moveCursor(0);
		} else {
			this.moveCursor(this.cursor + 1);
		}
		this.render();
	}

	highlight(label: string) {
		if (!this.search) return label;
		let n = label.toLowerCase().indexOf(this.search.toLowerCase());
		if (n === -1) return label;
		return [
			label.slice(0, n),
			color.underline(label.slice(n, n + this.search.length)),
			label.slice(n + this.search.length),
		].join("");
	}

	render() {
		if (this.closed) return;
		if (this.firstRender) this.out.write(cursor.hide);
		else this.out.write(clear(this.outputText, this.out.columns));
		super.render();

		let outputText = [
			"\n",
			this.label,
			" ",
			this.msg,
			this.done
				? ""
				: this.hint
				? (this.out.columns < 80 ? "\n" + " ".repeat(8) : "") +
				  color.dim(` (${this.hint})`)
				: "",
			"\n",
		];

		const prefix = " ".repeat(strip(this.label).length);

		if (this.done) {
			outputText.push(
				`${prefix} `,
				color.dim(`${this.choices[this.cursor]?.label}`)
			);
		} else {
			outputText.push(
				this.choices
					.map((choice, i) =>
						i === this.cursor
							? `${prefix} ${color.green(
									useAscii() ? ">" : "●"
							  )} ${this.highlight(choice.label)} ${
									choice.hint ? color.dim(choice.hint) : ""
							  }`
							: color.dim(
									`${prefix} ${useAscii() ? "—" : "○"} ${choice.label} `
							  )
					)
					.join("\n")
			);
		}
		this.outputText = outputText.join("");

		this.out.write(erase.line + cursor.to(0) + this.outputText);
	}
}

interface MultiSelectPromptOptions<
	Choices extends Readonly<Readonly<SelectChoice>[]>
> extends PromptOptions {
	hint?: string;
	message: string;
	label: string;
	initial?: Choices[number]["value"];
	validate?: (v: any) => boolean;
	error?: string;
	choices: Choices;
}

class MultiSelectPrompt<
	Choices extends Readonly<Readonly<SelectChoice>[]>
> extends Prompt {
	choices: Readonly<Array<Choices[number] & { selected: boolean }>>;
	label: string;
	msg: string;
	hint?: string;
	value: Array<Choices[number]["value"]>;
	initialValue: Choices[number]["value"];
	done: boolean | undefined;
	cursor: number;
	name = "MultiSelectPrompt" as const;

	// set by render which is called in constructor
	outputText!: string;

	constructor(opts: MultiSelectPromptOptions<Choices>) {
		if (
			!opts.choices ||
			!Array.isArray(opts.choices) ||
			opts.choices.length < 1
		) {
			throw new Error("MultiSelectPrompt must contain choices");
		}
		super(opts);
		this.label = opts.label;
		this.msg = opts.message;
		this.hint = opts.hint;
		this.value = [];
		this.choices =
			opts.choices.map((choice) => ({ ...choice, selected: false })) || [];
		this.initialValue = opts.initial || this.choices[0].value;
		this.cursor = this.choices.findIndex((c) => c.value === this.initialValue);
		this.render();
	}

	get type() {
		return "multiselect" as const;
	}

	exit() {
		this.abort();
	}

	abort() {
		this.done = this.aborted = true;
		this.cursor = this.choices.findIndex((c) => c.value === this.initialValue);
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	submit() {
		return this.toggle();
	}

	finish() {
		// eslint-disable-next-line no-self-assign
		this.value = this.value;
		this.done = true;
		this.aborted = false;
		this.fire();
		this.render();
		this.out.write("\n");
		this.close();
	}

	moveCursor(n: number) {
		this.cursor = n;
		this.fire();
	}

	toggle() {
		let choice = this.choices[this.cursor];
		if (!choice) return;
		choice.selected = !choice.selected;
		this.render();
	}

	_(c: string, key: ActionKey) {
		if (c === " ") {
			return this.toggle();
		}
		if (c.toLowerCase() === "c") {
			return this.finish();
		}
		return;
	}

	reset() {
		this.moveCursor(0);
		this.fire();
		this.render();
	}

	first() {
		this.moveCursor(0);
		this.render();
	}

	last() {
		this.moveCursor(this.choices.length - 1);
		this.render();
	}

	up() {
		if (this.cursor === 0) {
			this.moveCursor(this.choices.length - 1);
		} else {
			this.moveCursor(this.cursor - 1);
		}
		this.render();
	}

	down() {
		if (this.cursor === this.choices.length - 1) {
			this.moveCursor(0);
		} else {
			this.moveCursor(this.cursor + 1);
		}
		this.render();
	}

	render() {
		if (this.closed) return;
		if (this.firstRender) {
			this.out.write(cursor.hide);
		} else {
			this.out.write(clear(this.outputText, this.out.columns));
		}
		super.render();

		let outputText = ["\n", this.label, " ", this.msg, "\n"];

		let prefix = " ".repeat(strip(this.label).length);

		if (this.done) {
			outputText.push(
				this.choices
					.map((choice) =>
						choice.selected ? `${prefix} ${color.dim(`${choice.label}`)}\n` : ""
					)
					.join("")
					.trimEnd()
			);
		} else {
			outputText.push(
				this.choices
					.map((choice, i) =>
						i === this.cursor
							? `${prefix.slice(0, -2)}${color.cyanBright("▶")}  ${
									choice.selected ? color.green("■") : color.whiteBright("□")
							  } ${color.underline(choice.label)} ${
									choice.hint ? color.dim(choice.hint) : ""
							  }`
							: color[choice.selected ? "reset" : "dim"](
									`${prefix} ${choice.selected ? color.green("■") : "□"} ${
										choice.label
									} `
							  )
					)
					.join("\n")
			);
			outputText.push(
				`\n\n${prefix} Press ${color.inverse(" C ")} to continue`
			);
		}
		this.outputText = outputText.join("");
		this.out.write(erase.line + cursor.to(0) + this.outputText);
	}
}

export {
	prompt,
	Prompt,
	TextPrompt,
	ConfirmPrompt,
	SelectPrompt,
	MultiSelectPrompt,
};

export type {
	PromptOptions,
	TextPromptOptions,
	ConfirmPromptOptions,
	SelectPromptOptions,
	MultiSelectPromptOptions,
};

function lines(msg: string, perLine: number) {
	let lines = String(strip(msg) || "").split(/\r?\n/);
	if (!perLine) return lines.length;
	return lines
		.map((l) => Math.ceil(l.length / perLine))
		.reduce((a, b) => a + b);
}

function clear(prompt: string, perLine: number) {
	if (!perLine) return erase.line + cursor.to(0);
	let rows = 0;
	const lines = prompt.split(/\r?\n/);
	for (let line of lines) {
		rows += 1 + Math.floor(Math.max(strip(line).length - 1, 0) / perLine);
	}

	return erase.lines(rows);
}

function action(key: ActionKey, isSelect: boolean) {
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

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I
) => void
	? I
	: never;

interface BasePromptType {
	name: string;
}

interface TextPromptType extends BasePromptType {
	type: "text";
}

interface ConfirmPromptType extends BasePromptType {
	type: "confirm";
}

interface SelectPromptType<
	Choices extends Readonly<Readonly<SelectChoiceType>[]>
> extends BasePromptType {
	type: "select";
	choices: Choices;
}

interface MultiSelectPromptType<
	Choices extends Readonly<Readonly<SelectChoiceType>[]>
> extends BasePromptType {
	type: "multiselect";
	choices: Choices;
}

interface SelectChoiceType {
	value: unknown;
	label: string;
	hint?: string;
}

type PromptType<
	Choices extends Readonly<SelectChoiceType[]> = Readonly<SelectChoiceType[]>
> =
	| TextPromptType
	| ConfirmPromptType
	| SelectPromptType<Choices>
	| MultiSelectPromptType<Choices>;

type PromptChoices<T extends PromptType<any>> = T extends SelectPromptType<
	infer Choices
>
	? Choices
	: T extends MultiSelectPromptType<infer Choices>
	? Choices
	: never;

type Answer<
	T extends PromptType<any>,
	Choices extends Readonly<SelectChoiceType[]> = PromptChoices<T>
> = T extends TextPromptType
	? string
	: T extends ConfirmPromptType
	? boolean
	: T extends SelectPromptType<Choices>
	? Choices[number]["value"]
	: T extends MultiSelectPromptType<Choices>
	? (Choices[number]["value"] | undefined)[]
	: never;

type Answers<
	T extends Readonly<PromptType<any>> | Readonly<PromptType<any>[]>
> = T extends Readonly<PromptType<any>>
	? Partial<{ [key in T["name"]]: Answer<T> }>
	: T extends Readonly<PromptType<any>[]>
	? UnionToIntersection<Answers<T[number]>>
	: never;

interface PromptTypeOptions<
	T extends PromptType<any>,
	Choices extends Readonly<SelectChoiceType[]> = PromptChoices<T>
> {
	onSubmit?(
		question: T | Readonly<T>,
		answer: Answer<T, Choices>,
		answers: Answers<T>
	): any;
	onCancel?(question: T | Readonly<T>, answers: Answers<T>): any;
	stdin?: NodeJS.ReadStream;
	stdout?: NodeJS.WriteStream;
}
