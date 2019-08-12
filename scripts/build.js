"use strict";

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "production";
process.env.NODE_ENV = "production";

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on("unhandledRejection", err => {
	throw err;
});

const path = require("path");
const fs = require("fs-extra");
const webpack = require("webpack");
const config = require("../config/webpack.config.js");
const paths = require("../config/paths");
const chalk = require("chalk");
const tscompile = require("./compiler/tscompile");
const tsconfig = require("../tsconfig.json");

const useYarn = fs.existsSync(paths.yarnLockFile);

const isInteractive = process.stdout.isTTY;

// Process CLI arguments
const argv = process.argv.slice(2);

fs.emptyDirSync(paths.appBuildDist);
fs.emptyDirSync(paths.appBuildLib);

// Start the webpack build
build()
	.then(
		({ stats, warnings }) => {
			if (warnings.length) {
				console.log(chalk.yellow("Compiled with warnings.\n"));
				console.log(warnings.join("\n\n"));
				console.log("\nSearch for the " + chalk.underline(chalk.yellow("keywords")) + " to learn more about each warning.");
				console.log("To ignore, add " + chalk.cyan("// eslint-disable-next-line") + " to the line before.\n");
			} else {
				console.log(chalk.green("Compiled successfully.\n"));
			}
		},
		err => {
			console.log(chalk.red("Failed to compile.\n"));
			console.error(err);
			process.exit(1);
		}
	)
	.catch(err => {
		if (err && err.message) {
			console.log(err.message);
		}
		process.exit(1);
	});

// Create the production build and print the deployment instructions.
function build() {
	console.log("Building...");

	let compiler = webpack(config);
	return new Promise((resolve, reject) => {
		compiler.run((err, stats) => {
			let messages;
			if (err) {
				if (!err.message) {
					return reject(err);
				}
				messages = formatWebpackMessages({
					errors: [err.message],
					warnings: []
				});
			} else {
				messages = formatWebpackMessages(stats.toJson({ all: false, warnings: true, errors: true }));
			}
			if (messages.errors.length) {
				// Only keep the first error. Others are often indicative
				// of the same problem, but confuse the reader with noise.
				if (messages.errors.length > 1) {
					messages.errors.length = 1;
				}
				return reject(new Error(messages.errors.join("\n\n")));
			}

			const resolveArgs = {
				stats,
				warnings: messages.warnings
			};

			resolve(resolveArgs);
		});
	});
}

function copyPublicFolder() {
	fs.copySync(paths.appPublic, paths.appBuildDist, {
		dereference: true,
		filter: file => file !== paths.appHtml
	});
}

const friendlySyntaxErrorLabel = "Syntax error:";

function isLikelyASyntaxError(message) {
	return message.indexOf(friendlySyntaxErrorLabel) !== -1;
}

// Cleans up webpack error messages.
function formatMessage(message) {
	let lines = message.split("\n");

	// Strip Webpack-added headers off errors/warnings
	// https://github.com/webpack/webpack/blob/master/lib/ModuleError.js
	lines = lines.filter(line => !/Module [A-z ]+\(from/.test(line));

	// Transform parsing error into syntax error
	// TODO: move this to our ESLint formatter?
	lines = lines.map(line => {
		const parsingError = /Line (\d+):(?:(\d+):)?\s*Parsing error: (.+)$/.exec(line);
		if (!parsingError) {
			return line;
		}
		const [, errorLine, errorColumn, errorMessage] = parsingError;
		return `${friendlySyntaxErrorLabel} ${errorMessage} (${errorLine}:${errorColumn})`;
	});

	message = lines.join("\n");
	// Smoosh syntax errors (commonly found in CSS)
	message = message.replace(/SyntaxError\s+\((\d+):(\d+)\)\s*(.+?)\n/g, `${friendlySyntaxErrorLabel} $3 ($1:$2)\n`);
	// Remove columns from ESLint formatter output (we added these for more
	// accurate syntax errors)
	message = message.replace(/Line (\d+):\d+:/g, "Line $1:");
	// Clean up export errors
	message = message.replace(/^.*export '(.+?)' was not found in '(.+?)'.*$/gm, `Attempted import error: '$1' is not exported from '$2'.`);
	message = message.replace(
		/^.*export 'default' \(imported as '(.+?)'\) was not found in '(.+?)'.*$/gm,
		`Attempted import error: '$2' does not contain a default export (imported as '$1').`
	);
	message = message.replace(
		/^.*export '(.+?)' \(imported as '(.+?)'\) was not found in '(.+?)'.*$/gm,
		`Attempted import error: '$1' is not exported from '$3' (imported as '$2').`
	);
	lines = message.split("\n");

	// Remove leading newline
	if (lines.length > 2 && lines[1].trim() === "") {
		lines.splice(1, 1);
	}
	// Clean up file name
	lines[0] = lines[0].replace(/^(.*) \d+:\d+-\d+$/, "$1");

	// Cleans up verbose "module not found" messages for files and packages.
	if (lines[1] && lines[1].indexOf("Module not found: ") === 0) {
		lines = [lines[0], lines[1].replace("Error: ", "").replace("Module not found: Cannot find file:", "Cannot find file:")];
	}

	// Add helpful message for users trying to use Sass for the first time
	if (lines[1] && lines[1].match(/Cannot find module.+node-sass/)) {
		lines[1] = "To import Sass files, you first need to install node-sass.\n";
		lines[1] += "Run `npm install node-sass` or `yarn add node-sass` inside your workspace.";
	}

	lines[0] = chalk.inverse(lines[0]);

	message = lines.join("\n");
	// Internal stacks are generally useless so we strip them... with the
	// exception of stacks containing `webpack:` because they're normally
	// from user code generated by Webpack. For more information see
	// https://github.com/facebook/create-react-app/pull/1050
	message = message.replace(/^\s*at\s((?!webpack:).)*:\d+:\d+[\s)]*(\n|$)/gm, ""); // at ... ...:x:y
	message = message.replace(/^\s*at\s<anonymous>(\n|$)/gm, ""); // at <anonymous>
	lines = message.split("\n");

	// Remove duplicated newlines
	lines = lines.filter((line, index, arr) => index === 0 || line.trim() !== "" || line.trim() !== arr[index - 1].trim());

	// Reassemble the message
	message = lines.join("\n");
	return message.trim();
}

function formatWebpackMessages(json) {
	const formattedErrors = json.errors.map(function(message) {
		return formatMessage(message, true);
	});
	const formattedWarnings = json.warnings.map(function(message) {
		return formatMessage(message, false);
	});
	const result = { errors: formattedErrors, warnings: formattedWarnings };
	if (result.errors.some(isLikelyASyntaxError)) {
		// If there are any syntax errors, show just them.
		result.errors = result.errors.filter(isLikelyASyntaxError);
	}
	return result;
}
