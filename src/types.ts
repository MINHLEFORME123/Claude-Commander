export type PromptMode = "stdin" | "flag" | "arg";
export type MessageRole = "system" | "user" | "assistant";
export type SessionStatus = "active" | "archived";

export interface BridgeConfig {
  executable: string;
  args: string[];
  cwd: string;
  sessionDirectory: string;
  promptMode: PromptMode;
  promptFlag: string | undefined;
  recentMessageLimit: number;
  summaryMaxCharacters: number;
  systemPrompt: string;
  sourcePath: string | null;
}

export interface SessionMessage {
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  summary: string;
  messages: SessionMessage[];
  lastResponse: string | undefined;
  lastError: string | undefined;
}

export interface SessionOverview {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summaryPreview: string;
  lastResponsePreview: string;
  lastErrorPreview: string;
}

export interface GeminiRunResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}
