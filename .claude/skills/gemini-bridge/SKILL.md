---
name: gemini-bridge
description: "Use when Claude Code should delegate long-running, token-heavy, or multi-step work to Gemini CLI through the claude-gemini bridge, including session start, send, compact, list, show, archive, and delete workflows."
---

# Gemini Bridge Skill

Use this skill when the task is better handled by Gemini CLI than by keeping the full workflow inside the current Claude context.
The goal is to keep Claude focused on orchestration while Gemini does the repetitive or high-context work.

## When to delegate

- The task needs many file reads, searches, or iterative edits.
- The context would grow too large if kept entirely in Claude.
- You want the work preserved in a durable session file.
- You need a compact summary instead of a full transcript.
- You want a clean handoff between Claude and Gemini.

## Default workflow

1. Start a session for the task.
   - `claude-gemini session start --name "<task name>"`
   - If the command is not on PATH, use `node .\dist\cli.js session start --name "<task name>"`
2. Send the actual instruction to Gemini.
   - `claude-gemini session send <sessionId> "<instruction>"`
3. Review the response and decide whether to continue.
4. Compact the session once the transcript starts to grow.
   - `claude-gemini session compact <sessionId>`
5. List or inspect sessions when needed.
   - `claude-gemini session list`
   - `claude-gemini session show <sessionId>`
6. Archive or delete the session when the work is done.
   - `claude-gemini session archive <sessionId>`
   - `claude-gemini session delete <sessionId>`

## Prompting rules

- Give Gemini the objective, constraints, relevant files, and the expected output.
- Ask for concise, structured replies.
- Prefer patch-oriented or file-oriented output when the work involves code changes.
- If the task has many turns, compact before asking for the next step.
- Use the session summary as the canonical context, not the entire transcript.

## Recommended delegation pattern

- Claude handles planning, intent, and final integration.
- Gemini handles repeated code inspection, mechanical edits, and narrow sub-tasks.
- Claude re-loads only the compacted summary and the latest response.

## Example

```bash
claude-gemini session start --name "Investigate Gemini bridge"
claude-gemini session send <sessionId> "Read the current bridge implementation and suggest the smallest change needed to support compaction after every 5 turns. Return only the file paths and patch plan."
claude-gemini session compact <sessionId>
```
