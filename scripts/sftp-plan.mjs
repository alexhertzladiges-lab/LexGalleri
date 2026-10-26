// Deployment tooling runs in GitHub Actions only; the webhotel needs PHP/MySQL only.
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function connection(env) {
  const host = env.SFTP_HOST || '';
  const user = env.SFTP_USERNAME || '';
  const port = env.SFTP_PORT || '22';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)) throw Error('SFTP_HOST mangler eller er ugyldig');
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(user)) throw Error('SFTP_USERNAME mangler eller er ugyldig');
  if (! /^[1-9]\d*$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('Ugyldig SFTP_PORT');
  return { host, user, port: String(Number(port)) };
}

const publicFiles = ['static/style.css', 'static/app.js', '.htaccess', 'index.php'];
const privateFiles = ['schema.sql', 'app.php'];
function remotePath(value) {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9_./-]+$/.test(value) || value === '/' || value.includes('//') || value.split('/').some(s => s === '.' || s === '..')) throw Error('Ugyldig SFTP-mappesti');
  return value.replace(/\/$/, '');
}
function inside(path, root) { return path === root || path.startsWith(root + '/'); }
const q = s => '"' + s + '"'; // Inputs are validated above; no shell or SFTP metacharacters.

export function plan(env, root = process.cwd()) {
  connection(env);
  const pub = remotePath(env.SFTP_PUBLIC_PATH || '/home/lexandkk/public_html/LexGalleri');
  const priv = remotePath(env.SFTP_PRIVATE_PATH || '/home/lexandkk/lexgalleri-private');
  const components = pub.split('/');
  const webRootIndex = components.indexOf('public_html');
  const webRoot = webRootIndex >= 0 ? components.slice(0, webRootIndex + 1).join('/') : pub.slice(0, pub.lastIndexOf('/'));
  if (priv.split('/').includes('public_html') || inside(priv, webRoot) || inside(pub, priv) || inside(priv, pub)) throw Error('Privatmappen skal ligge uden for webroden og separat fra appen');
  const revision = env.GITHUB_SHA || '';
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('GITHUB_SHA skal være en fuld commit-SHA');
  if (!/^[0-9]+$/.test(env.GITHUB_RUN_ID || '') || !/^[0-9]+$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw Error('Workflowets kørsels-id mangler');
  const tag = revision.slice(0, 12) + '-' + env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  const files = [
    ...privateFiles.map(f => ({ source: 'private/' + f, target: priv + '/' + f, mode: '600' })),
    ...publicFiles.map(f => ({ source: 'public/' + f, target: pub + '/' + f, mode: '644' })),
  ];
  for (const f of files) {
    const path = resolve(root, f.source);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('Kodefil mangler eller er et symlink: ' + f.source);
  }
  // Only the agreed app directories are created. No uploads to config or data directories.
  const lines = ['-mkdir ' + q(priv), 'chmod 700 ' + q(priv), '-mkdir ' + q(pub), 'chmod 755 ' + q(pub), '-mkdir ' + q(pub + '/static'), 'chmod 755 ' + q(pub + '/static')];
  for (const f of files) {
    const slash = f.target.lastIndexOf('/');
    f.staged = f.target.slice(0, slash + 1) + '.lexgalleri-' + tag + '-' + f.target.slice(slash + 1);
    lines.push('put ' + q(f.source) + ' ' + q(f.staged), 'chmod ' + f.mode + ' ' + q(f.staged));
  }
  // All six files must upload successfully before the first live file is replaced.
  // SFTP rename replaces each file atomically; it is not one transaction across the whole app.
  for (const f of files) lines.push('rename ' + q(f.staged) + ' ' + q(f.target));
  lines.push('bye');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.SFTP_PASSWORD) throw Error('SFTP_PASSWORD mangler');
    if (!process.env.SFTP_KNOWN_HOSTS?.trim()) throw Error('SFTP_KNOWN_HOSTS mangler (verificeret SSH-værtsnøgle)');
    if (!process.argv[2]) throw Error('Outputfil mangler');
    writeFileSync(process.argv[2], plan(process.env), { mode: 0o600 });
  } catch (e) { console.error(e.message); process.exit(1); }
}
