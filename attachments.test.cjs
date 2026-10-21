const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.JSZip = require('./vendor/jszip.min.js');
const attachments = require('./attachments.js');
const data = require('./data.js');

const entryId = '00000000-0000-4000-8000-000000000001';
const attachmentId = '00000000-0000-4000-8000-000000000002';
const document = { ...data.empty(), entries: [{ id: entryId, createdAt: '2026-10-19T10:00:00.000Z', title: 'Messung', value: 1, unit: '', location: '', author: 'Test', note: '' }] };

test('Dateivalidierung erlaubt gaengige Bilder und Dokumente', () => {
  assert.equal(attachments.validateFile({ name: 'Foto.JPG', size: 20 }).type, 'image/jpeg');
  assert.equal(attachments.validateFile({ name: 'Protokoll.pdf', size: 20 }).type, 'application/pdf');
  assert.throws(() => attachments.validateFile({ name: 'programm.exe', size: 20 }), /Dateityp nicht erlaubt/);
  assert.throws(() => attachments.validateFile({ name: 'zu-gross.pdf', size: attachments.MAX_FILE_BYTES + 1 }), /10 MB/);
});

test('ZIP-Export und Import erhalten Messwerte, Zuordnung und Dateiinhalt', async () => {
  const blob = new Uint8Array(Buffer.from('bildinhalt'));
  const archive = await attachments.createArchive(document, [{
    id: attachmentId, entryId, name: 'Foto.jpg', type: 'image/jpeg', size: blob.byteLength,
    addedAt: '2026-10-19T10:01:00.000Z', blob
  }]);
  const imported = await attachments.parseArchive(archive, data.parse);
  assert.deepEqual(imported.document, document);
  assert.equal(imported.attachments.length, 1);
  assert.equal(imported.attachments[0].entryId, entryId);
  assert.equal(await imported.attachments[0].blob.text(), 'bildinhalt');
});

test('bisherige JSON-Exporte bleiben importierbar', async () => {
  const file = new Blob([JSON.stringify(document)], { type: 'application/json' });
  const imported = await attachments.parseArchive(file, data.parse);
  assert.deepEqual(imported, { document, attachments: [] });
});

test('ZIP-Import ohne Anhaenge benoetigt keinen IndexedDB-Speicher', async () => {
  assert.deepEqual(await attachments.addImported([]), { count: 0, ids: [] });
});