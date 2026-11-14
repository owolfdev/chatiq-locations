/** Photo sets kept on this phone. A server copy is optional and separate. */

export type PhonePhotoSet = {
  id: string;
  placeId: string;
  name: string;
  createdAt: string;
  serverSetId: string | null;
};

export type PhonePhotoRecord = {
  id: string;
  setId: string;
  sortOrder: number;
  blob: Blob;
  contentType: string;
  serverAssetId: string | null;
};

const DB_NAME = "chatiq-mapper-photos";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sets")) {
        const sets = db.createObjectStore("sets", { keyPath: "id" });
        sets.createIndex("placeId", "placeId", { unique: false });
      }
      if (!db.objectStoreNames.contains("photos")) {
        const photos = db.createObjectStore("photos", { keyPath: "id" });
        photos.createIndex("setId", "setId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listPhoneSets(placeId: string): Promise<PhonePhotoSet[]> {
  const db = await openDb();
  const tx = db.transaction("sets", "readonly");
  const rows = await requestToPromise(
    tx.objectStore("sets").index("placeId").getAll(placeId)
  );
  await transactionDone(tx);
  db.close();
  return (rows as PhonePhotoSet[]).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function createPhoneSet(input: {
  placeId: string;
  name: string;
}): Promise<PhonePhotoSet> {
  const set: PhonePhotoSet = {
    id: crypto.randomUUID(),
    placeId: input.placeId,
    name: input.name.trim(),
    createdAt: new Date().toISOString(),
    serverSetId: null,
  };
  const db = await openDb();
  const tx = db.transaction("sets", "readwrite");
  tx.objectStore("sets").put(set);
  await transactionDone(tx);
  db.close();
  return set;
}

export async function loadPhoneSetPhotos(
  setId: string
): Promise<PhonePhotoRecord[]> {
  const db = await openDb();
  const tx = db.transaction("photos", "readonly");
  const rows = await requestToPromise(
    tx.objectStore("photos").index("setId").getAll(setId)
  );
  await transactionDone(tx);
  db.close();
  return (rows as PhonePhotoRecord[]).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function replacePhoneSetPhotos(
  setId: string,
  photos: Array<{
    id: string;
    blob: Blob;
    contentType: string;
    serverAssetId: string | null;
  }>
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("photos", "readwrite");
  const store = tx.objectStore("photos");
  const existing = (await requestToPromise(
    store.index("setId").getAll(setId)
  )) as PhonePhotoRecord[];
  const kept = new Map(
    existing
      .filter((row) => row.serverAssetId)
      .map((row) => [row.id, row.serverAssetId])
  );
  for (const row of existing) store.delete(row.id);
  photos.forEach((photo, index) => {
    const record: PhonePhotoRecord = {
      id: photo.id,
      setId,
      sortOrder: index,
      blob: photo.blob,
      contentType: photo.contentType || "image/jpeg",
      serverAssetId: photo.serverAssetId || kept.get(photo.id) || null,
    };
    store.put(record);
  });
  await transactionDone(tx);
  db.close();
}

export async function markPhonePhotoUploaded(
  photoId: string,
  serverAssetId: string
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("photos", "readwrite");
  const store = tx.objectStore("photos");
  const row = (await requestToPromise(store.get(photoId))) as
    | PhonePhotoRecord
    | undefined;
  if (row) store.put({ ...row, serverAssetId });
  await transactionDone(tx);
  db.close();
}

export async function setPhoneServerSetId(
  setId: string,
  serverSetId: string
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("sets", "readwrite");
  const store = tx.objectStore("sets");
  const row = (await requestToPromise(store.get(setId))) as
    | PhonePhotoSet
    | undefined;
  if (row) store.put({ ...row, serverSetId });
  await transactionDone(tx);
  db.close();
}

export async function deletePhonePhoto(photoId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("photos", "readwrite");
  tx.objectStore("photos").delete(photoId);
  await transactionDone(tx);
  db.close();
}

export async function deletePhoneSet(setId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["sets", "photos"], "readwrite");
  const photos = tx.objectStore("photos");
  const rows = (await requestToPromise(
    photos.index("setId").getAll(setId)
  )) as PhonePhotoRecord[];
  for (const row of rows) photos.delete(row.id);
  tx.objectStore("sets").delete(setId);
  await transactionDone(tx);
  db.close();
}

/** Sets on this phone that still need a Supabase copy. */
export async function listPhoneUploads(placeId: string): Promise<
  Array<{ set: PhonePhotoSet; photos: PhonePhotoRecord[] }>
> {
  const sets = await listPhoneSets(placeId);
  const out: Array<{ set: PhonePhotoSet; photos: PhonePhotoRecord[] }> = [];
  for (const set of sets) {
    const photos = await loadPhoneSetPhotos(set.id);
    if (photos.length === 0) continue;
    if (!set.serverSetId || photos.some((photo) => !photo.serverAssetId)) {
      out.push({ set, photos });
    }
  }
  return out;
}
