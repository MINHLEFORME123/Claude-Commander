# Claude Gemini Bridge

> A local delegation layer for Claude Code that offloads long-running, token-heavy, or repetitive work to Gemini CLI while keeping context compact and sessions durable.

Claude is best when it stays focused on planning, judgment, and final integration. Gemini is best when it can chew through the heavy lifting. This bridge gives you a clean handoff between the two, so you can keep your active context small without losing the work.

## Why this stands out

- Keeps Claude Code focused on orchestration instead of carrying the entire task history.
- Stores every delegated task in a durable local session file.
- Compacts transcripts into a reusable summary before context gets bloated.
- Supports configurable Gemini CLI commands, prompt modes, and environment variables.
- Ships with Claude Code support out of the box through [CLAUDE.md](CLAUDE.md) and [.claude/skills/gemini-bridge/SKILL.md](.claude/skills/gemini-bridge/SKILL.md).

## Claude Code Support

- Root instructions live in [CLAUDE.md](CLAUDE.md).
- The Claude Code skill lives at [.claude/skills/gemini-bridge/SKILL.md](.claude/skills/gemini-bridge/SKILL.md).
- Use the skill when you want Claude to offload token-heavy or multi-step work to Gemini CLI.

## Core Capabilities

- Stores session transcripts on disk.
- Rebuilds prompts from a compact summary plus recent turns.
- Runs the installed Gemini CLI binary through a configurable wrapper.
- Supports compaction so old context can be summarized and removed from the active prompt.

## Requirements

- Node.js 20 or newer
- An installed Gemini CLI binary

## Quick Start

```bash
npm install
npm run build
```

## Usage

```bash
claude-gemini session start --name research
claude-gemini session send <sessionId> "Investigate the failing build"
claude-gemini session compact <sessionId>
claude-gemini session list
```

## Configuration

The bridge looks for `claude-gemini.config.json` or `.claude-gemini/config.json` in the workspace root.
You can also override settings with environment variables.

Example config:

```json
{
  "executable": "gemini",
  "args": [],
  "cwd": ".",
  "sessionDirectory": ".claude-gemini/sessions",
  "promptMode": "stdin",
  "recentMessageLimit": 8,
  "summaryMaxCharacters": 4000,
  "systemPrompt": "You are Gemini CLI acting as a delegated execution agent. Use the session summary as the canonical context. Keep the reply concise, structured, and directly useful."
}
```

Supported environment variables:

- `GEMINI_CLI_COMMAND`
- `GEMINI_CLI_ARGS`
- `GEMINI_CLI_ARGS_JSON`
- `GEMINI_CLI_PROMPT_MODE`
- `GEMINI_CLI_PROMPT_FLAG`
- `GEMINI_SESSION_DIR`
- `GEMINI_CLI_CWD`
- `GEMINI_RECENT_MESSAGE_LIMIT`
- `GEMINI_SUMMARY_MAX_CHARACTERS`
- `GEMINI_SYSTEM_PROMPT`

## Notes

This scaffold currently uses logical sessions stored in JSON files and a configurable Gemini CLI invocation strategy.
If your installed Gemini CLI expects a specific prompt flag, set `promptMode` to `flag` and `promptFlag` accordingly.
Claude Code should read [CLAUDE.md](CLAUDE.md) first, then use the Gemini bridge skill for delegated work.
