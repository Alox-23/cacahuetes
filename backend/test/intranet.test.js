import assert from 'node:assert/strict';
import test from 'node:test';
import { intranetUrls } from '../scripts/intranet.js';

test('anuncia la IP actual del evento antes que los adaptadores virtuales', () => {
  const ipv4 = address => ({ family: 'IPv4', internal: false, address });
  const interfaces = {
    VirtualBox: [ipv4('192.168.56.1')],
    WiFi: [{ family: 'IPv6', internal: false, address: 'fe80::1' }, ipv4('10.10.83.37')],
    Loopback: [{ ...ipv4('127.0.0.1'), internal: true }]
  };
  assert.deepEqual(intranetUrls(interfaces, 3005).map(entry => entry.url), [
    'http://10.10.83.37:3005', 'http://192.168.56.1:3005'
  ]);
  interfaces.WiFi = [ipv4('10.10.83.208')];
  assert.equal(intranetUrls(interfaces, 3005)[0].url, 'http://10.10.83.208:3005');
  delete interfaces.WiFi;
  assert.equal(intranetUrls(interfaces, 3005)[0].name, 'VirtualBox');
});
