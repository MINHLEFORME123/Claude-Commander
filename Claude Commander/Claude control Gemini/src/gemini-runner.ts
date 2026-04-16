import { spawn } from "node:child_process";
import { BridgeConfig, GeminiRunResult } from "./types.js";

function formatCommandLine(command: string, args: string[]): string {
  return [command, ...args]
    .map((part) => {
      if (/^[a-zA-Z0-9_./:-]+$/.test(part)) {
        return part;
      }
      return `"${part.replace(/"/g, '\\"')}"`;
    })
    .join(" ");
}

export async function runGeminiPrompt(config: BridgeConfig, prompt: string): Promise<GeminiRunResult> {
  const args = [...config.args];
  let promptMode = config.promptMode;

  if (promptMode === "flag") {
    args.push(config.promptFlag ?? "--prompt", prompt);
  } else if (promptMode === "arg") {
    args.push(prompt);
  } else {
    promptMode = "stdin";
  }

  const child = spawn(config.executable, args, {
    cwd: config.cwd,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const completion = new Promise<GeminiRunResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({
        command: config.executable,
        args,
        stdout,
        stderr,
        exitCode: exitCode ?? -1,
      });
    });
  });

  if (promptMode === "stdin") {
    child.stdin.end(`${prompt}\n`);
  } else {
    child.stdin.end();
  }

  const result = await completion;
  if (result.exitCode !== 0) {
    const commandLine = formatCommandLine(config.executable, args);
    const errorText = [
      `Gemini CLI exited with code ${result.exitCode}.`,
      `Command: ${commandLine}`,
      result.stderr.trim() ? `Stderr:\n${result.stderr.trim()}` : "",
      result.stdout.trim() ? `Stdout:\n${result.stdout.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    throw new Error(errorText);
  }

  return result;
}

export function describeCommand(config: BridgeConfig, prompt: string): string {
  const args = [...config.args];
  if (config.promptMode === "flag") {
    args.push(config.promptFlag ?? "--prompt", prompt);
  } else if (config.promptMode === "arg") {
    args.push(prompt);
  }
  return formatCommandLine(config.executable, args);
}
