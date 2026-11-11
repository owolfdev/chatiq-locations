/**
 * Shared mapper vision limits (safe for client + server imports).
 *
 * Not a Vercel hard cap: photos are compressed on-device and extracted
 * one request at a time. Matches the saved-set size so a full album can
 * load and Process. Bound for time/cost — 24 sequential vision calls.
 */
export const MAX_PROCESS_PHOTOS = 24;
/** After client compress; still guard raw uploads */
export const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
