import { SessionStore } from "./session-store.js";
import { BridgeConfig, GeminiRunResult, SessionMessage, SessionOverview, SessionRecord } from "./types.js";
import { describeCommand, runGeminiPrompt } from "./gemini-runner.js";

function nowIso(): string {
  return new Date().toISOString();
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatTranscript(messages: SessionMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`.trim())
    .join("\n\n");
}

function normalizeResponse(result: GeminiRunResult): string {
  const stdout = result.stdout.trim();
  if (stdout) {
    return stdout;
  }

  const stderr = result.stderr.trim();
  return stderr;
}

export class GeminiBridge {
  private readonly store: SessionStore;

  constructor(private readonly config: BridgeConfig) {
    this.store = new SessionStore(config);
  }

  async createSession(name?: string): Promise<SessionRecord> {
    return this.store.createSession(name);
  }

  async listSessions(): Promise<SessionOverview[]> {
    return this.store.listSessions();
  }

  async getSession(sessionId: string): Promise<SessionRecord> {
    return this.store.readSession(sessionId);
  }

  async tryGetSession(sessionId: string): Promise<SessionRecord | null> {
    return this.store.tryReadSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
  }

  async archiveSession(sessionId: string): Promise<SessionRecord> {
    return this.store.archiveSession(sessionId);
  }

  async sendToSession(sessionId: string, userPrompt: string): Promise<{ session: SessionRecord; response: string; command: string; args: string[] }> {
    const session = await this.store.readSession(sessionId);
    const prompt = this.buildConversationPrompt(session, userPrompt);
    const commandDescription = describeCommand(this.config, prompt);

    try {
      const result = await runGeminiPrompt(this.config, prompt);
      const response = normalizeResponse(result);

      const updatedSession = await this.store.updateSession(sessionId, (currentSession) => {
        currentSession.messages.push({
          role: "user",
          content: userPrompt,
          createdAt: nowIso(),
        });
        currentSession.messages.push({
          role: "assistant",
          content: response,
          createdAt: nowIso(),
        });
        currentSession.lastResponse = response;
        currentSession.lastError = undefined;
      });

      return {
        session: updatedSession,
        response,
        command: result.command,
        args: result.args,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updatedSession = await this.store.updateSession(sessionId, (currentSession) => {
        currentSession.messages.push({
          role: "user",
          content: userPrompt,
          createdAt: nowIso(),
        });
        currentSession.lastError = message;
        currentSession.lastResponse = undefined;
      });

      throw new Error(`${message}\n\nAttempted command: ${commandDescription}`);
    }
  }

  async compactSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.store.readSession(sessionId);
    const prompt = this.buildSummaryPrompt(session);

    try {
      const result = await runGeminiPrompt(this.config, prompt);
      const summary = truncate(normalizeResponse(result), this.config.summaryMaxCharacters);

      return this.store.updateSession(sessionId, (currentSession) => {
        currentSession.summary = summary;
        currentSession.messages = currentSession.messages.filter((message) => message.role === "system").concat(
          currentSession.messages.filter((message) => message.role !== "system").slice(-this.config.recentMessageLimit),
        );
        currentSession.lastResponse = summary;
        currentSession.lastError = undefined;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.updateSession(sessionId, (currentSession) => {
        currentSession.lastError = message;
      });
      throw new Error(message);
    }
  }

  buildConversationPrompt(session: SessionRecord, userPrompt: string): string {
    const sections: string[] = [this.config.systemPrompt.trim()];

    if (session.summary.trim()) {
      sections.push(`Session summary:\n${truncate(session.summary, this.config.summaryMaxCharacters)}`);
    }

    const recentMessages = session.messages.filter((message) => message.role !== "system").slice(-this.config.recentMessageLimit);
    if (recentMessages.length > 0) {
      sections.push(`Recent transcript:\n${formatTranscript(recentMessages)}`);
    }

    sections.push(`Current request:\n${userPrompt.trim()}`);
    sections.push([
      "Guidance:",
      "- Use the summary as canonical context.",
      "- Avoid repeating unchanged background.",
      "- Keep the response compact unless the task needs more detail.",
    ].join("\n"));

    return sections.join("\n\n");
  }

  buildSummaryPrompt(session: SessionRecord): string {
    const recentMessages = session.messages.filter((message) => message.role !== "system").slice(-Math.max(this.config.recentMessageLimit * 2, this.config.recentMessageLimit));
    const sections = [
      "Create a compact session summary for future delegation.",
      "Keep the summary focused on decisions, open tasks, constraints, file names, commands, and facts that should survive context trimming.",
      session.summary.trim() ? `Existing summary:\n${truncate(session.summary, this.config.summaryMaxCharacters)}` : "Existing summary:\n(none)",
      recentMessages.length > 0 ? `Recent transcript:\n${formatTranscript(recentMessages)}` : "Recent transcript:\n(none)",
      "Output only the summary text.",
    ];

    return sections.join("\n\n");
  }
}
