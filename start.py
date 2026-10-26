"""Start the local family archive on Windows, macOS or Linux."""
import hashlib
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parent

def main():
    if sys.version_info < (3, 12):
        raise SystemExit('Installér Python 3.12 eller nyere fra python.org.')
    os.chdir(ROOT)
    venv = ROOT / '.venv'
    python = venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.exists():
        subprocess.run([sys.executable, '-m', 'venv', str(venv)], check=True)
    requirements = ROOT / 'requirements.txt'
    fingerprint = hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker = venv / '.archive-requirements'
    if not marker.exists() or marker.read_text() != fingerprint:
        subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(requirements)], check=True)
        marker.write_text(fingerprint)
    env = os.environ.copy()
    env['COOKIE_SECURE'] = '0'  # Local HTTP only; production keeps secure cookies.
    database = Path(env.get('ARCHIVE_DATA', str(ROOT / 'data'))) / 'archive.sqlite'
    setup = True
    if database.exists():
        with sqlite3.connect(database) as connection:
            exists = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
            setup = not exists or not connection.execute('SELECT 1 FROM users LIMIT 1').fetchone()
    if setup:
        env['SETUP_TOKEN'] = secrets.token_urlsafe(32)
        print('\nDin opsætningsnøgle (bruges kun første gang):\n' + env['SETUP_TOKEN'], flush=True)
    else:
        env.pop('SETUP_TOKEN', None)
    print('\nÅbn http://127.0.0.1:8000 i din browser.\nStop med Ctrl+C.\n', flush=True)
    subprocess.run([str(python), '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000'], env=env, check=True)

if __name__ == '__main__':
    try:
        main()
    except (subprocess.CalledProcessError, OSError) as error:
        raise SystemExit(f'Kunne ikke starte: {error}')
