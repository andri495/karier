import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('database/snapshot.json exists and has valid structure', () => {
  const snapshotPath = resolve(process.cwd(), 'database/snapshot.json');
  assert.equal(existsSync(snapshotPath), true);

  const raw = readFileSync(snapshotPath, 'utf8');
  const snapshot = JSON.parse(raw);

  assert.ok(Array.isArray(snapshot.residents));
  assert.ok(Array.isArray(snapshot.payments));
  assert.ok(Array.isArray(snapshot.cash_entries));
  assert.ok(Array.isArray(snapshot.loans));
  assert.ok(Array.isArray(snapshot.repayments));
  assert.ok(Array.isArray(snapshot.transfers));
});
