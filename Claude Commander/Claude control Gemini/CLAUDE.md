# Claude Code Instructions

This repository contains a local bridge that lets Claude Code delegate work to Gemini CLI.

## Primary workflow

- Use the `gemini-bridge` skill in `.claude/skills/gemini-bridge/SKILL.md` when a task is long-running, token-heavy, or benefits from a durable session.
- Prefer the `claude-gemini` CLI after build, or `node .\dist\cli.js` in source mode.
- Keep the active Claude context small by delegating repeated inspection, mechanical edits, and multi-turn research to Gemini.
- Compact sessions before asking for another large step.

## Commands

- `claude-gemini session start --name "<task name>"`
- `claude-gemini session send <sessionId> "<instruction>"`
- `claude-gemini session compact <sessionId>`
- `claude-gemini session list`
- `claude-gemini session show <sessionId>`
- `claude-gemini session archive <sessionId>`
- `claude-gemini session delete <sessionId>`

## Repository conventions

- Keep `.claude/skills/gemini-bridge/SKILL.md` as the canonical Claude Code skill for this workflow.
- Keep the bridge configuration files and CLI behavior aligned with the README.
- If the user asks to reduce token usage or offload work, route that task through the Gemini bridge first.
