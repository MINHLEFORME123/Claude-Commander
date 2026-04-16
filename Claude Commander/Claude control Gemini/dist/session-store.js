import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
function nowIso() {
    return new Date().toISOString();
}
function defaultSessionName() {
    return `Session ${new Date().toISOString().replace(/[:.]/g, "-")}`;
}
function previewText(value, limit) {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "";
    }
    if (normalized.length <= limit) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
async function writeJsonAtomic(filePath, value) {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rm(filePath, { force: true });
    await rename(tempPath, filePath);
}
export class SessionStore {
    config;
    constructor(config) {
        this.config = config;
    }
    sessionPath(sessionId) {
        return path.join(this.config.sessionDirectory, `${sessionId}.json`);
    }
    async ensureReady() {
        await mkdir(this.config.sessionDirectory, { recursive: true });
    }
    async createSession(name) {
        await this.ensureReady();
        const session = {
            id: randomUUID(),
            name: name?.trim() || defaultSessionName(),
            status: "active",
            createdAt: nowIso(),
            updatedAt: nowIso(),
            summary: "",
            messages: [],
            lastResponse: undefined,
            lastError: undefined,
        };
        await this.saveSession(session);
        return session;
    }
    async readSession(sessionId) {
        const filePath = this.sessionPath(sessionId);
        const contents = await readFile(filePath, "utf8").catch((error) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (contents === null) {
            throw new Error(`Session ${sessionId} was not found.`);
        }
        const parsed = JSON.parse(contents);
        if (!parsed || typeof parsed !== "object") {
            throw new Error(`Session ${sessionId} contains invalid data.`);
        }
        return this.normalizeRecord(sessionId, parsed);
    }
    async tryReadSession(sessionId) {
        try {
            return await this.readSession(sessionId);
        }
        catch (error) {
            if (error.code === "ENOENT") {
                return null;
            }
            if (error.message.includes("was not found")) {
                return null;
            }
            throw error;
        }
    }
    async saveSession(session) {
        await this.ensureReady();
        await writeJsonAtomic(this.sessionPath(session.id), session);
    }
    async updateSession(sessionId, updater) {
        const session = await this.readSession(sessionId);
        await updater(session);
        session.updatedAt = nowIso();
        await this.saveSession(session);
        return session;
    }
    async deleteSession(sessionId) {
        await rm(this.sessionPath(sessionId), { force: true });
    }
    async archiveSession(sessionId) {
        return this.updateSession(sessionId, (session) => {
            session.status = "archived";
        });
    }
    async listSessions() {
        await this.ensureReady();
        const entries = await readdir(this.config.sessionDirectory, { withFileTypes: true }).catch((error) => {
            if (error.code === "ENOENT") {
                return [];
            }
            throw error;
        });
        const sessions = await Promise.all(entries
            .filter((entry) => entry.isFile() && String(entry.name).endsWith(".json"))
            .map(async (entry) => {
            try {
                return await this.readSession(String(entry.name).replace(/\.json$/u, ""));
            }
            catch {
                return null;
            }
        }));
        return sessions
            .filter((session) => session !== null)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .map((session) => this.toOverview(session));
    }
    toOverview(session) {
        const lastMessage = session.messages.length > 0 ? session.messages[session.messages.length - 1] : undefined;
        return {
            id: session.id,
            name: session.name,
            status: session.status,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messages.length,
            summaryPreview: previewText(session.summary, 120),
            lastResponsePreview: previewText(session.lastResponse ?? (lastMessage?.role === "assistant" ? lastMessage.content : ""), 120),
            lastErrorPreview: previewText(session.lastError, 120),
        };
    }
    normalizeRecord(sessionId, parsed) {
        const messages = Array.isArray(parsed.messages)
            ? parsed.messages.filter((message) => this.isSessionMessage(message))
            : [];
        return {
            id: typeof parsed.id === "string" && parsed.id.trim() ? parsed.id : sessionId,
            name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : defaultSessionName(),
            status: parsed.status === "archived" ? "archived" : "active",
            createdAt: typeof parsed.createdAt === "string" && parsed.createdAt.trim() ? parsed.createdAt : nowIso(),
            updatedAt: typeof parsed.updatedAt === "string" && parsed.updatedAt.trim() ? parsed.updatedAt : nowIso(),
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            messages,
            lastResponse: typeof parsed.lastResponse === "string" ? parsed.lastResponse : undefined,
            lastError: typeof parsed.lastError === "string" ? parsed.lastError : undefined,
        };
    }
    isSessionMessage(value) {
        if (!value || typeof value !== "object") {
            return false;
        }
        const message = value;
        return ((message.role === "system" || message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            typeof message.createdAt === "string");
    }
}
