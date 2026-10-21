(function (root) {
  'use strict';
  const DB_NAME = 'messwerte-v3-attachments';
  const DB_VERSION = 1;
  const STORE = 'files';
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
  const MAX_FILES_PER_ENTRY = 20;
  const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
  const MAX_ARCHIVE_FILES = 2000;
  const MAX_ARCHIVE_METADATA_BYTES = 5 * 1024 * 1024;
  const TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet'
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function extension(name) {
    return String(name).split(/[\\/]/).pop().match(/\.([^.]+)$/)?.[1].toLowerCase() || '';
  }

  function safeName(name) {
    return String(name).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'datei';
  }

  function validateFile(file) {
    const name = safeName(file?.name);
    const ext = extension(name);
    if (!Object.hasOwn(TYPES, ext)) throw new Error(`Dateityp nicht erlaubt: ${name}.`);
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      throw new Error(`${name}: Dateien duerfen maximal 10 MB gross sein.`);
    }
    return { name, type: TYPES[ext], size: file.size };
  }

  function validateGroup(files) {
    if (!Array.isArray(files) || files.length > MAX_FILES_PER_ENTRY) {
      throw new Error('Pro Messwert sind maximal 20 Dateien erlaubt.');
    }
    const prepared = files.map((file) => ({ ...validateFile(file), file }));
    if (prepared.reduce((total, item) => total + item.size, 0) > MAX_ENTRY_BYTES) {
      throw new Error('Die Anhaenge eines Messwerts duerfen zusammen maximal 30 MB gross sein.');
    }
    return prepared;
  }

  function openDatabase() {
    if (!root.indexedDB) return Promise.reject(new Error('Dieser Browser unterstuetzt den lokalen Dateispeicher nicht.'));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('entryId', 'entryId', { unique: false });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('Lokaler Dateispeicher konnte nicht geoeffnet werden.'));
    });
  }

  function metadata(record) {
    return { id: record.id, entryId: record.entryId, name: record.name, type: record.type, size: record.size, addedAt: record.addedAt };
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Dateien konnten nicht gespeichert werden.'));
      transaction.onabort = () => reject(transaction.error || new Error('Dateispeicherung wurde abgebrochen.'));
    });
  }

  function uuid() {
    const bytes = root.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function listAll() {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const records = await new Promise((resolve, reject) => {
        const request = transaction.objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result.map(metadata));
        request.onerror = () => reject(request.error);
      });
      return records;
    } finally { database.close(); }
  }

  async function listForEntry(entryId) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const records = await new Promise((resolve, reject) => {
        const request = transaction.objectStore(STORE).index('entryId').getAll(entryId);
        request.onsuccess = () => resolve(request.result.map(metadata));
        request.onerror = () => reject(request.error);
      });
      return records.sort((left, right) => left.addedAt.localeCompare(right.addedAt));
    } finally { database.close(); }
  }

  async function get(id) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readonly');
      return await new Promise((resolve, reject) => {
        const request = transaction.objectStore(STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }

  async function addFiles(entryId, files) {
    if (!UUID.test(entryId)) throw new Error('Ungueltige Messwert-ID.');
    const prepared = validateGroup(Array.from(files || []));
    const existing = await listForEntry(entryId);
    if (existing.length + prepared.length > MAX_FILES_PER_ENTRY || existing.reduce((sum, item) => sum + item.size, 0) + prepared.reduce((sum, item) => sum + item.size, 0) > MAX_ENTRY_BYTES) {
      throw new Error('Die Anhaenge eines Messwerts duerfen maximal 20 Dateien und 30 MB umfassen.');
    }
    const addedAt = new Date().toISOString();
    const records = prepared.map((item) => ({ id: uuid(), entryId, name: item.name, type: item.type, size: item.size, addedAt, blob: new root.Blob([item.file], { type: item.type }) }));
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      for (const record of records) transaction.objectStore(STORE).add(record);
      await transactionDone(transaction);
      return records.map(metadata);
    } finally { database.close(); }
  }

  async function addImported(records) {
    if (!records.length) return { count: 0, ids: [] };
    const entries = new Map();
    for (const record of records) {
      if (!UUID.test(record.id) || !UUID.test(record.entryId) || !root.Blob || !(record.blob instanceof root.Blob)) throw new Error('Ungueltiger Anhang im ZIP-Archiv.');
      const checked = validateFile({ name: record.name, size: record.blob.size });
      if (checked.size !== record.size || checked.name !== record.name || checked.type !== record.type || !Number.isFinite(Date.parse(record.addedAt))) {
        throw new Error('Anhang-Metadaten im ZIP-Archiv sind ungueltig.');
      }
      const group = entries.get(record.entryId) || [];
      group.push(record);
      entries.set(record.entryId, group);
    }
    for (const group of entries.values()) validateGroup(group.map((record) => ({ name: record.name, size: record.size })));

    const current = await listAll();
    const currentById = new Map(current.map((record) => [record.id, record]));
    const seenIds = new Set(currentById.keys());
    const additions = [];
    for (const record of records) {
      const existing = currentById.get(record.id);
      if (existing) {
        const same = ['entryId', 'name', 'type', 'size', 'addedAt'].every((key) => existing[key] === record[key]);
        if (!same) throw new Error(`Anhang-Konflikt fuer ID ${record.id}.`);
      } else if (!seenIds.has(record.id)) {
        additions.push(record);
        seenIds.add(record.id);
      } else throw new Error(`Doppelter Anhang im ZIP-Archiv: ${record.id}.`);
    }
    const totals = new Map();
    for (const record of [...current, ...additions]) {
      const total = totals.get(record.entryId) || { count: 0, size: 0 };
      total.count += 1;
      total.size += record.size;
      totals.set(record.entryId, total);
    }
    for (const total of totals.values()) {
      if (total.count > MAX_FILES_PER_ENTRY || total.size > MAX_ENTRY_BYTES) throw new Error('Die Anhaenge eines Messwerts duerfen maximal 20 Dateien und 30 MB umfassen.');
    }
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      for (const record of additions) transaction.objectStore(STORE).add(record);
      await transactionDone(transaction);
    } finally { database.close(); }
    return { count: additions.length, ids: additions.map((record) => record.id) };
  }

  async function remove(ids) {
    if (!ids.length) return;
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      for (const id of ids) transaction.objectStore(STORE).delete(id);
      await transactionDone(transaction);
    } finally { database.close(); }
  }

  async function createArchive(document, providedRecords) {
    if (!root.JSZip) throw new Error('ZIP-Unterstuetzung ist nicht geladen.');
    const entryIds = new Set(document.entries.map((entry) => entry.id));
    let records = providedRecords;
    if (!records && !root.indexedDB) records = [];
    if (!records) {
      records = [];
      for (const item of await listAll()) {
        if (!entryIds.has(item.entryId)) continue;
        const record = await get(item.id);
        if (!record?.blob) throw new Error(`Anhang fehlt im lokalen Speicher: ${item.name}.`);
        records.push(record);
      }
    }
    const zip = new root.JSZip();
    zip.file('messwerte.json', JSON.stringify(document, null, 2));
    const manifest = [];
    for (const record of records) {
      const path = `attachments/${record.id}.${extension(record.name)}`;
      zip.file(path, record.blob, { compression: 'STORE' });
      manifest.push({ ...metadata(record), path });
    }
    zip.file('anhaenge.json', JSON.stringify({ format: 'messwerte-v3-attachments', version: 1, attachments: manifest }, null, 2));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  }

  async function parseArchive(file, parseData) {
    const fileSize = file?.size ?? file?.byteLength;
    if (!file || fileSize > MAX_ARCHIVE_BYTES) throw new Error('ZIP-Datei darf maximal 100 MB gross sein.');
    if (/\.json$/i.test(file.name || '') || file.type === 'application/json') return { document: parseData(await file.text()), attachments: [] };
    if (!root.JSZip) throw new Error('ZIP-Unterstuetzung ist nicht geladen.');
    const zip = await root.JSZip.loadAsync(file instanceof Uint8Array ? file : await file.arrayBuffer());
    const dataFile = zip.file('messwerte.json');
    const manifestFile = zip.file('anhaenge.json');
    if (!dataFile || !manifestFile) throw new Error('ZIP-Datei enthaelt keine Messwerte und Anhangsliste.');
    if (Object.keys(zip.files).length > MAX_ARCHIVE_FILES + 10 || dataFile._data?.uncompressedSize > root.MeasureData.MAX_BYTES || manifestFile._data?.uncompressedSize > MAX_ARCHIVE_METADATA_BYTES) {
      throw new Error('ZIP-Datei enthaelt zu viele oder zu grosse Eintraege.');
    }
    const document = parseData(await dataFile.async('string'));
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest?.format !== 'messwerte-v3-attachments' || manifest.version !== 1 || !Array.isArray(manifest.attachments) || manifest.attachments.length > MAX_ARCHIVE_FILES) {
      throw new Error('Ungueltiges Anhang-Archiv.');
    }
    const entryIds = new Set(document.entries.map((entry) => entry.id));
    const paths = new Set(['messwerte.json', 'anhaenge.json']);
    const attachments = [];
    for (const item of manifest.attachments) {
      const ext = extension(item.name);
      const expectedPath = `attachments/${item.id}.${ext}`;
      if (!UUID.test(item.id) || !UUID.test(item.entryId) || !entryIds.has(item.entryId) || item.path !== expectedPath || paths.has(item.path) || !zip.file(item.path)) {
        throw new Error('Ungueltiger Dateiverweis im ZIP-Archiv.');
      }
      const checked = validateFile({ name: item.name, size: item.size });
      const archiveFile = zip.file(item.path);
      if (archiveFile._data?.uncompressedSize > MAX_FILE_BYTES) throw new Error(`${item.name}: Datei im ZIP ist groesser als 10 MB.`);
      const raw = await archiveFile.async('uint8array');
      if (raw.byteLength !== item.size || checked.type !== item.type || !Number.isFinite(Date.parse(item.addedAt))) {
        throw new Error(`Datei im ZIP stimmt nicht mit den Metadaten ueberein: ${item.name}.`);
      }
      paths.add(item.path);
      attachments.push({ id: item.id, entryId: item.entryId, name: checked.name, type: checked.type, size: checked.size, addedAt: item.addedAt, blob: new root.Blob([raw], { type: checked.type }) });
    }
    const unexpected = Object.keys(zip.files).filter((path) => !zip.files[path].dir && !paths.has(path));
    if (unexpected.length) throw new Error('ZIP-Datei enthaelt nicht erwartete Dateien.');
    const groups = new Map();
    for (const item of attachments) groups.set(item.entryId, (groups.get(item.entryId) || []).concat(item));
    for (const group of groups.values()) validateGroup(group.map((item) => ({ name: item.name, size: item.size })));
    return { document, attachments };
  }

  const api = { validateFile, addFiles, addImported, remove, listAll, listForEntry, get, createArchive, parseArchive, MAX_FILE_BYTES, MAX_ENTRY_BYTES, MAX_FILES_PER_ENTRY, MAX_ARCHIVE_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MeasureAttachments = api;
})(globalThis);