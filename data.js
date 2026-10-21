(function (root) {
  'use strict';
  const MAX_BYTES = 900000;
  const fields = ['id', 'createdAt', 'title', 'value', 'unit', 'location', 'author', 'note'];

  function validate(document) {
    if (!document || document.format !== 'messwerte-v3' || document.version !== 1 || !Array.isArray(document.entries)) {
      throw new Error('Unbekanntes Dateiformat. Erwartet wird eine V3-Messwertdatei.');
    }
    if (document.entries.length > 5000) throw new Error('Maximal 5000 Eintraege pro Datenbestand.');
    const ids = new Set();
    const entries = document.entries.map((entry) => {
      if (!entry || Object.keys(entry).some((key) => !fields.includes(key)) || fields.some((key) => !(key in entry))) {
        throw new Error('Unvollstaendiger oder unbekannter Eintrag.');
      }
      for (const field of fields.filter((key) => key !== 'value')) {
        if (typeof entry[field] !== 'string' || entry[field].length > (field === 'note' ? 2000 : 255)) {
          throw new Error(`Ungueltiges Feld: ${field}.`);
        }
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id) || ids.has(entry.id)) {
        throw new Error('Ungueltige oder doppelte Eintrags-ID.');
      }
      if (!entry.title.trim() || !entry.author.trim() || !Number.isFinite(entry.value) || !/^\d{4}-\d{2}-\d{2}T/.test(entry.createdAt) || !Number.isFinite(Date.parse(entry.createdAt))) {
        throw new Error('Titel, Erfasser, Messwert oder Zeitpunkt ist ungueltig.');
      }
      ids.add(entry.id);
      return Object.fromEntries(fields.map((field) => [field, entry[field]]));
    });
    const result = { format: 'messwerte-v3', version: 1, entries };
    if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BYTES) throw new Error('Datei zu gross (maximal 900 KB). Bitte einen neuen Datenbestand beginnen.');
    return result;
  }

  function empty() {
    return { format: 'messwerte-v3', version: 1, entries: [] };
  }

  function merge(...documents) {
    const entries = new Map();
    for (const document of documents) {
      for (const entry of validate(document).entries) {
        const previous = entries.get(entry.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) {
          throw new Error(`Datenkonflikt fuer ID ${entry.id}. Keine Daten wurden ersetzt.`);
        }
        entries.set(entry.id, entry);
      }
    }
    return validate({ ...empty(), entries: [...entries.values()].sort((left, right) => left.id.localeCompare(right.id)) });
  }

  function parse(text) {
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Datei zu gross (maximal 900 KB).');
    return validate(JSON.parse(text));
  }

  const api = { empty, validate, merge, parse, MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MeasureData = api;
})(globalThis);