import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Why: `npx --package` installs the tarball and its native DuckDB binding first, which takes well over 30 s on a cold Windows runner.
const TIMEOUT_MS = 180_000;
const STDERR_SHOWN_CHARS = 500;
const IS_WINDOWS = process.platform === "win32";
const FIRST_USER_ARG = 2;
const DEFAULT_COMMAND = ["node", "dist/main.js"];
const SIGTERM = "SIGTERM";
const EXPECTED_EVENT = "environment_valid";
const MAX_SHOWN_CHARS = 80;
const PROTOCOL_VERSION = "2025-11-25";
const SERVER_NAME = "better-investment-analysis-mcp";
const EXPECTED_TOOLS = ["get_overview", "get_guide", "query_sql"];
const EXPECTED_INSTRUCTIONS_TEXT = "This server only reads.";
const INITIALIZE_ID = 1;
const TOOLS_LIST_ID = 2;
const HTTP_PORT = "3100";
const HTTP_SMOKE_TOKEN = "smoke-http-token-12345678";
const HTTP_UNAUTHORIZED = 401;
const HEALTH_POLL_MS = 500;
const DOCKER_HEALTH_WAIT_MS = 60_000;
const DOCKER_HEALTH_POLL_MS = 500;
const FLAG_STDIO_ONLY = "--stdio-only";
const FLAG_HTTP_ONLY = "--http-only";
const FLAGS = [FLAG_STDIO_ONLY, FLAG_HTTP_ONLY];

// Why: the smoke talks the real protocol: initialize, then tools/list, then closes stdin so the server exits on its own.
const MCP_REQUESTS = [
  { jsonrpc: "2.0", id: INITIALIZE_ID, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "smoke", version: "0.0.0" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: TOOLS_LIST_ID, method: "tools/list" },
];

export const parseCommand = (argv) => {
  const separatorIndex = argv.indexOf("--");
  const beforeSeparator = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const isStdioOnly = beforeSeparator.includes(FLAG_STDIO_ONLY);
  const isHttpOnly = beforeSeparator.includes(FLAG_HTTP_ONLY);
  const command = separatorIndex === -1
    ? argv.filter((token) => !FLAGS.includes(token))
    : argv.slice(separatorIndex + 1);
  return { command: command.length === 0 ? DEFAULT_COMMAND : command, isStdioOnly, isHttpOnly };
};

const truncateLine = (line) => line.slice(0, MAX_SHOWN_CHARS);

const parseLines = (text, problems, describeProblem) => {
  return text.split("\n").filter((line) => line.trim() !== "").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      const shownLine = truncateLine(line);
      problems.push(describeProblem(shownLine));
      return [];
    }
  });
};

const findResult = (messages, id) => messages.find((message) => message.id === id)?.result;

export const checkRun = ({ code, stdout, stderr }) => {
  const problems = [];
  if (code !== 0) {
    problems.push(`the program exited with code ${code}, expected 0`);
  }
  // Why: stdout belongs to the MCP protocol, so every line on it must be a protocol message.
  const messages = parseLines(stdout, problems, (line) => `stdout carries a line that is not an MCP message: ${line}`);
  const events = parseLines(stderr, problems, (line) => `stderr carries a line that is not a JSON log line: ${line}`);
  if (!events.some((event) => event.event === EXPECTED_EVENT)) {
    problems.push(`stderr has no ${EXPECTED_EVENT} log line`);
  }
  const initializeResult = findResult(messages, INITIALIZE_ID);
  if (initializeResult?.serverInfo?.name !== SERVER_NAME) {
    problems.push(`initialize did not answer with the server name ${SERVER_NAME}`);
  }
  if (typeof initializeResult?.instructions !== "string" || initializeResult.instructions === "") {
    problems.push("initialize did not answer with server instructions");
  }
  const toolNames = findResult(messages, TOOLS_LIST_ID)?.tools?.map((tool) => tool.name);
  if (JSON.stringify(toolNames) !== JSON.stringify(EXPECTED_TOOLS)) {
    problems.push(`tools/list answered ${JSON.stringify(toolNames)}, expected ${JSON.stringify(EXPECTED_TOOLS)}`);
  }
  return problems;
};

export const checkHttpRun = ({ name, instructions, toolNames, unauthorizedStatus }) => {
  // Why: the unauthenticated status proves the token is enforced, not just that the server answers.
  const problems = [];
  if (name !== SERVER_NAME) {
    problems.push(`HTTP serverInfo.name is ${JSON.stringify(name)}, expected ${SERVER_NAME}`);
  }
  if (!String(instructions ?? "").includes(EXPECTED_INSTRUCTIONS_TEXT)) {
    problems.push("HTTP instructions do not say the server only reads");
  }
  if (JSON.stringify(toolNames) !== JSON.stringify(EXPECTED_TOOLS)) {
    problems.push(`HTTP tools/list answered ${JSON.stringify(toolNames)}, expected ${JSON.stringify(EXPECTED_TOOLS)}`);
  }
  if (unauthorizedStatus !== HTTP_UNAUTHORIZED) {
    problems.push(`HTTP /mcp without a token answered ${unauthorizedStatus}, expected ${HTTP_UNAUTHORIZED}`);
  }
  return problems;
};

const stopChildProcessTree = (child) => {
  if (child.pid === undefined) {
    child.kill();
    return;
  }
  if (IS_WINDOWS) {
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
    // Why: on Windows, npx is a .cmd shim, which only a shell can start. The transport is pinned to stdio so a shell setting does not leak in.
    const child = spawn(program, args, {
      stdio: ["pipe", "pipe", "pipe"],
      detached: !IS_WINDOWS,
      shell: IS_WINDOWS,
      env: { ...globalThis.process.env, INVESTMENT_MCP_TRANSPORT: "stdio" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stopChildProcessTree(child);
      // Why: a timeout is reported with what the program wrote, so the cause shows in the log without a rerun.
      reject(new Error(`the program did not exit after ${TIMEOUT_MS} ms; stdout ${stdout.length} characters; stderr: ${stderr.slice(-STDERR_SHOWN_CHARS)}`));
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
    child.stdin.end(MCP_REQUESTS.map((request) => `${JSON.stringify(request)}\n`).join(""));
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

const waitForHttpHealth = async (baseUrl) => {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok && (await response.text()) === "ok") {
        return;
      }
    } catch {
      // Why: the server may not be listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }
  throw new Error(`HTTP health check did not pass at ${baseUrl}/health within ${TIMEOUT_MS} ms`);
};

const waitForDockerHealthy = async (imageRef) => {
  // Why: a container runs its HEALTHCHECK on its own schedule, so the smoke waits for the Docker status instead of only for the port.
  const deadline = Date.now() + DOCKER_HEALTH_WAIT_MS;
  while (Date.now() < deadline) {
    const list = spawnSync("docker", ["ps", "-q", "--filter", `ancestor=${imageRef}`], { encoding: "utf8" });
    const containerId = list.stdout.trim().split("\n").find((line) => line.trim() !== "");
    if (containerId !== undefined) {
      const inspect = spawnSync("docker", ["inspect", "-f", "{{.State.Health.Status}}", containerId], { encoding: "utf8" });
      if (inspect.stdout.trim() === "healthy") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, DOCKER_HEALTH_POLL_MS));
  }
  throw new Error(`Docker HEALTHCHECK did not become healthy for ${imageRef} within ${DOCKER_HEALTH_WAIT_MS} ms`);
};

const readDockerImageRef = (args) => {
  // Why: the image reference is the last argument; `docker run` takes it after its flags.
  return args[args.length - 1];
};

const AFTER_HEALTH_BY_PROGRAM = {
  docker: async (args) => waitForDockerHealthy(readDockerImageRef(args)),
};

const callHttpServer = async (baseUrl, token) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "package-smoke-http", version: "0.0.0" });
  await client.connect(transport);
  const name = client.getServerVersion()?.name;
  const instructions = client.getInstructions();
  const toolNames = (await client.listTools()).tools.map((tool) => tool.name);
  await client.close();
  const unauthorized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify(MCP_REQUESTS[0]),
  });
  return { name, instructions, toolNames, unauthorizedStatus: unauthorized.status };
};

export const runHttpSmoke = async (command) => {
  const [program, ...args] = command;
  const token = globalThis.process.env.INVESTMENT_MCP_HTTP_TOKEN ?? HTTP_SMOKE_TOKEN;
  const child = spawn(program, args, {
    env: {
      ...globalThis.process.env,
      INVESTMENT_MCP_TRANSPORT: "http",
      INVESTMENT_MCP_HTTP_HOST: "127.0.0.1",
      INVESTMENT_MCP_HTTP_PORT: HTTP_PORT,
      INVESTMENT_MCP_HTTP_TOKEN: token,
    },
    stdio: ["ignore", "inherit", "inherit"],
    detached: !IS_WINDOWS,
    shell: IS_WINDOWS,
  });
  child.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
  });
  const baseUrl = `http://127.0.0.1:${HTTP_PORT}`;
  try {
    await waitForHttpHealth(baseUrl);
    const afterHealth = Object.hasOwn(AFTER_HEALTH_BY_PROGRAM, program) ? AFTER_HEALTH_BY_PROGRAM[program] : undefined;
    if (afterHealth !== undefined) {
      await afterHealth(args);
    }
    const observed = await callHttpServer(baseUrl, token);
    const problems = checkHttpRun(observed);
    if (problems.length > 0) {
      process.stderr.write(`${problems.join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`smoke http ok: ${command.join(" ")}\n`);
    return 0;
  } finally {
    stopChildProcessTree(child);
  }
};

const runAllSmoke = async ({ command, isStdioOnly, isHttpOnly }) => {
  if (isHttpOnly) {
    return runHttpSmoke(command);
  }
  const stdioCode = await runSmoke(command);
  if (stdioCode !== 0 || isStdioOnly) {
    return stdioCode;
  }
  return runHttpSmoke(command);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parsed = parseCommand(process.argv.slice(FIRST_USER_ARG));
  const exitCode = await runAllSmoke(parsed);
  process.exit(exitCode);
}
