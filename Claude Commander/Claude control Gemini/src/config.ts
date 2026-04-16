import { readFile } from "node:fs/promises";
import path from "node:path";
import { BridgeConfig, PromptMode } from "./types.js";

interface ConfigFileShape {
  executable?: string;
  args?: string[];
  cwd?: string;
  sessionDirectory?: string;
  promptMode?: PromptMode;
  promptFlag?: string;
  recentMessageLimit?: number;
  summaryMaxCharacters?: number;
  systemPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = [
  "You are Gemini CLI acting as a delegated execution agent inside a local bridge.",
  "Treat the session summary as authoritative context.",
  "Keep the reply concise, structured, and directly useful.",
].join(" ");

const DEFAULT_RECENT_MESSAGE_LIMIT = 8;
const DEFAULT_SUMMARY_MAX_CHARACTERS = 4000;

function readJsonArrayFromEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        return parsed;
      }
    } catch {
      // Fall through to whitespace splitting.
    }
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePromptMode(value: string | undefined, promptFlag: string | undefined): PromptMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "stdin" || normalized === "flag" || normalized === "arg") {
    return normalized;
  }

  if (promptFlag && promptFlag.trim()) {
    return "flag";
  }

  return "stdin";
}

function resolveMaybeRelative(value: string, baseDir: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

async function readConfigFile(filePath: string): Promise<ConfigFileShape | null> {
  try {
    const contents = await readFile(filePath, "utf8");
    const parsed = JSON.parse(contents) as ConfigFileShape;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read config file ${filePath}: ${(error as Error).message}`);
  }
}

export async function loadConfig(options: { baseDir?: string; configPath?: string } = {}): Promise<BridgeConfig> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  const candidatePaths = options.configPath
    ? [path.resolve(baseDir, options.configPath)]
    : [
        path.join(baseDir, "claude-gemini.config.json"),
        path.join(baseDir, ".claude-gemini", "config.json"),
      ];

  let resolvedConfigPath: string | null = null;
  let fileConfig: ConfigFileShape = {};

  for (const candidatePath of candidatePaths) {
    const loaded = await readConfigFile(candidatePath);
    if (loaded) {
      resolvedConfigPath = candidatePath;
      fileConfig = loaded;
      break;
    }
  }

  const envArgsJson = process.env.GEMINI_CLI_ARGS_JSON;
  const envArgs = envArgsJson ? readJsonArrayFromEnv(envArgsJson) : readJsonArrayFromEnv(process.env.GEMINI_CLI_ARGS);
  const promptFlag = process.env.GEMINI_CLI_PROMPT_FLAG?.trim() || fileConfig.promptFlag;

  const configBaseDir = resolvedConfigPath ? path.dirname(resolvedConfigPath) : baseDir;
  const cwdValue = process.env.GEMINI_CLI_CWD?.trim() || fileConfig.cwd || ".";
  const sessionDirectoryValue = process.env.GEMINI_SESSION_DIR?.trim() || fileConfig.sessionDirectory || path.join(".claude-gemini", "sessions");
  const executable = process.env.GEMINI_CLI_COMMAND?.trim() || fileConfig.executable || "gemini";
  const args = envArgs.length > 0 ? envArgs : fileConfig.args ?? [];
  const promptMode = normalizePromptMode(process.env.GEMINI_CLI_PROMPT_MODE ?? fileConfig.promptMode, promptFlag);
  const recentMessageLimit = parsePositiveInteger(process.env.GEMINI_RECENT_MESSAGE_LIMIT, fileConfig.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT);
  const summaryMaxCharacters = parsePositiveInteger(process.env.GEMINI_SUMMARY_MAX_CHARACTERS, fileConfig.summaryMaxCharacters ?? DEFAULT_SUMMARY_MAX_CHARACTERS);
  const systemPrompt = process.env.GEMINI_SYSTEM_PROMPT?.trim() || fileConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const cwd = resolveMaybeRelative(cwdValue, configBaseDir);
  const sessionDirectory = resolveMaybeRelative(sessionDirectoryValue, cwd);

  return {
    executable,
    args,
    cwd,
    sessionDirectory,
    promptMode,
    promptFlag: promptFlag || undefined,
    recentMessageLimit,
    summaryMaxCharacters,
    systemPrompt,
    sourcePath: resolvedConfigPath,
  };
}
