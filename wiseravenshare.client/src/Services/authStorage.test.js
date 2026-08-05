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

test('falls back to a cookie-backed auth token when localStorage is empty', () => {
  global.localStorage = makeStorage();
  global.sessionStorage = makeStorage();
  global.document = {
    cookie: ''
  };

  clearAuthToken();
  setAuthToken('cookie-token');

  assert.equal(getAuthToken(), 'cookie-token');
});
