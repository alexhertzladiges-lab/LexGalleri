import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connection, plan } from '../scripts/sftp-plan.mjs';
const env = { SFTP_HOST: 'sftp.example.test', SFTP_USERNAME: 'lex-test', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };
test('only six code files are staged before replacement; no credentials/config/data uploaded', () => {
  const lines = plan(env).trim().split('\n');
  const put = lines.filter(l => l.startsWith('put '));
  assert.equal(put.length, 6);
  assert.deepEqual(put.map(l => l.split('"')[1]), ['private/schema.sql','private/app.php','public/static/style.css','public/static/app.js','public/.htaccess','public/index.php']);
  assert.equal(lines.filter(l => l.startsWith('rename ')).length, 6);
  assert(lines.findIndex(l => l.startsWith('rename ')) > lines.findLastIndex(l => l.startsWith('put ')));
  assert(!/config\/|config\.php|originals\/|previews\/|thumbnails\/|sessions\/|^rm |^rmdir |^!/m.test(lines.join('\n')));
  assert.equal(lines.filter(l => l.startsWith('chmod 600 ')).length, 2);
  assert.equal(lines.filter(l => l.startsWith('chmod 644 ')).length, 4);
});
test('remote paths are isolated; chroot paths can be explicitly configured', () => {
  assert(plan({ ...env, SFTP_PUBLIC_PATH: '/public_html/LexGalleri', SFTP_PRIVATE_PATH: '/lexgalleri-private' }).includes('/lexgalleri-private/app.php'));
  assert.throws(() => plan({ ...env, SFTP_PUBLIC_PATH: '/home/lexandkk/public_html/nested/LexGalleri', SFTP_PRIVATE_PATH: '/home/lexandkk/public_html/private' }));
  for (const path of ['/home/lexandkk/public_html/private','/home/lexandkk/public_html/LexGalleri/private','/','/tmp/../bad','/bad\nput secret']) assert.throws(() => plan({ ...env, SFTP_PRIVATE_PATH: path }));
});
test('rejects option/command injection and invalid connection details', () => {
  assert.equal(connection(env).port, '22');
  for (const change of [{ SFTP_HOST: '-oProxyCommand=bad' }, { SFTP_USERNAME: 'user\n!cmd' }, { SFTP_PORT: '0' }, { SFTP_PORT: '022' }, { SFTP_PORT: '65536' }, { SFTP_PORT: '-oFoo' }, { GITHUB_SHA: 'main' }, { GITHUB_RUN_ID: 'x' }]) assert.throws(() => plan({ ...env, ...change }));
});
