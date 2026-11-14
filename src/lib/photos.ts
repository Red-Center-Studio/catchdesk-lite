/**
 * Photo uploads. Objects in R2 are never public: keys are random, and the only ways to view a photo are the staff
 * route (signed in) and the customer's own quote link, which both look the photo up through its lead first.
 */

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_LEAD = 6;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export type PhotoCheck = { ok: true; files: File[] } | { ok: false; message: string };

/** Validates one or more uploaded photos. Empty file inputs count as no photo. */
export function validatePhotos(values: unknown[], max = MAX_PHOTOS_PER_LEAD): PhotoCheck {
  const files: File[] = [];
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    if (!(value instanceof File)) return { ok: false, message: "A photo could not be read. Try choosing it again." };
    if (value.size === 0) continue;
    if (value.size > MAX_PHOTO_BYTES) {
      return { ok: false, message: "A photo is too big. Each photo must be 10 MB or smaller." };
    }
    if (!(ACCEPTED_TYPES as readonly string[]).includes(value.type)) {
      return { ok: false, message: "Photos must be JPEG, PNG, WebP or HEIC images." };
    }
    files.push(value);
  }
  if (files.length > max) return { ok: false, message: `Add ${max} photos at most.` };
  return { ok: true, files };
}

export async function storePhoto(bucket: R2Bucket, file: File): Promise<string> {
  const key = `leads/${crypto.randomUUID()}`;
  // At most 10 MB, so reading it into memory is fine and gives R2 the exact length it needs.
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return key;
}

/** Streams a stored photo back to an allowed viewer. */
export async function photoResponse(bucket: R2Bucket, key: string): Promise<Response | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");
  headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  return new Response(obj.body, { headers });
}

/** A long random token for customer links: 32 bytes as hex. */
export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
