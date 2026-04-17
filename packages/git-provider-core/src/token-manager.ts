import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";

const getTokenDir = () => join(app.getPath("userData"), "git-providers");

const ensureDir = () => {
	const dir = getTokenDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

export async function saveToken(
	provider: string,
	token: string,
): Promise<void> {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error("safeStorage unavailable");
	}
	ensureDir();
	const encrypted = safeStorage.encryptString(token);
	writeFileSync(join(getTokenDir(), `${provider}.enc`), encrypted);
}

export async function loadToken(provider: string): Promise<string | null> {
	try {
		const file = join(getTokenDir(), `${provider}.enc`);
		if (!existsSync(file)) return null;
		const buf = readFileSync(file);
		return safeStorage.decryptString(buf);
	} catch {
		return null;
	}
}

export async function clearToken(provider: string): Promise<void> {
	const file = join(getTokenDir(), `${provider}.enc`);
	if (existsSync(file)) writeFileSync(file, "");
}
