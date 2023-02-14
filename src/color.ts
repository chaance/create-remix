import process from "node:process";
import * as Chalk from "chalk";
import { identity } from "./utils";

const chalk = Chalk.default;

// https://no-color.org/
const SUPPORTS_COLOR = Chalk.supportsColor && !process.env.NO_COLOR;

export const color = {
	supportsColor: SUPPORTS_COLOR,
	heading: safe(chalk.bold),
	arg: safe(chalk.yellowBright),
	error: safe(chalk.red),
	warning: safe(chalk.yellow),
	hint: safe(chalk.blue),
	bold: safe(chalk.bold),
	black: safe(chalk.black),
	white: safe(chalk.white),
	blue: safe(chalk.blue),
	cyan: safe(chalk.cyan),
	red: safe(chalk.red),
	yellow: safe(chalk.yellow),
	green: safe(chalk.green),
	blackBright: safe(chalk.blackBright),
	whiteBright: safe(chalk.whiteBright),
	blueBright: safe(chalk.blueBright),
	cyanBright: safe(chalk.cyanBright),
	redBright: safe(chalk.redBright),
	yellowBright: safe(chalk.yellowBright),
	greenBright: safe(chalk.greenBright),
	bgBlack: safe(chalk.bgBlack),
	bgWhite: safe(chalk.bgWhite),
	bgBlue: safe(chalk.bgBlue),
	bgCyan: safe(chalk.bgCyan),
	bgRed: safe(chalk.bgRed),
	bgYellow: safe(chalk.bgYellow),
	bgGreen: safe(chalk.bgGreen),
	bgBlackBright: safe(chalk.bgBlackBright),
	bgWhiteBright: safe(chalk.bgWhiteBright),
	bgBlueBright: safe(chalk.bgBlueBright),
	bgCyanBright: safe(chalk.bgCyanBright),
	bgRedBright: safe(chalk.bgRedBright),
	bgYellowBright: safe(chalk.bgYellowBright),
	bgGreenBright: safe(chalk.bgGreenBright),
	gray: safe(chalk.gray),
	dim: safe(chalk.dim),
	reset: safe(chalk.reset),
	inverse: safe(chalk.inverse),
	hex: (color: string) => safe(chalk.hex(color)),
	underline: chalk.underline,
};

function safe(style: Chalk.ChalkInstance) {
	return SUPPORTS_COLOR ? style : identity;
}
