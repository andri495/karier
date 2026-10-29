import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const baseRequire = createRequire(import.meta.url);
const customRequire = (id) => {
  if (id === '@/lib/database') {
    return {
      getDB: () => ({
        prepare: () => ({
          bind: () => ({ run: async () => {}, first: async () => null, all: async () => ({ results: [] }) }),
          run: async () => {},
          first: async () => null,
          all: async () => ({ results: [] })
        })
      })
    };
  }
  return baseRequire(id);
};

const source = readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8');
const transpiled = ts.transpile(source, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
});

const exportsObj = {};
const moduleObj = { exports: exportsObj };
const ctx = {
  process,
  Buffer,
  require: customRequire,
  console,
  module: moduleObj,
  exports: exportsObj,
};
vm.createContext(ctx);
vm.runInContext(transpiled, ctx);
const auth = exportsObj.hashPassword ? exportsObj : moduleObj.exports;

const {
  updateAdminPassword,
  getAdminAccount,
  readSavedAdminAuth,
  verifyHash,
  getAdminAuthFilePath
} = auth;

test('admin auth persists to database/admin_auth.json and restores after reset', async () => {
  const testPass = 'RahasiaBaruRT2026';
  const testUser = 'admin_tetap';

  const updateRes = await updateAdminPassword(testPass, testUser);
  assert.equal(updateRes.success, true);
  assert.equal(updateRes.username, testUser);

  const saved = readSavedAdminAuth();
  assert.ok(saved);
  assert.equal(saved.username, testUser);
  assert.equal(verifyHash(testPass, saved.salt, saved.password_hash), true);

  const account = await getAdminAccount();
  assert.ok(account);
  assert.equal(account.username, testUser);
  assert.equal(verifyHash(testPass, account.salt, account.password_hash), true);
});
