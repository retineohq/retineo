/**
 * RETINEO Core — Secrets Manager
 * Phase 7: Encrypted secrets storage with AES-256-GCM.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface SecretsManager {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  listMasked(): Promise<Record<string, string>>;
}

interface SecretsFile {
  version: number;
  data: Record<string, string>; // base64-encoded encrypted values
  salt: string;
}

const SECRETS_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function getMasterKey(salt: Buffer): Buffer {
  const envKey = process.env.RETINEO_MASTER_KEY;
  if (envKey) {
    return crypto.scryptSync(envKey, salt, KEY_LEN);
  }
  // Derive from machine info + default passphrase (not secure, but works for MVP)
  const machineId = `${os.hostname()}-${os.userInfo().username}`;
  return crypto.scryptSync(machineId, salt, KEY_LEN);
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

function decrypt(ciphertext: string, key: Buffer): string {
  const combined = Buffer.from(ciphertext, 'base64');
  const iv = combined.subarray(0, IV_LEN);
  const authTag = combined.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encrypted = combined.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

export class FileSecretsManager implements SecretsManager {
  private secretsPath: string;

  constructor(secretsPath?: string) {
    this.secretsPath = secretsPath ?? path.join(os.homedir(), '.retineo', 'secrets.json');
  }

  private async loadFile(): Promise<SecretsFile> {
    if (!existsSync(this.secretsPath)) {
      return { version: SECRETS_VERSION, data: {}, salt: crypto.randomBytes(16).toString('base64') };
    }
    const raw = await readFile(this.secretsPath, 'utf-8');
    try {
      return JSON.parse(raw) as SecretsFile;
    } catch {
      return { version: SECRETS_VERSION, data: {}, salt: crypto.randomBytes(16).toString('base64') };
    }
  }

  private async saveFile(file: SecretsFile): Promise<void> {
    await mkdir(path.dirname(this.secretsPath), { recursive: true });
    await writeFile(this.secretsPath, JSON.stringify(file, null, 2), 'utf-8');
  }

  async set(key: string, value: string): Promise<void> {
    const file = await this.loadFile();
    const salt = Buffer.from(file.salt, 'base64');
    const keyBuf = getMasterKey(salt);
    file.data[key] = encrypt(value, keyBuf);
    await this.saveFile(file);
  }

  async get(key: string): Promise<string | undefined> {
    const file = await this.loadFile();
    if (!(key in file.data)) return undefined;
    const salt = Buffer.from(file.salt, 'base64');
    const keyBuf = getMasterKey(salt);
    try {
      return decrypt(file.data[key], keyBuf);
    } catch {
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    const file = await this.loadFile();
    delete file.data[key];
    await this.saveFile(file);
  }

  async list(): Promise<string[]> {
    const file = await this.loadFile();
    return Object.keys(file.data);
  }

  /** Return masked values for display */
  async listMasked(): Promise<Record<string, string>> {
    const file = await this.loadFile();
    const result: Record<string, string> = {};
    const salt = Buffer.from(file.salt, 'base64');
    const keyBuf = getMasterKey(salt);
    for (const [k, v] of Object.entries(file.data)) {
      try {
        result[k] = maskSecret(decrypt(v, keyBuf));
      } catch {
        result[k] = '****';
      }
    }
    return result;
  }
}

/** Resolve a secret from env var or secrets manager */
export async function resolveSecret(
  key: string,
  secrets?: SecretsManager
): Promise<string | undefined> {
  const envValue = process.env[key];
  if (envValue !== undefined) return envValue;
  return secrets?.get(key);
}

/** Resolve config value with ${ENV_VAR} or ${secret:key} substitution */
export async function resolveConfigValue(
  value: string,
  secrets?: SecretsManager
): Promise<string> {
  // ${ENV_VAR} → env or secrets
  const envPattern = /\$\{([^}]+)\}/g;
  const results: string[] = [];
  let match;
  while ((match = envPattern.exec(value)) !== null) {
    results.push(match[1]);
  }
  if (results.length === 0) return value;

  let resolved = value;
  for (const name of results) {
    const secretValue = await resolveSecret(name, secrets);
    resolved = resolved.replaceAll('${' + name + '}', secretValue ?? '');
  }
  return resolved;
}
