// Private file storage. Files live OUTSIDE /public and are only served by
// /api/documents/[id] after an authorisation check.
// Local disk by default; a private Supabase Storage bucket when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// are set (needed on Vercel, whose disk is wiped between requests).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  return configured ? resolve(configured) : resolve(process.cwd(), "uploads");
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function saveFile(data: Uint8Array, mimeType: string): Promise<string> {
  const ext = EXT[mimeType];
  if (!ext) throw new Error(`Unsupported type ${mimeType}`);
  const key = `${randomUUID()}.${ext}`;
  const remote = supabase();
  if (remote) {
    const r = await remote.fetch(key, { method: "POST", headers: { "Content-Type": mimeType, "x-upsert": "false" }, body: Buffer.from(data) });
    if (!r.ok) throw new Error(`Storage upload failed (${r.status}): ${await r.text()}`);
    return key;
  }
  await mkdir(uploadRoot(), { recursive: true });
  await writeFile(join(uploadRoot(), key), data, { mode: 0o600 });
  return key;
}

function safePath(key: string): string {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(key)) throw new Error("Invalid storage key");
  return join(uploadRoot(), key);
}

export async function readStoredFile(key: string): Promise<Buffer> {
  const path = safePath(key);
  const remote = supabase();
  if (!remote) return readFile(path);
  const r = await remote.fetch(key, { method: "GET" });
  if (!r.ok) throw new Error(`Storage read failed (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

export async function deleteStoredFile(key: string): Promise<void> {
  try {
    const path = safePath(key);
    const remote = supabase();
    if (remote) {
      await remote.fetch(key, { method: "DELETE" });
      return;
    }
    await unlink(path);
  } catch {
    // already gone
  }
}

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "uploads";

/** Supabase Storage client (REST, no SDK), or null when not configured. */
function supabase() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secret) return null;
  return {
    fetch: (key: string, init: RequestInit) =>
      fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${key}`, {
        ...init,
        cache: "no-store",
        headers: { ...(init.headers as Record<string, string>), apikey: secret, Authorization: `Bearer ${secret}` },
      }),
  };
}

/** Checks magic bytes so a renamed file can't pass as an image/PDF. */
export function sniffMime(data: Uint8Array): string | null {
  const b = data;
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}
