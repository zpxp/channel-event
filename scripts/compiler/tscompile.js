"use-strict";

const tsconfig = require("../../tsconfig.json");
const tsc = require("typescript");
const fs = require("fs");
const exec = require("child_process").exec;

function compileFile(configFile) {
	return new Promise((resolve, reject) => {
		console.log(`Running: tsc --project ${configFile}`);
		exec(`tsc --project ${configFile}`);
		resolve();
	});
}



module.exports = {  compileFile };
