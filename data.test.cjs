const { test } = require('node:test');
const assert = require('node:assert/strict');
const { empty, validate, merge, parse } = require('./data.js');

function entry(number, overrides = {}) {
  return { id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, createdAt: '2026-10-19T10:00:00.000Z', title: 'Temperatur', value: 21.5, unit: 'C', location: 'Labor', author: 'Desktop', note: '', ...overrides };
}
const document = (...entries) => ({ ...empty(), entries });

test('Offline-Bestaende werden verlustfrei und ohne Duplikate zusammengefuehrt', () => {
  const desktop = document(entry(1), entry(2));
  const mobile = document(entry(1), entry(3));
  assert.deepEqual(merge(desktop, mobile), merge(mobile, desktop));
  assert.equal(merge(desktop, mobile).entries.length, 3);
  assert.deepEqual(merge(desktop, desktop), desktop);
});

test('Gleiche ID mit anderem Inhalt wird nicht still ueberschrieben', () => {
  assert.throws(() => merge(document(entry(1)), document(entry(1, { value: 99 }))), /Datenkonflikt/);
});

test('Ungueltige Dateien und doppelte IDs werden abgewiesen', () => {
  for (const invalid of [{}, { ...empty(), version: 2 }, document(entry(1), entry(1)), document(entry(1, { value: NaN })), document(entry(1, { title: ' ' })), document(entry(1, { createdAt: 'gestern' })), document(entry(1, { extra: true }))]) {
    assert.throws(() => validate(invalid));
  }
  assert.throws(() => parse('{ kaputt'));
});

test('Unicode, Nullwerte und negative Messwerte ueberstehen den Dateiaustausch', () => {
  const original = document(entry(1, { title: 'Pr\u00fcfung', value: 0 }), entry(2, { value: -12.3 }));
  assert.deepEqual(parse(JSON.stringify(original)), original);
});