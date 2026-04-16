#!/usr/bin/env node

import { GeminiBridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import type { SessionOverview, SessionRecord } from "./types.js";

interface GlobalOptions {
  json: boolean;
  configPath?: string;
  cwd?: string;
  help: boolean;
}

let jsonOutput = false;

function printUsage(): void {
  console.log([
    "Usage:",
    "  claude-gemini [--json] [--config <path>] [--cwd <path>] <command>",
    "",
    "Commands:",
    "  config show",
    "  session start [--name <name>] [name...]",
    "  session send <sessionId> <message...>",
    "  session show <sessionId>",
    "  session list",
    "  session compact <sessionId>",
    "  session archive <sessionId>",
    "  session delete <sessionId>",
    "",
    "Examples:",
    "  claude-gemini session start research",
    "  claude-gemini session send 1234abcd 'Inspect the current build errors'",
    "  claude-gemini --json session list",
  ].join("\n"));
}

function parseGlobalOptions(argv: string[]): { options: GlobalOptions; rest: string[] } {
  const options: GlobalOptions = {
    json: false,
    help: false,
  };

  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      index += 1;
      continue;
    }
    if (token === "--config") {
      options.configPath = requireOptionValue(argv, index, "--config");
      index += 2;
      continue;
    }
    if (token === "--cwd") {
      options.cwd = requireOptionValue(argv, index, "--cwd");
      index += 2;
      continue;
    }
    break;
  }

  return {
    options,
    rest: argv.slice(index),
  };
}

function requireOptionValue(argv: string[], index: number, optionName: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function outputJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function renderSessionOverviewList(sessions: SessionOverview[]): string {
  if (sessions.length === 0) {
    return "No sessions found.";
  }

  const lines: string[] = [];
  for (const session of sessions) {
    lines.push(
      `- ${session.id} | ${session.status} | ${session.updatedAt} | ${session.messageCount} messages | ${session.name}`,
    );
    if (session.summaryPreview) {
      lines.push(`  summary: ${session.summaryPreview}`);
    }
    if (session.lastErrorPreview) {
      lines.push(`  last error: ${session.lastErrorPreview}`);
    }
  }
  return lines.join("\n");
}

function renderSessionRecord(session: SessionRecord, recentLimit: number): string {
  const recentMessages = session.messages.slice(-Math.max(recentLimit, 1));
  const lines: string[] = [
    `ID: ${session.id}`,
    `Name: ${session.name}`,
    `Status: ${session.status}`,
    `Created: ${session.createdAt}`,
    `Updated: ${session.updatedAt}`,
    "",
    "Summary:",
    session.summary.trim() || "(empty)",
    "",
    `Recent messages: ${recentMessages.length}`,
  ];

  if (recentMessages.length > 0) {
    for (const message of recentMessages) {
      lines.push(`- ${message.role.toUpperCase()}: ${message.content.trim()}`);
    }
  }

  if (session.lastResponse) {
    lines.push("", "Last response:", session.lastResponse.trim());
  }

  if (session.lastError) {
    lines.push("", "Last error:", session.lastError.trim());
  }

  return lines.join("\n");
}

function parseSessionStartArgs(argv: string[]): { name: string | undefined } {
  const nameParts: string[] = [];
  let explicitName: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--name" || token === "-n") {
      explicitName = requireOptionValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option for session start: ${token}`);
    }
    nameParts.push(token);
  }

  return {
    name: explicitName ?? (nameParts.length > 0 ? nameParts.join(" ") : undefined),
  };
}

function parseSessionIdAndMessage(argv: string[]): { sessionId: string; message: string } {
  const [sessionId, ...messageParts] = argv;
  if (!sessionId) {
    throw new Error("A session id is required.");
  }
  if (messageParts.length === 0) {
    throw new Error("A message is required.");
  }
  return {
    sessionId,
    message: messageParts.join(" ").trim(),
  };
}

function parseSessionId(argv: string[]): string {
  const [sessionId, ...rest] = argv;
  if (!sessionId) {
    throw new Error("A session id is required.");
  }
  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }
  return sessionId;
}

async function handleConfigCommand(config: Awaited<ReturnType<typeof loadConfig>>, argv: string[], options: GlobalOptions): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "show" || rest.length > 0) {
    throw new Error("Unknown config command. Use 'config show'.");
  }

  if (options.json) {
    outputJson(config);
    return;
  }

  console.log(JSON.stringify(config, null, 2));
}

async function handleSessionCommand(bridge: GeminiBridge, recentLimit: number, argv: string[], options: GlobalOptions): Promise<void> {
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case "start": {
      const { name } = parseSessionStartArgs(rest);
      const session = await bridge.createSession(name);
      if (options.json) {
        outputJson(session);
      } else {
        console.log(`Started session ${session.id}${session.name ? ` (${session.name})` : ""}`);
      }
      return;
    }
    case "send": {
      const { sessionId, message } = parseSessionIdAndMessage(rest);
      const result = await bridge.sendToSession(sessionId, message);
      if (options.json) {
        outputJson(result);
      } else {
        console.log(`Session: ${result.session.id}`);
        console.log(`Name: ${result.session.name}`);
        console.log(`Command: ${result.command}`);
        console.log("");
        console.log(result.response.trim() || "(empty response)");
      }
      return;
    }
    case "show": {
      const sessionId = parseSessionId(rest);
      const session = await bridge.getSession(sessionId);
      if (options.json) {
        outputJson(session);
      } else {
        console.log(renderSessionRecord(session, recentLimit));
      }
      return;
    }
    case "list": {
      if (rest.length > 0) {
        throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
      }
      const sessions = await bridge.listSessions();
      if (options.json) {
        outputJson(sessions);
      } else {
        console.log(renderSessionOverviewList(sessions));
      }
      return;
    }
    case "compact": {
      const sessionId = parseSessionId(rest);
      const session = await bridge.compactSession(sessionId);
      if (options.json) {
        outputJson(session);
      } else {
        console.log(`Compacted session ${session.id}. Summary length: ${session.summary.length}`);
      }
      return;
    }
    case "archive": {
      const sessionId = parseSessionId(rest);
      const session = await bridge.archiveSession(sessionId);
      if (options.json) {
        outputJson(session);
      } else {
        console.log(`Archived session ${session.id}.`);
      }
      return;
    }
    case "delete": {
      const sessionId = parseSessionId(rest);
      await bridge.deleteSession(sessionId);
      if (options.json) {
        outputJson({ deleted: true, sessionId });
      } else {
        console.log(`Deleted session ${sessionId}.`);
      }
      return;
    }
    default:
      throw new Error("Unknown session command. Use start, send, show, list, compact, archive, or delete.");
  }
}

async function main(): Promise<void> {
  const { options, rest } = parseGlobalOptions(process.argv.slice(2));
  jsonOutput = options.json;

  if (options.help || rest.length === 0) {
    printUsage();
    return;
  }

  const [command, ...commandArgs] = rest;
  const configLoadOptions: { baseDir?: string; configPath?: string } = { baseDir: options.cwd ?? process.cwd() };
  if (options.configPath) {
    configLoadOptions.configPath = options.configPath;
  }
  const config = await loadConfig(configLoadOptions);

  if (command === "help") {
    printUsage();
    return;
  }

  if (command === "config") {
    await handleConfigCommand(config, commandArgs, options);
    return;
  }

  const bridge = new GeminiBridge(config);
  if (command === "session") {
    await handleSessionCommand(bridge, config.recentMessageLimit, commandArgs, options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonOutput) {
    console.error(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
