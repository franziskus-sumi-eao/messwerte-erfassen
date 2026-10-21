'use strict';
const data = globalThis.MeasureData;
const attachments = globalThis.MeasureAttachments;
const byId = (id) => document.getElementById(id);
const DATA_KEY = 'messwerte-v3-data';
const AUTHOR_KEY = 'messwerte-v3-author';
const LEGACY_SETTINGS_KEY = 'messwerte-v3-settings';
let state = data.empty();
let author = '';
let busy = false;
let blocked = false;
let limit = 100;
let currentEntryId = '';
let attachmentCounts = new Map();

function notice(message, error = false) {
  byId('notice').textContent = message;
  byId('notice').dataset.error = String(error);
  byId('notice').hidden = false;
}

function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readDisk() {
  const stored = localStorage.getItem(DATA_KEY);
  return stored === null ? data.empty() : data.parse(stored);
}

function persist(incoming) {
  const combined = data.merge(state, readDisk(), incoming);
  localStorage.setItem(DATA_KEY, JSON.stringify(combined));
  state = combined;
  render();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function controls() {
  byId('entry-form').inert = blocked || busy;
  for (const id of ['save', 'import', 'export']) byId(id).disabled = blocked || busy;
  byId('attachment-add').disabled = busy || !byId('attachment-files').files.length;
}

function render() {
  const query = byId('search').value.trim().toLocaleLowerCase('de');
  const filtered = [...state.entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)).filter((entry) => [entry.title, entry.value, entry.unit, entry.location, entry.author, entry.note].join(' ').toLocaleLowerCase('de').includes(query));
  byId('count').textContent = state.entries.length;
  const fragment = document.createDocumentFragment();
  for (const entry of filtered.slice(0, limit)) {
    const row = document.createElement('tr');
    const measurement = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const location = document.createElement('small');
    location.textContent = entry.location || 'Keine Messstelle';
    measurement.append(title, location);
    if (entry.note) {
      const note = document.createElement('div');
      note.className = 'entry-note';
      note.textContent = entry.note;
      measurement.append(note);
    }
    const attachmentButton = document.createElement('button');
    attachmentButton.type = 'button';
    attachmentButton.className = 'attachment-trigger';
    attachmentButton.dataset.entryId = entry.id;
    const attachmentCount = attachmentCounts.get(entry.id) || 0;
    attachmentButton.textContent = `${attachmentCount} ${attachmentCount === 1 ? 'Anhang' : 'Anh\u00e4nge'}`;
    measurement.append(attachmentButton);
    const value = document.createElement('td');
    const number = document.createElement('strong');
    number.textContent = new Intl.NumberFormat('de', { maximumSignificantDigits: 15 }).format(entry.value);
    const unit = document.createElement('small');
    unit.textContent = entry.unit;
    value.append(number, unit);
    const recorded = document.createElement('td');
    const date = document.createElement('span');
    date.textContent = new Date(entry.createdAt).toLocaleString('de', { dateStyle: 'short', timeStyle: 'short' });
    const author = document.createElement('small');
    author.textContent = entry.author;
    recorded.append(date, author);
    row.append(measurement, value, recorded);
    fragment.append(row);
  }
  byId('records').replaceChildren(fragment);
  byId('empty').hidden = filtered.length > 0;
  byId('empty').querySelector('h3').textContent = query ? 'Keine Treffer' : 'Noch keine Messwerte';
  byId('empty').querySelector('p').textContent = `${state.entries.length} Eintraege im lokalen Datenbestand`;
  byId('visible-count').textContent = `${Math.min(limit, filtered.length)} von ${filtered.length} Eintraegen`;
  byId('more').hidden = filtered.length <= limit;
  controls();
}

try {
  state = readDisk();
  const legacySettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
  if (legacySettings) author = JSON.parse(legacySettings)?.author || '';
  author = localStorage.getItem(AUTHOR_KEY) || author;
  localStorage.setItem(AUTHOR_KEY, author);
  localStorage.removeItem(LEGACY_SETTINGS_KEY);
  localStorage.setItem(DATA_KEY, JSON.stringify(state));
} catch {
  blocked = true;
  notice('Lokaler Speicher ist nicht verfuegbar oder gespeicherte Daten sind beschaedigt. Es wird nichts ueberschrieben. Browser-Speicher pruefen und vorhandene Daten sichern.', true);
}
byId('author').value = author;
render();

byId('entry-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (blocked || busy || !event.target.reportValidity()) return;
  try {
    const entry = { id: uuid(), createdAt: new Date().toISOString(), title: byId('title').value.trim(), value: byId('value').valueAsNumber, unit: byId('unit').value.trim(), location: byId('location').value.trim(), author: byId('author').value.trim(), note: byId('note').value.trim() };
    persist({ ...data.empty(), entries: [entry] });
    author = entry.author;
    try { localStorage.setItem(AUTHOR_KEY, author); } catch { notice('Messwert gespeichert, Erfasser-Voreinstellung konnte nicht gespeichert werden.', true); return; }
    byId('title').value = '';
    byId('value').value = '';
    byId('note').value = '';
    notice('Messwert lokal gespeichert. Noch nicht an andere Geraete uebertragen.');
    byId('title').focus();
  } catch (error) { notice(`Nicht gespeichert: ${error.message}`, true); }
});

byId('search').addEventListener('input', () => { limit = 100; render(); });
byId('more').addEventListener('click', () => { limit += 100; render(); });
byId('export').addEventListener('click', async () => {
  if (blocked || busy) return;
  busy = true;
  controls();
  try {
    persist(data.empty());
    const archive = await attachments.createArchive(state);
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `messwerte-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notice(`ZIP-Export mit ${state.entries.length} Messwerten und ${attachmentCounts.size ? [...attachmentCounts.values()].reduce((sum, count) => sum + count, 0) : 0} Anhaengen bereitgestellt.`);
  } catch (error) { notice(`Export fehlgeschlagen: ${error.message}`, true); }
  finally { busy = false; controls(); }
});
byId('import').addEventListener('click', () => byId('import-file').click());
byId('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || blocked || busy) return;
  busy = true;
  controls();
  try {
    const before = state.entries.length;
    const imported = await attachments.parseArchive(file, data.parse);
    data.merge(state, imported.document);
    const added = await attachments.addImported(imported.attachments);
    try { persist(imported.document); }
    catch (error) { await attachments.remove(added.ids); throw error; }
    await refreshAttachmentCounts();
    notice(`Datei zusammengefuehrt: ${state.entries.length - before} neue Messwerte, ${added.count} neue Anhaenge.`);
  } catch (error) { notice(`Import fehlgeschlagen: ${error.message}`, true); }
  finally { busy = false; controls(); }
});
window.addEventListener('storage', (event) => {
  if (event.key !== DATA_KEY || blocked) return;
  try {
    const combined = data.merge(state, readDisk());
    if (JSON.stringify(combined) !== JSON.stringify(readDisk())) localStorage.setItem(DATA_KEY, JSON.stringify(combined));
    state = combined;
    render();
  } catch (error) { blocked = true; controls(); notice(`Speicherkonflikt: ${error.message} Bitte vorhandene Daten sichern.`, true); }
});
function network() { byId('network').textContent = navigator.onLine ? 'Lokal bereit' : 'Offline'; }
window.addEventListener('online', network);
window.addEventListener('offline', network);
network();
async function refreshAttachmentCounts() {
  try {
    const counts = new Map();
    for (const item of await attachments.listAll()) counts.set(item.entryId, (counts.get(item.entryId) || 0) + 1);
    attachmentCounts = counts;
    render();
  } catch (error) {
    notice(`Lokaler Anhangspeicher nicht verfuegbar: ${error.message}`, true);
  }
}

async function renderAttachmentDialog() {
  const entry = state.entries.find((item) => item.id === currentEntryId);
  if (!entry) return;
  byId('attachment-entry-title').textContent = entry.title;
  const list = byId('attachment-list');
  const records = await attachments.listForEntry(currentEntryId);
  if (!records.length) {
    const empty = document.createElement('li');
    empty.className = 'attachment-empty';
    empty.textContent = 'Noch keine Dateien angehaengt.';
    list.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const record of records) {
    const item = document.createElement('li');
    const details = document.createElement('span');
    const size = record.size < 1024 ? `${record.size} B` : `${(record.size / 1024).toLocaleString('de', { maximumFractionDigits: 0 })} KB`;
    details.textContent = `${record.name} (${size})`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = record.type.startsWith('image/') || record.type === 'application/pdf' ? 'O\u00f6ffnen' : 'Herunterladen';
    open.addEventListener('click', async () => {
      const stored = await attachments.get(record.id);
      if (!stored?.blob) { notice('Datei fehlt im lokalen Speicher.', true); return; }
      const url = URL.createObjectURL(stored.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      if (record.type.startsWith('image/') || record.type === 'application/pdf') {
        anchor.target = '_blank';
        anchor.rel = 'noopener';
      } else anchor.download = record.name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    item.append(details, open);
    fragment.append(item);
  }
  list.replaceChildren(fragment);
}

byId('records').addEventListener('click', async (event) => {
  const button = event.target.closest('.attachment-trigger');
  if (!button) return;
  currentEntryId = button.dataset.entryId;
  try {
    await renderAttachmentDialog();
    byId('attachment-dialog').showModal();
    byId('attachment-files').value = '';
    controls();
  } catch (error) { notice(`Anhaenge konnten nicht geladen werden: ${error.message}`, true); }
});
byId('attachment-close').addEventListener('click', () => byId('attachment-dialog').close());
byId('attachment-files').addEventListener('change', controls);
byId('attachment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = Array.from(byId('attachment-files').files);
  if (!currentEntryId || !files.length || busy) return;
  busy = true;
  controls();
  try {
    const added = await attachments.addFiles(currentEntryId, files);
    byId('attachment-files').value = '';
    await refreshAttachmentCounts();
    await renderAttachmentDialog();
    notice(`${added.length} ${added.length === 1 ? 'Anhang' : 'Anhaenge'} lokal gespeichert.`);
  } catch (error) { notice(`Anhaenge nicht gespeichert: ${error.message}`, true); }
  finally { busy = false; controls(); }
});
refreshAttachmentCounts();
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}