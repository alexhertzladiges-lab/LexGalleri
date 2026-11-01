"""Build an allowlisted upgrade package, without config, sessions or media."""
from pathlib import Path
import hashlib
import shutil
import sys

root = Path(__file__).resolve().parents[1]
if sys.argv[1:] not in ([], ['--video-thumbnails']):
    raise SystemExit('Unknown package option')
thumbnails = sys.argv[1:] == ['--video-thumbnails']
out = root / 'dist' / ('lexgalleri-video-thumbnails' if thumbnails else 'lexgalleri-telefon-mp4')
if out.exists():
    shutil.rmtree(out)
files = {str(p.relative_to(root)): str(p.relative_to(root))
         for p in (root / 'public').rglob('*') if p.is_file()}
# Explicitly reject accidental additions to the public deployment surface.
expected = {'.htaccess', 'index.php', 'manifest.webmanifest', 'service-worker.js',
            'static/app.js', 'static/style.css', 'static/pwa.js', 'static/qrcode.js',
            'static/icon.svg', 'static/icon-192.png', 'static/icon-512.png',
            'static/apple-touch-icon.png'}
assert set(k.removeprefix('public/') for k in files) == expected
for name in (('app.php',) if thumbnails else ('app.php', 'security.php', 'lychee-import.php')):
    files['private/' + name] = 'private/' + name
if not thumbnails:
    files['sql/007_reusable_phone_invitations.sql'] = 'private/migrations/007_reusable_phone_invitations.sql'
files['INSTALLER.md'] = ('installation/video-thumbnails/INSTALLER.md' if thumbnails else 'installation/telefon-mp4/INSTALLER.md')
sums = []
for target, source in sorted(files.items()):
    src, dst = root / source, out / target
    assert src.is_file() and not src.is_symlink()
    dst.parent.mkdir(parents=True, exist_ok=True)
    data = src.read_bytes()
    dst.write_bytes(data)
    sums.append(hashlib.sha256(data).hexdigest() + '  ' + target)
(out / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
print(f'PASS: {len(files)} allowlisted package files + SHA256SUMS; no config or private media')
