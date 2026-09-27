import assert from 'node:assert/strict';
import test from 'node:test';
import { localRequestAllowed } from './tracking-service-plugin.mjs';

const request = (headers = {}, remoteAddress = '127.0.0.1') => ({
  socket: { remoteAddress },
  headers: { host: '127.0.0.1:5173', ...headers },
});

test('local dashboard requests are allowed', () => {
  assert.equal(
    localRequestAllowed(
      request({
        origin: 'http://127.0.0.1:5173',
        'sec-fetch-site': 'same-origin',
      })
    ),
    true
  );
  assert.equal(localRequestAllowed(request()), true);
  assert.equal(
    localRequestAllowed(
      request({ host: '[::1]:5173', origin: 'http://[::1]:5173' }, '::1')
    ),
    true
  );
});

test('other sites, LAN clients, and rebinding hosts cannot control the service', () => {
  for (const headers of [
    { origin: 'https://example.com' },
    { origin: 'http://localhost:1234' },
    { host: 'localhost.example.com:5173' },
    { host: '192.168.0.100:5173' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ])
    assert.equal(localRequestAllowed(request(headers)), false);
  assert.equal(localRequestAllowed(request({}, '192.168.0.101')), false);
});
