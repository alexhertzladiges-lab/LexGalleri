"""Create a consistent database snapshot with the photo files it references."""
import os,sqlite3,sys,tempfile,zipfile
from pathlib import Path
root=Path(os.getenv('ARCHIVE_DATA',str(Path(__file__).parent/'data')))
if len(sys.argv)!=2:raise SystemExit('Brug: python backup.py /sikker/mappe/backup.zip')
if not (root/'archive.sqlite').is_file():raise SystemExit('Ingen database fundet')
out=Path(sys.argv[1])
if out.exists():raise SystemExit('Backupfilen findes allerede')
with tempfile.TemporaryDirectory() as temp:
 snapshot=Path(temp)/'archive.sqlite'
 with sqlite3.connect(root/'archive.sqlite') as source,sqlite3.connect(snapshot) as target:source.backup(target)
 with sqlite3.connect(snapshot) as c:ids=[r[0] for r in c.execute('SELECT id FROM photos')]
 with zipfile.ZipFile(out,'x',zipfile.ZIP_DEFLATED) as z:
  z.write(snapshot,'archive.sqlite')
  for pid in ids:
   for suffix in ('original','view.jpg','thumb.jpg'):
    p=root/'photos'/f'{pid}-{suffix}'
    z.write(p,'photos/'+p.name)
print(f'Backup oprettet: {out} ({len(ids)} billeder)')
