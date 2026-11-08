import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 30_000;
const FIRST_USER_ARG = 2;
const DEFAULT_COMMAND = ["node", "dist/main.js"];
const SIGTERM = "SIGTERM";
const EXPECTED_EVENT = "environment_valid";
const MAX_SHOWN_CHARS = 80;

export const parseCommand = (argv) => {
  const separatorIndex = argv.indexOf("--");
  const command = separatorIndex === -1 ? argv : argv.slice(separatorIndex + 1);
  return { command: command.length === 0 ? DEFAULT_COMMAND : command };
};

export const checkRun = ({ code, stdout, stderr }) => {
  // Why: until the server skeleton issue, the program only validates its environment and exits, so the smoke checks that start-up and nothing else; that issue adds the MCP initialize exchange.
  const problems = [];
  if (code !== 0) {
    problems.push(`the program exited with code ${code}, expected 0`);
  }
  // Why: stdout belongs to the MCP protocol, so anything on it before the server speaks is a bug.
  if (stdout.trim() !== "") {
    problems.push("the program wrote to stdout, which is reserved for the MCP protocol");
  }
  const events = stderr.split("\n").filter((line) => line.trim() !== "").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      problems.push(`stderr carries a line that is not a JSON log line: ${line.slice(0, MAX_SHOWN_CHARS)}`);
      return [];
    }
  });
  if (!events.some((event) => event.event === EXPECTED_EVENT)) {
    problems.push(`stderr has no ${EXPECTED_EVENT} log line`);
  }
  return problems;
};

const stopChildProcessTree = (child) => {
  if (child.pid === undefined) {
    child.kill();
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    return;
  }
  try {
    process.kill(-child.pid, SIGTERM);
  } catch {
    child.kill(SIGTERM);
  }
};

const runProgram = (command) => {
  return new Promise((resolve, reject) => {
    const [program, ...args] = command;
    const child = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stopChildProcessTree(child);
      reject(new Error(`the program did not exit after ${TIMEOUT_MS} ms`));
    }, TIMEOUT_MS);
    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end();
  });
};

const runSmoke = async (command) => {
  const problems = checkRun(await runProgram(command));
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\n`);
    return 1;
  }
  process.stdout.write(`smoke ok: ${command.join(" ")}\n`);
  return 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await runSmoke(parseCommand(process.argv.slice(FIRST_USER_ARG)).command));
}
