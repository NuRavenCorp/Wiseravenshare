import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthToken, setAuthToken, clearAuthToken } from './authStorage.js';

const makeStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
};

test('persists the canonical token to both storage layers and keeps legacy keys in sync', () => {
  global.localStorage = makeStorage();
  global.sessionStorage = makeStorage();
  global.document = {
    cookie: ''
  };

  clearAuthToken();
  setAuthToken('persisted-token');

  assert.equal(getAuthToken(), 'persisted-token');
  assert.equal(global.localStorage.getItem('wr_auth_token'), 'persisted-token');
  assert.equal(global.sessionStorage.getItem('wr_auth_token'), 'persisted-token');
  assert.equal(global.localStorage.getItem('auth_token'), 'persisted-token');
  assert.equal(global.sessionStorage.getItem('auth_token'), 'persisted-token');
});

test('drops the auth token cleanly from every persisted location', () => {
  global.localStorage = makeStorage();
  global.sessionStorage = makeStorage();
  global.document = {
    cookie: 'wr_auth_token=stale-token; Path=/'
  };

  setAuthToken('keep-me');
  clearAuthToken();

  assert.equal(getAuthToken(), '');
  assert.equal(global.localStorage.getItem('wr_auth_token'), null);
  assert.equal(global.sessionStorage.getItem('wr_auth_token'), null);
  assert.equal(global.localStorage.getItem('auth_token'), null);
  assert.equal(global.sessionStorage.getItem('auth_token'), null);
});
