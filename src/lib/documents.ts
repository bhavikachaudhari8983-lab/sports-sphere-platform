import type { Document } from "@prisma/client";
import { prisma } from "./prisma";
import { deleteStoredFile } from "./storage";
import type { DraftDoc } from "./registration-types";
import type { DocType } from "./constants";

/** Types where a new upload replaces the previous one. */
export const SINGLE_INSTANCE: readonly DocType[] = ["PHOTO", "SELFIE", "COLLEGE_ID", "BONAFIDE", "PASSPORT", "VISA", "FRRO", "MEDICAL_CERT", "GUARDIAN_CONSENT", "ID_PROOF"];
export const MAX_ACHIEVEMENTS = 5;

export function toDraftDoc(d: Document): DraftDoc {
  return {
    id: d.id,
    type: d.type as DocType,
    source: d.source,
    originalName: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function deleteDocument(d: Document): Promise<void> {
  await prisma.document.delete({ where: { id: d.id } });
  await deleteStoredFile(d.storageKey);
}
