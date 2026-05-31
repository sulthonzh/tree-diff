#!/usr/bin/env node
import { scanTree, diffTrees, formatResult } from "./index.js";
import { resolve } from "path";
function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
                args[key] = argv[++i];
            }
            else {
                args[key] = true;
            }
        }
        else if (!args._dir1) {
            args._dir1 = arg;
        }
        else if (!args._dir2) {
            args._dir2 = arg;
        }
    }
    return args;
}
async function main() {
    const args = parseArgs(process.argv);
    const dir1 = args._dir1 ? resolve(args._dir1) : null;
    const dir2 = args._dir2 ? resolve(args._dir2) : null;
    if (!dir1 || !dir2) {
        console.error("Usage: tree-diff <dir1> <dir2> [--format text|json|markdown] [--ignore node_modules,.git] [--show-unchanged] [--no-hash] [--max-depth N] [--no-color]");
        process.exit(1);
    }
    const format = args.format || "text";
    const showUnchanged = args["show-unchanged"] === true;
    const noHash = args["no-hash"] === true;
    const noColor = args["no-color"] === true;
    const maxDepth = args["max-depth"] ? parseInt(args["max-depth"], 10) : undefined;
    const ignore = args.ignore
        ? args.ignore.split(",").map((s) => s.trim())
        : ["node_modules", ".git", ".DS_Store"];
    const scanOpts = {
        ignore,
        hashFiles: !noHash,
        maxDepth,
    };
    const [left, right] = await Promise.all([
        scanTree(dir1, scanOpts),
        scanTree(dir2, scanOpts),
    ]);
    const result = diffTrees(left, right);
    const output = formatResult(result, { format: format, showUnchanged, color: !noColor });
    console.log(output);
    if (result.summary.added + result.summary.removed + result.summary.modified + result.summary.typeChanged > 0) {
        process.exit(1);
    }
}
main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(2);
});
