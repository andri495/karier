import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  hashPassword,
  verifyHash,
  createSessionToken,
  verifySessionToken,
  parseCookies
} = auth;

test('hashing dan verifikasi kata sandi dengan PBKDF2', () => {
  const salt = 'random-salt-12345';
  const pass = 'adminpassword123456';
  const hash = hashPassword(pass, salt);

  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 128);
  assert.equal(verifyHash(pass, salt, hash), true);
  assert.equal(verifyHash('passwordsalah', salt, hash), false);
  assert.equal(verifyHash(pass, 'salt-berbeda', hash), false);
});

test('pembuatan dan verifikasi token sesi bertandatangan HMAC', () => {
  const username = 'admin_rt';
  const token = createSessionToken(username);

  assert.equal(typeof token, 'string');
  const res = verifySessionToken(token);
  assert.equal(res.valid, true);
  assert.equal(res.username, username);

  // Token yang dimanipulasi harus ditolak
  const tampered = token.slice(0, -4) + 'abcd';
  assert.equal(verifySessionToken(tampered).valid, false);

  // Format acak harus ditolak
  assert.equal(verifySessionToken('bukan-token').valid, false);
});

test('parsing header cookies bekerja dengan benar', () => {
  const header = 'karier_session=abc123token; karier_user=admin; other=1';
  const cookies = parseCookies(header);

  assert.equal(cookies['karier_session'], 'abc123token');
  assert.equal(cookies['karier_user'], 'admin');
  assert.equal(cookies['other'], '1');
  assert.equal(Object.keys(parseCookies(null)).length, 0);
});
