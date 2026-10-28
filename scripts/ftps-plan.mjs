// Runs only on GitHub Actions. The webhotel needs PHP/MySQL, not Node.
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function connection(env) {
  const host = env.FTPS_HOST || '';
  const user = env.FTPS_USERNAME || '';
  const port = env.FTPS_PORT || '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)) throw Error('FTPS_HOST mangler eller er ugyldig');
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(user)) throw Error('FTPS_USERNAME mangler eller er ugyldig');
  if (!/^[1-9]\d*$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('FTPS_PORT mangler eller er ugyldig');
  return { host, user, port };
}

// Every destination is relative to the FTP account root. The owner restricts that
// account to /home/lexandkk/public_html/LexGalleri in the hosting control panel.
// There is no private-directory parameter, probe, directory traversal or upload.
// App metadata and icons activate before the scripts and entry point that use
// them. This is an explicit allowlist, never a recursive public-directory sync.
const publicFiles = [
  'static/icon.svg',
  'static/icon-192.png',
  'static/icon-512.png',
  'static/apple-touch-icon.png',
  'manifest.webmanifest',
  'service-worker.js',
  'static/pwa.js',
  'static/style.css',
  'static/qrcode.js',
  'static/app.js',
  '.htaccess',
  'index.php',
];
const q = s => '"' + s + '"';
export function plan(env, root = process.cwd(), diagnostic = false) {
  connection(env);
  const lines = [
    'set cmd:fail-exit true',
    'set ftp:ssl-allow true',
    'set ftp:ssl-force true',
    'set ftp:ssl-auth TLS',
    'set ftp:ssl-protect-data true',
    'set ftp:ssl-protect-list true',
    'set ssl:verify-certificate true',
    'set ssl:check-hostname true',
    'set net:max-retries 2',
    'set net:timeout 20',
    'cd "/"', 'pwd',
  ];
  // Read-only listing of the restricted public root verifies the TLS data channel.
  if (diagnostic) return [...lines, 'cls -1', 'bye'].join('\n') + '\n';
  const revision = env.GITHUB_SHA || '';
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('GITHUB_SHA skal være en fuld commit-SHA');
  if (!/^[0-9]+$/.test(env.GITHUB_RUN_ID || '') || !/^[0-9]+$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw Error('Workflowets kørsels-id mangler');
  const tag = revision.slice(0, 12) + '-' + env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  const files = publicFiles.map(f => ({ source: 'public/' + f, target: f }));
  for (const f of files) {
    const path = resolve(root, f.source);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('Kodefil mangler eller er et symlink: ' + f.source);
  }
  // Some FTP servers reject MKD for an existing directory even with lftp -p.
  // Reuse static when accessible; a failed creation must still stop the upload.
  lines.push('cd "static" || mkdir "static"', 'cd "/"', 'chmod 755 "static"');
  for (const f of files) {
    const slash = f.target.lastIndexOf('/');
    f.staged = f.target.slice(0, slash + 1) + '.lexgalleri-' + tag + '-' + f.target.slice(slash + 1);
    lines.push('put ' + q(f.source) + ' -o ' + q(f.staged), 'chmod 644 ' + q(f.staged));
  }
  // Stage every allowlisted public file before activation; no forced rename or deletion.
  for (const f of files) lines.push('mv ' + q(f.staged) + ' ' + q(f.target));
  lines.push('bye');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.FTPS_PASSWORD) throw Error('Secret FTPS_PASSWORD mangler i LexGalleri');
    if (!process.argv[2]) throw Error('Outputfil mangler');
    const diagnostic = process.argv[3] === '--diagnose';
    if (process.argv[3] && !diagnostic) throw Error('Ugyldig kørselsmåde');
    writeFileSync(process.argv[2], plan(process.env, process.cwd(), diagnostic), { mode: 0o600 });
  } catch (e) { console.error(e.message); process.exit(1); }
}
