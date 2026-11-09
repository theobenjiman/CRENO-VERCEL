export const PHOTO_BUCKET = "salon-photos";
export const MAX_PHOTOS = 12;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export interface SalonPhoto { id: string; path: string; caption: string | null; position: number }

export function photoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}
