/**
 * Shared mapper vision limits (safe for client + server imports).
 *
 * Not a Vercel hard cap: photos are compressed on-device and extracted
 * one request at a time, so aisle walks can queue many shots. Bound only
 * for UX (time/cost) and runaway queues — ~10–12 is normal for one aisle.
 */
export const MAX_PROCESS_PHOTOS = 12;
/** After client compress; still guard raw uploads */
export const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
