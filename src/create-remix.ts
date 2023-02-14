import process from "node:process";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import stripAnsi from "strip-ansi";
import rm from "rimraf";
import { execa } from "execa";
import arg from "arg";
import esbuild from "esbuild";
import * as semver from "semver";
import sortPackageJSON from "sort-package-json";
import { prompt } from "./prompt.js";
import { color } from "./color.js";
import {
	ensureDirectory,
	fileExists,
	isValidJsonObject,
	pathContains,
	sleep,
	strip,
} from "./utils.js";
import { renderLoadingIndicator } from "./loading-indicator.js";
import {
	createTemplate,
	CreateTemplateError,
	isRemixStack,
	isRemixTemplate,
} from "./create-template.js";
import {
	detectPackageManager,
	type PackageManager,
} from "./detect-package-manager.js";
import { getLatestRemixVersion } from "./remix-version.js";
import { error as logError, info, log, stdout } from "./print.js";
import { generateProjectName, toValidProjectName } from "./project-name.js";

// Please also update the installation instructions in the docs at if you make
// any changes to the flow or wording here.
// TODO: Link to `create-remix` docs
async function main() {
	process.on("SIGINT", exit);
	process.on("SIGTERM", exit);

	let argv = process.argv.slice(2).filter((arg) => arg !== "--");
	let ctx = await getContext(argv);
	if (ctx.help) {
		printHelp();
		return;
	}

	let steps = [
		intro,
		projectName,
		template,
		dependencies,
		git,
		typescript,
		next,
	];

	for (let step of steps) {
		await step(ctx);
	}
	exit();
}

async function getContext(argv: string[]): Promise<Context> {
	let flags = arg(
		{
			"--debug": Boolean,
			"--remix-version": String,
			"--r": "--remix-version",
			"--template": String,
			"--token": String,
			"--yes": Boolean,
			"-y": "--yes",
			"--no": Boolean,
			"-n": "--no",
			"--install": Boolean,
			"--no-install": Boolean,
			"--git": Boolean,
			"--no-git": Boolean,
			"--typescript": Boolean,
			"--no-typescript": Boolean,
			"--dry": Boolean,
			"--help": Boolean,
			"-h": "--help",
			"--version": String,
			"--v": "--version",
			"--no-color": Boolean,
			"--no-motion": Boolean,
		},
		{ argv, permissive: true }
	);
	let cwd = flags["_"][0] as string;
	let [username, latestRemixVersion] = await Promise.all([
		getGreetingName(),
		getLatestRemixVersion(),
	]);

	let {
		"--debug": debug = false,
		"--help": help = false,
		"--remix-version": selectedRemixVersion,
		"--template": template,
		"--token": token,
		"--install": install,
		"--no-install": noInstall,
		"--git": git,
		"--no-git": noGit,
		"--typescript": typescript,
		"--no-typescript": noTypescript,
		"--no-motion": noMotion,
		"--dry": dryRun,
		"--no": no,
		"--yes": yes,
	} = flags;
	let projectName = cwd;

	if (no) {
		yes = false;
		if (install == undefined) install = false;
		if (git == undefined) git = false;
	}

	if (yes || no) {
		if (typescript == undefined) typescript = true;
	}

	let context: Context = {
		cwd,
		debug,
		dryRun,
		exit(code) {
			return exit(code);
		},
		git: git ?? (noGit ? false : undefined),
		initScriptPath: null,
		help,
		install: install ?? (noInstall ? false : undefined),
		noMotion,
		pkgManager: "npm",
		projectName,
		prompt,
		remixVersion: selectedRemixVersion || latestRemixVersion,
		template,
		token,
		typescript: typescript ?? (noTypescript ? false : undefined),
		username,
		yes,
	};
	return context;
}

interface Context {
	cwd: string;
	debug: boolean;
	dryRun?: boolean;
	exit(code: number): never;
	git?: boolean;
	initScriptPath: null | string;
	help: boolean;
	how?: string;
	install?: boolean;
	noMotion?: boolean;
	pkgManager: PackageManager;
	projectName?: string;
	prompt: typeof prompt;
	remixVersion: string;
	stdin?: typeof process.stdin;
	stdout?: typeof process.stdout;
	template?: string;
	token?: string;
	typescript?: boolean;
	username: string;
	yes?: boolean;
}

export async function intro(ctx: Context) {
	log(
		`\n${color.bgBlueBright(` ${color.whiteBright("remix")} `)}  ${color.green(
			color.bold(`v${ctx.remixVersion}`)
		)} ${color.bold("💿 Let's build a better website...")}`
	);
	warnIfTypeScriptOptOutIsNotSupported(ctx);
}

export async function projectName(ctx: Context) {
	await checkCwd(ctx.cwd);

	if (!ctx.cwd || !isEmpty(ctx.cwd)) {
		if (!isEmpty(ctx.cwd)) {
			await sleep(100);
			info(
				"Hmm...",
				`${color.reset(`"${ctx.cwd}"`)}${color.dim(` is not empty!`)}`
			);
		}

		let { name } = await ctx.prompt({
			name: "name",
			type: "text",
			label: title("dir"),
			message: "Where should we create your new project?",
			initial: `./${generateProjectName()}`,
			validate(value: string) {
				if (!isEmpty(value)) {
					return `Directory is not empty!`;
				}
				return true;
			},
		});
		ctx.cwd = name!;
		ctx.projectName = toValidProjectName(name!);
	} else {
		let name = ctx.cwd;
		if (name === "." || name === "./") {
			let parts = process.cwd().split(path.sep);
			name = parts[parts.length - 1];
		} else if (name.startsWith("./") || name.startsWith("../")) {
			let parts = name.split("/");
			name = parts[parts.length - 1];
		}
		ctx.projectName = toValidProjectName(name);
	}

	if (!ctx.cwd) {
		ctx.exit(1);
	}
}

export async function template(ctx: Context) {
	if (!ctx.template) {
		let { how } = await ctx.prompt({
			name: "how",
			type: "select",
			label: title("how"),
			message: "How would you like to start your new project?",
			initial: "quick",
			choices: [
				{ value: "quick", label: "Quick start" },
				{ value: "other", label: "Use a template" },
			],
		});
		ctx.how = how;
		let temp: string | undefined;
		if (how !== "quick") {
			({ temp } = await ctx.prompt({
				name: "temp",
				type: "text",
				label: title("temp"),
				message: "Enter the template you'd like to use",
			}));
		}
		ctx.template = temp ?? "remix";
	} else {
		info(
			"temp",
			`Using ${color.reset(ctx.template)}${color.dim(" as project template")}`
		);
	}

	warnIfTypeScriptOptOutIsNotSupported(ctx);

	if (ctx.dryRun) {
		info("--dry", `Skipping template copying`);
	} else if (ctx.template) {
		let template = ctx.template;
		await loadingIndicator({
			start: "Template copying...",
			end: "Template copied",
			while: () => copyTemplate(template, ctx),
			ctx,
		});
		ctx.initScriptPath = await getInitScriptPath(ctx.cwd);
	} else {
		ctx.exit(1);
	}
}

export async function dependencies(ctx: Context) {
	let deps = ctx.install ?? ctx.yes;
	let pkgManager = await detectPackageManager({
		cwd: ctx.cwd,
		default: ctx.pkgManager,
	});
	ctx.pkgManager = pkgManager;

	if (deps === undefined) {
		({ deps } = await ctx.prompt({
			name: "deps",
			type: "confirm",
			label: title("deps"),
			message: `Install dependencies?`,
			hint: "recommended",
			initial: true,
		}));
		ctx.install = deps;
	}

	if (ctx.dryRun) {
		await sleep(100);
		info("--dry", `Skipping dependency installation`);
	} else if (deps) {
		await loadingIndicator({
			start: `Dependencies installing with ${ctx.pkgManager}...`,
			end: "Dependencies installed",
			while: () =>
				ctx.initScriptPath
					? runInitScript(ctx)
					: installDependencies(ctx.pkgManager, ctx.cwd),
			ctx,
		});
	} else {
		await sleep(100);
		info(
			ctx.yes === false ? "deps [skip]" : "No problem!",
			"Remember to install dependencies after setup."
		);
	}
}

export async function git(ctx: Context) {
	if (fs.existsSync(path.join(ctx.cwd, ".git"))) {
		info("Nice!", `Git has already been initialized`);
		return;
	}
	let _git = ctx.git ?? ctx.yes;
	if (_git === undefined) {
		({ git: _git } = await ctx.prompt({
			name: "git",
			type: "confirm",
			label: title("git"),
			message: `Initialize a new git repository?`,
			hint: "recommended",
			initial: true,
		}));
	}

	if (ctx.dryRun) {
		await sleep(100);
		info("--dry", `Skipping Git initialization`);
	} else if (_git) {
		await loadingIndicator({
			start: "Git initializing...",
			end: "Git initialized",
			while: () => gitInit({ cwd: ctx.cwd }),
			ctx,
		});
	} else {
		await sleep(100);
		info(
			ctx.yes === false ? "git [skip]" : "Sounds good!",
			`You can always run ${color.reset("git init")}${color.dim(" manually.")}`
		);
	}
}

export async function typescript(ctx: Context) {
	let optOutIsSupported = !!(ctx.template && isRemixTemplate(ctx.template));
	if (!optOutIsSupported) {
		return;
	}

	if (ctx.how === "quick") {
		ctx.typescript = true;
		return;
	}

	let ts =
		ctx.typescript ?? (typeof ctx.yes !== "undefined" ? "strict" : undefined);

	if (ts === undefined) {
		let { useTs } = await ctx.prompt({
			name: "useTs",
			type: "select",
			label: title("ts"),
			initial: true,
			choices: [
				{ value: true, label: "TypeScript", hint: `(recommended)` },
				{ value: false, label: "JavaScript" },
			],
			message: "TypeScript or JavaScript?",
		});
		if (!useTs) {
			// TODO: Change to false when we add JS templates back to repo
			ctx.typescript = true;
			// TODO: Implement when we add JS templates back to repo
			info(`Heads up!`, "TypeScript conversion is not yet supported.");
		} else {
			ctx.typescript = true;
		}
	}
}

export async function next(ctx: Context) {
	let projectDir = path.relative(process.cwd(), ctx.cwd);
	await nextSteps({ projectDir });
	return;
}

async function nextSteps({ projectDir }: { projectDir: string }) {
	let max = stdout.columns;
	let prefix = max < 80 ? " " : " ".repeat(9);
	await sleep(200);

	log(`\n ${color.bgCyan(color.black(" next "))}  That's it!`);
	await sleep(100);
	if (projectDir !== "") {
		let enter = [
			`\n${prefix}Enter your project directory using`,
			color.cyan(`cd ./${projectDir}`, ""),
		];
		let len = enter[0].length + stripAnsi(enter[1]).length;
		log(enter.join(len > max ? "\n" + prefix : " "));
	}
	log(
		`${prefix}Check out ${color.bold(
			"README.md"
		)} for development and deploy instructions.`
	);
	await sleep(100);
	log(
		`\n${prefix}Join the community at ${color.cyan(`https://rmx.as/discord`)}`
	);
	await sleep(200);
}

async function checkCwd(cwd: string | undefined) {
	let empty = cwd && isEmpty(cwd);
	if (empty) {
		await sleep(100);
		info(
			"dir",
			`Using ${color.reset(cwd)}${color.dim(" as project directory")}`
		);
	}
	return empty;
}

function isEmpty(dirPath: string) {
	if (!fs.existsSync(dirPath)) {
		return true;
	}

	// Some existing files and directories can be safely ignored when checking if
	// a directory is a valid project directory.
	// https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/create-react-app/createReactApp.js#L907-L934
	const VALID_PROJECT_DIRECTORY_SAFE_LIST = [
		".DS_Store",
		".git",
		".gitkeep",
		".gitattributes",
		".gitignore",
		".gitlab-ci.yml",
		".hg",
		".hgcheck",
		".hgignore",
		".idea",
		".npmignore",
		".travis.yml",
		".yarn",
		".yarnrc.yml",
		"docs",
		"LICENSE",
		"mkdocs.yml",
		"Thumbs.db",
		/\.iml$/,
		/^npm-debug\.log/,
		/^yarn-debug\.log/,
		/^yarn-error\.log/,
	];

	let conflicts = fs.readdirSync(dirPath).filter((content) => {
		return !VALID_PROJECT_DIRECTORY_SAFE_LIST.some((safeContent) => {
			return typeof safeContent === "string"
				? content === safeContent
				: safeContent.test(content);
		});
	});
	return conflicts.length === 0;
}

async function installDependencies(packageManager: string, cwd: string) {
	let installExec = execa(packageManager, ["install"], { cwd });
	return new Promise<void>((resolve, reject) => {
		installExec.on("error", (error) => reject(error));
		installExec.on("close", () => resolve());
	});
}

async function gitInit({ cwd }: { cwd: string }) {
	try {
		await execa("git", ["init"], { cwd, stdio: "ignore" });
	} catch (e) {}
}

async function copyTemplate(userInput: string, ctx: Context) {
	// Copy
	if (!ctx.dryRun) {
		let destPath = path.resolve(process.cwd(), ctx.cwd);
		await ensureDirectory(destPath);
		await createTemplate(userInput, destPath, {
			debug: ctx.debug,
			token: ctx.token,
			async onError(err) {
				let cwd = process.cwd();
				let removing = (async () => {
					if (cwd !== destPath && !pathContains(cwd, destPath)) {
						try {
							await rm(destPath);
						} catch (_) {
							console.log("failed to remove", destPath);
						}
					}
				})();
				if (ctx.debug) {
					try {
						await removing;
					} catch (_) {}
					throw err;
				}

				await Promise.all([
					error(
						"Oh no!",
						err instanceof CreateTemplateError
							? err.message
							: "Something went wrong. Run `create-remix --debug` to see more info.\n\n" +
									"Open an issue to report the problem at " +
									"https://github.com/remix-run/create-remix/issues/new",
						ctx
					),
					removing,
				]);
				return ctx.exit(1);
			},
			async log(message) {
				if (ctx.debug) {
					log(message);
					await sleep(500);
				}
			},
		});
		log("Template: " + ctx.template);
		await updatePackageJSON(ctx);
	}
}

async function updatePackageJSON(ctx: Context) {
	let packageJSONPath = path.join(ctx.cwd, "package.json");
	if (!fs.existsSync(packageJSONPath)) {
		let relativePath = path.relative(process.cwd(), ctx.cwd);
		error(
			"Oh no!",
			color.error(
				"The provided template must be a Remix project with a `package.json` " +
					`file, but that file does not exist in ${color.bold(relativePath)}.`
			),
			ctx
		);
		ctx.exit(1);
	}

	let contents = await fs.promises.readFile(packageJSONPath, "utf-8");
	let packageJSON: any;
	try {
		packageJSON = JSON.parse(contents);
		if (!isValidJsonObject(packageJSON)) {
			throw Error();
		}
	} catch (err) {
		error(
			"Oh no!",
			color.error(
				"The provided template must be a Remix project with a `package.json` " +
					`file, but that file is invalid.`
			),
			ctx
		);
		ctx.exit(1);
	}

	for (let pkgKey of ["dependencies", "devDependencies"] as const) {
		let dependencies = packageJSON[pkgKey];
		if (!dependencies) continue;
		if (!isValidJsonObject(dependencies)) {
			error(
				"Oh no!",
				color.error(
					"The provided template must be a Remix project with a `package.json` " +
						`file, but its ${pkgKey} value is invalid.`
				),
				ctx
			);
			ctx.exit(1);
		}

		for (let dependency in dependencies) {
			let version = dependencies[dependency];
			if (version === "*") {
				// prettier-ignore
				// @ts-expect-error
				packageJSON[pkgKey][dependency] =
					semver.prerelease(ctx.remixVersion)
					? // Templates created from prereleases should pin to a specific version
					  ctx.remixVersion
					: "^" + ctx.remixVersion;
			}
		}
	}

	if (!ctx.initScriptPath) {
		packageJSON.name = ctx.projectName;
	}

	fs.promises.writeFile(
		packageJSONPath,
		JSON.stringify(sortPackageJSON(packageJSON), null, 2),
		"utf-8"
	);
}

function exit(code = 0) {
	return process.exit(code);
}

async function loadingIndicator(args: {
	start: string;
	end: string;
	while: (...args: any) => Promise<any>;
	ctx: Context;
}) {
	let { ctx, ...rest } = args;
	await renderLoadingIndicator({
		...rest,
		stdout,
		noMotion: args.ctx.noMotion,
	});
}

function title(text: string) {
	return (
		align(color.bgBlueBright(` ${color.whiteBright(text)} `), "end", 7) + " "
	);
}

function getGreetingName() {
	return new Promise<string>((resolve) => {
		exec("git config user.name", { encoding: "utf-8" }, (_1, gitName, _2) => {
			if (gitName.trim()) {
				return resolve(gitName.split(" ")[0].trim());
			}
			exec("whoami", { encoding: "utf-8" }, (_3, whoami, _4) => {
				if (whoami.trim()) {
					return resolve(whoami.split(" ")[0].trim());
				}
				return resolve("remy");
			});
		});
	});
}

function printHelp() {
	// prettier-ignore
	let output = `
${title("create-remix")}

${color.heading("Usage")}:

${color.dim("$")} ${color.greenBright("create-remix")} ${color.arg("<projectDir>")} ${color.arg("<...options>")}

${color.heading("Values")}:

${color.arg("projectDir")}          ${color.dim(`The Remix project directory`)}

${color.heading("Options")}:

${color.arg("--help, -h")}          ${color.dim(`Print this help message and exit`)}
${color.arg("--version, -v")}       ${color.dim(`Print the CLI version and exit`)}
${color.arg("--no-color")}          ${color.dim(`Disable ANSI colors in console output`)}
${color.arg("--no-motion")}         ${color.dim(`Disable animations in console output`)}

${color.arg("--template <name>")}   ${color.dim(`The project template to use`)}
${color.arg("--[no-]install")}      ${color.dim(`Whether or not to install dependencies after creation`)}
${color.arg("--[no-]git")}          ${color.dim(`Whether or not to initialize a Git repository`)}
${color.arg("--[no-]typescript")}   ${color.dim(`Whether or not to use TypeScript. This option only works
		    for official Remix templates.`)}
${color.arg("--yes, -y")}           ${color.dim(`Skip all option prompts and run setup.`)}
${color.arg("--no, -n")}            ${color.dim(`Skip all option prompts and skip setup.`)}
${color.arg("--remix-version")}     ${color.dim(`The version of Remix to use`)}

${color.heading("Creating a new project")}:

Remix projects are created from templates. A template can be:

  - a file path to a directory of files
  - a file path to a tarball
  - the name of a :username/:repo on GitHub
  - the URL of a GitHub repository (or directory within it)
  - the URL of a tarball
${[
	"/path/to/remix-template",
	"/path/to/remix-template.tar.gz",
	"remix-run/grunge-stack",
	":username/:repo",
	"https://github.com/:username/:repo",
	"https://github.com/:username/:repo/tree/:branch",
	"https://github.com/:username/:repo/tree/:branch/:directory",
	"https://github.com/:username/:repo/archive/refs/tags/:tag.tar.gz",
	"https://example.com/remix-template.tar.gz",
].reduce((str, example) => {
	return `${str}\n${color.dim("$")} ${color.greenBright("create-remix")} my-app ${color.arg(`--template ${example}`)}`;
}, "")}

To create a new project from a template in a private GitHub repo,
pass the \`token\` flag with a personal access token with access
to that repo.

${color.heading("Initialize a project")}:

Remix project templates may contain a \`remix.init\` directory
with a script that initializes the project. This script automatically
runs during \`remix create\`, but if you ever need to run it manually
you can run:

${color.dim("$")} ${color.greenBright("remix")} init
`;

	log(output);
}

function align(text: string, dir: "start" | "end" | "center", len: number) {
	let pad = Math.max(len - strip(text).length, 0);
	switch (dir) {
		case "start":
			return text + " ".repeat(pad);
		case "end":
			return " ".repeat(pad) + text;
		case "center":
			return (
				" ".repeat(Math.floor(pad / 2)) + text + " ".repeat(Math.floor(pad / 2))
			);
		default:
			return text;
	}
}

async function getInitScriptPath(cwd: string) {
	let initScriptDir = path.join(cwd, "remix.init");
	let initScriptTs = path.resolve(initScriptDir, "index.ts");
	let initScriptJs = path.resolve(initScriptDir, "index.js");
	return (await fileExists(initScriptTs))
		? initScriptTs
		: (await fileExists(initScriptJs))
		? initScriptJs
		: null;
}

async function runInitScript(
	ctx: Context,
	initFlags?: { deleteScript?: boolean }
) {
	if (!ctx.initScriptPath) return;
	let { initScriptPath } = ctx;
	let { deleteScript = true } = initFlags || {};

	if (initScriptPath.endsWith(".ts")) {
		await esbuild.build({
			entryPoints: [initScriptPath],
			format: "cjs",
			platform: "node",
			outfile: initScriptPath.replace(/\.ts$/, ".js"),
		});
	}

	let initScriptDir = path.dirname(initScriptPath);

	let initPackageJson = path.resolve(initScriptDir, "package.json");
	let isTypeScript = fs.existsSync(path.join(ctx.cwd, "tsconfig.json"));
	let packageManager = ctx.pkgManager;

	if (await fileExists(initPackageJson)) {
		await installDependencies(ctx.pkgManager, initScriptDir);
	}

	let initModule = await import(initScriptPath);
	let initFn: Function;
	if (typeof initModule === "function") {
		initFn = initModule;
	} else if (
		initModule &&
		typeof initModule === "object" &&
		typeof initModule.default === "function"
	) {
		initFn = initModule.default;
	} else {
		error("Oh no!", "remix.init failed", ctx);
		ctx.exit(1);
	}

	try {
		await initFn({ isTypeScript, packageManager, rootDirectory: ctx.cwd });
		if (deleteScript) {
			await rm(initScriptDir);
		}
	} catch (err) {
		error("Oh no!", "remix.init failed", ctx);
		ctx.exit(1);
	}
}

function error(
	message: string,
	details: string,
	{ debug }: { debug?: boolean }
) {
	if (debug) {
		throw new Error(details);
	}
	logError(message, details);
}

function warnIfTypeScriptOptOutIsNotSupported(ctx: Context) {
	if (!ctx.template) return;
	if (ctx.typescript === false) {
		if (isRemixStack(ctx.template)) {
			info(
				`Heads up!`,
				"Opting out of TypeScript not supported for Remix stacks."
			);
		} else if (!isRemixStack(ctx.template)) {
			info(
				`Heads up!`,
				"Opting out of TypeScript is only supported for official Remix templates."
			);
		}
	}
}

export { main };
export type { Context };
