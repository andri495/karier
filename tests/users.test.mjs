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
  SUPERADMIN_EMAIL,
  DEFAULT_SUPERADMIN_PASSWORD,
  authenticateUser,
  addUser,
  deleteUser,
  getUsersList,
  createSessionToken,
  verifySessionToken,
} = auth;

test('superadmin default account exists and authenticates', async () => {
  assert.equal(SUPERADMIN_EMAIL, 'superadmin@gmail.com');
  const user = await authenticateUser('superadmin@gmail.com', DEFAULT_SUPERADMIN_PASSWORD);
  assert.ok(user);
  assert.equal(user.email, 'superadmin@gmail.com');
  assert.equal(user.role, 'superadmin');
});

test('superadmin can add follower account and follower can authenticate', async () => {
  const followerEmail = 'bendahara.test@gmail.com';
  const followerPass = 'passwordBendahara123';
  const followerName = 'Budi Bendahara';

  // Tambah akun pengikut
  const created = await addUser({
    email: followerEmail,
    name: followerName,
    password: followerPass,
    role: 'admin',
  });

  assert.equal(created.email, followerEmail);
  assert.equal(created.role, 'admin');

  // Pengikut dapat login
  const logged = await authenticateUser(followerEmail, followerPass);
  assert.ok(logged);
  assert.equal(logged.email, followerEmail);
  assert.equal(logged.role, 'admin');

  // Token sesi mencatat role admin
  const token = createSessionToken(logged.name, logged.role, logged.email);
  const verified = verifySessionToken(token);
  assert.equal(verified.valid, true);
  assert.equal(verified.role, 'admin');
  assert.equal(verified.email, followerEmail);

  // Superadmin tidak boleh dihapus
  await assert.rejects(
    async () => {
      await deleteUser('superadmin@gmail.com');
    },
    /tidak boleh dihapus/
  );

  // Akun pengikut dapat dihapus
  const delRes = await deleteUser(followerEmail);
  assert.equal(delRes.success, true);
});
