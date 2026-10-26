import os,sqlite3,secrets,hashlib,hmac,json,zipfile,io,re,time
from pathlib import Path
from datetime import datetime,timezone
from contextlib import contextmanager
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import FileResponse,JSONResponse
from PIL import Image,ImageOps,ExifTags

ROOT=Path(__file__).parent
DATA=Path(os.getenv('ARCHIVE_DATA',str(ROOT/'data')))
DATA.mkdir(parents=True,exist_ok=True)
(DATA/'photos').mkdir(exist_ok=True)
app=FastAPI(title='Familiearkiv')
@contextmanager
def db():
 c=sqlite3.connect(DATA/'archive.sqlite'); c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
 try: yield c;c.commit()
 finally:c.close()
with db() as c:
 c.executescript('''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires REAL);
 CREATE TABLE IF NOT EXISTS galleries(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS grants(gallery_id TEXT REFERENCES galleries(id),user_id TEXT REFERENCES users(id),upload INTEGER DEFAULT 0,download INTEGER DEFAULT 0,gps INTEGER DEFAULT 0,PRIMARY KEY(gallery_id,user_id));
 CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL,gallery_id TEXT REFERENCES galleries(id),upload INTEGER,download INTEGER,gps INTEGER,expires REAL);
 CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,gallery_id TEXT REFERENCES galleries(id),title TEXT,filename TEXT,mime TEXT,uploader TEXT REFERENCES users(id),uploaded TEXT,taken TEXT,precision TEXT,place TEXT,lat REAL,lon REAL,digest TEXT);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE IF NOT EXISTS themes(id TEXT PRIMARY KEY,document TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS favorites(photo_id TEXT REFERENCES photos(id),user_id TEXT REFERENCES users(id),PRIMARY KEY(photo_id,user_id));''')

def fail(code,msg):raise HTTPException(code,msg)
def password(p,salt=None):
 salt=salt or secrets.token_hex(16)
 return salt+':'+hashlib.scrypt(p.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def check(p,stored):return hmac.compare_digest(password(p,stored.split(':')[0]),stored)
def user(r):
 token=r.cookies.get('session','')
 with db() as c:u=c.execute('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
 if not u:fail(401,'Log ind for at fortsætte')
 return dict(u)
def admin(r):
 u=user(r)
 if not u['admin']:fail(403,'Kun administrator')
 return u
def access(r,g,permission=None):
 u=user(r)
 with db() as c:
  if not c.execute('SELECT id FROM galleries WHERE id=?',(g,)).fetchone():fail(404,'Galleriet findes ikke')
  a=c.execute('SELECT * FROM grants WHERE gallery_id=? AND user_id=?',(g,u['id'])).fetchone()
 if not u['admin'] and (not a or (permission and not a[permission])):fail(403,'Du har ikke adgang')
 return u
def public(u):return {k:u[k] for k in ('id','email','name','admin')}
def now():return datetime.now(timezone.utc).isoformat()
def login_response(u):
 token=secrets.token_urlsafe(32)
 with db() as c:c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),u['id'],time.time()+86400*7))
 res=JSONResponse(public(u));res.set_cookie('session',token,httponly=True,samesite='strict',secure=os.getenv('COOKIE_SECURE','1')=='1',max_age=86400*7);return res
@app.middleware('http')
async def headers(r,call):
 if r.method not in ('GET','HEAD','OPTIONS'):
  origin=r.headers.get('origin')
  if origin and origin!=str(r.base_url).rstrip('/'):return JSONResponse({'detail':'Ugyldig origin'},403)
  if r.headers.get('sec-fetch-site')=='cross-site':return JSONResponse({'detail':'Ugyldig forespørgsel'},403)
 res=await call(r)
 res.headers['X-Content-Type-Options']='nosniff';res.headers['Referrer-Policy']='no-referrer';res.headers['X-Frame-Options']='DENY'
 res.headers['Content-Security-Policy']="default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
 if r.url.path.startswith('/api'):res.headers['Cache-Control']='no-store'
 return res
@app.get('/')
def index():return FileResponse(ROOT/'static/index.html')
@app.get('/static/{name}')
def static(name:str):
 if name not in ('app.js','style.css'):fail(404,'Ikke fundet')
 return FileResponse(ROOT/'static'/name)
@app.get('/api/status')
def status():
 with db() as c:return {'setup':not bool(c.execute('SELECT 1 FROM users LIMIT 1').fetchone())}
@app.post('/api/setup')
async def setup(r:Request):
 b=await r.json()
 if not os.getenv('SETUP_TOKEN') or not hmac.compare_digest(str(b.get('token','')),os.environ['SETUP_TOKEN']):fail(403,'Ugyldig opsætningsnøgle')
 if len(b.get('password',''))<12:fail(400,'Brug mindst 12 tegn i adgangskoden')
 with db() as c:
  c.execute('BEGIN IMMEDIATE')
  if c.execute('SELECT 1 FROM users').fetchone():fail(409,'Allerede opsat')
  u={'id':secrets.token_hex(16),'email':b['email'].strip().lower(),'name':b['name'][:100],'admin':1}
  c.execute('INSERT INTO users VALUES(?,?,?,?,1)',(u['id'],u['email'],u['name'],password(b['password'])))
 return login_response(u)
# Bounded in-process login throttling; production should also rate-limit at proxy.
ATTEMPTS={}
@app.post('/api/login')
async def login(r:Request):
 b=await r.json();key=(r.client.host,b.get('email','').strip().lower());t=time.time()
 if len(ATTEMPTS)>10000:ATTEMPTS.clear()
 hits=[x for x in ATTEMPTS.get(key,[]) if x>t-900]
 if len(hits)>=10:fail(429,'Prøv igen om 15 minutter')
 ATTEMPTS[key]=hits+[t]
 with db() as c:u=c.execute('SELECT * FROM users WHERE email=?',(key[1],)).fetchone()
 if not u or not check(b.get('password',''),u['password']):fail(401,'Forkert e-mail eller adgangskode')
 ATTEMPTS.pop(key,None);return login_response(dict(u))
@app.post('/api/logout')
def logout(r:Request):
 with db() as c:c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(r.cookies.get('session','').encode()).hexdigest(),))
 res=JSONResponse({'ok':True});res.delete_cookie('session');return res
@app.get('/api/me')
def me(r:Request):return public(user(r))
@app.get('/api/galleries')
def galleries(r:Request):
 u=user(r)
 with db() as c:
  rows=c.execute('SELECT g.*,(SELECT count(*) FROM photos p WHERE p.gallery_id=g.id) count,(SELECT id FROM photos p WHERE p.gallery_id=g.id ORDER BY uploaded DESC LIMIT 1) cover FROM galleries g WHERE ?=1 OR EXISTS(SELECT 1 FROM grants a WHERE a.gallery_id=g.id AND a.user_id=?) ORDER BY created DESC',(u['admin'],u['id'])).fetchall()
 return [dict(x) for x in rows]
@app.post('/api/galleries')
async def create_gallery(r:Request):
 admin(r);b=await r.json();name=str(b.get('name','')).strip()[:100]
 if not name:fail(400,'Navn mangler')
 g=secrets.token_hex(16)
 with db() as c:c.execute('INSERT INTO galleries VALUES(?,?,?,?)',(g,name,str(b.get('description',''))[:1000],now()))
 return {'id':g}
@app.get('/api/galleries/{g}/photos')
def photos(g:str,r:Request):
 u=access(r,g)
 with db() as c:
  a=c.execute('SELECT * FROM grants WHERE gallery_id=? AND user_id=?',(g,u['id'])).fetchone()
  rows=c.execute('SELECT p.*,u.name uploader_name,EXISTS(SELECT 1 FROM favorites f WHERE f.photo_id=p.id AND f.user_id=?) favorite FROM photos p JOIN users u ON p.uploader=u.id WHERE gallery_id=? ORDER BY COALESCE(NULLIF(taken,\'\'),uploaded) DESC',(u['id'],g)).fetchall()
  result=[]
  for row in rows:
   p=dict(row);p.pop('digest');p.pop('filename')
   if not u['admin'] and not a['gps']:p['lat']=p['lon']=None
   result.append(p)
 return {'photos':result,'permissions':{'upload':bool(u['admin'] or a['upload']),'download':bool(u['admin'] or a['download']),'gps':bool(u['admin'] or a['gps'])}}
@app.post('/api/galleries/{g}/photos')
async def upload(g:str,r:Request):
 u=access(r,g,'upload');form=await r.form();f=form.get('file')
 if not f or not hasattr(f,'read'):fail(400,'Vælg et billede')
 raw=await f.read(25*1024*1024+1)
 await f.close()
 if len(raw)>25*1024*1024:fail(413,'Maks. 25 MB pr. foto')
 digest=hashlib.sha256(raw).hexdigest()
 with db() as c:
  if c.execute('SELECT id FROM photos WHERE gallery_id=? AND digest=?',(g,digest)).fetchone():fail(409,'Billedet findes allerede i galleriet')
 pid=secrets.token_hex(16);taken='';lat=lon=None
 try:
  Image.MAX_IMAGE_PIXELS=40_000_000
  im=Image.open(io.BytesIO(raw))
  if im.format not in ('JPEG','PNG','WEBP'):fail(400,'Brug JPEG, PNG eller WebP')
  fmt=im.format;ex=im.getexif();taken=str(ex.get(36867,''))
  try:taken=datetime.strptime(taken,'%Y:%m:%d %H:%M:%S').isoformat()
  except ValueError:taken=''
  try:
   gps=ex.get_ifd(34853)
   def coord(v):return float(v[0])+float(v[1])/60+float(v[2])/3600
   lat=coord(gps[2])*(-1 if gps[1]=='S' else 1);lon=coord(gps[4])*(-1 if gps[3]=='W' else 1)
  except (KeyError,TypeError,ValueError,ZeroDivisionError):pass
  im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((1800,1800));im.save(DATA/'photos'/f'{pid}-view.jpg',quality=88)
  im.thumbnail((600,600));im.save(DATA/'photos'/f'{pid}-thumb.jpg',quality=80)
 except HTTPException:raise
 except Exception:fail(400,'Billedet kunne ikke læses, eller er for stort')
 (DATA/'photos'/f'{pid}-original').write_bytes(raw)
 mime={'JPEG':'image/jpeg','PNG':'image/png','WEBP':'image/webp'}[fmt]
 with db() as c:c.execute('INSERT INTO photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,g,Path(f.filename or 'Foto').stem[:200],f.filename or 'foto',mime,u['id'],now(),taken,'exact' if taken else 'unknown','',lat,lon,digest))
 return {'id':pid}
def photo_access(pid,r,permission=None):
 with db() as c:p=c.execute('SELECT * FROM photos WHERE id=?',(pid,)).fetchone()
 if not p:fail(404,'Foto findes ikke')
 access(r,p['gallery_id'],permission);return p
@app.get('/api/photos/{pid}/image')
def image(pid:str,r:Request,size:str='thumb'):
 if size not in ('thumb','view','original'):fail(400,'Ugyldig størrelse')
 p=photo_access(pid,r,'download' if size=='original' else None)
 # Originals contain EXIF GPS, so original download also requires GPS permission.
 if size=='original':access(r,p['gallery_id'],'gps')
 path=DATA/'photos'/(f'{pid}-original' if size=='original' else f'{pid}-{size}.jpg')
 return FileResponse(path,media_type=p['mime'] if size=='original' else 'image/jpeg',filename=p['filename'] if size=='original' else None,headers={'Cache-Control':'private, no-store'})
@app.patch('/api/photos/{pid}')
async def edit(pid:str,r:Request):
 admin(r);photo_access(pid,r);b=await r.json();precision=b.get('precision','unknown');taken=str(b.get('taken',''))
 patterns={'exact':r'\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?','day':r'\d{4}-\d\d-\d\d','month':r'\d{4}-\d\d','year':r'\d{4}','circa':r'\d{4}','unknown':r''}
 if precision not in patterns or not re.fullmatch(patterns[precision],taken):fail(400,'Dato passer ikke til præcisionen')
 if precision in ('year','circa') and not 1 <= int(taken) <= 9999:fail(400,'Ugyldigt år')
 if precision not in ('unknown','year','circa'):
  try:datetime.fromisoformat(taken+('-01' if precision=='month' else ''))
  except ValueError:fail(400,'Ugyldig dato')
 lat=b.get('lat');lon=b.get('lon')
 if (lat is None)!=(lon is None):fail(400,'Angiv begge koordinater')
 if lat is not None:
  try:lat=float(lat);lon=float(lon)
  except (TypeError,ValueError):fail(400,'Ugyldige koordinater')
  if not -90<=lat<=90 or not -180<=lon<=180:fail(400,'Ugyldige koordinater')
 with db() as c:c.execute('UPDATE photos SET title=?,taken=?,precision=?,place=?,lat=?,lon=? WHERE id=?',(str(b.get('title',''))[:200],taken,precision,str(b.get('place',''))[:200],lat,lon,pid))
 return {'ok':True}
@app.post('/api/photos/{pid}/favorite')
def favorite(pid:str,r:Request):
 p=photo_access(pid,r);u=user(r)
 with db() as c:
  if c.execute('SELECT 1 FROM favorites WHERE photo_id=? AND user_id=?',(pid,u['id'])).fetchone():c.execute('DELETE FROM favorites WHERE photo_id=? AND user_id=?',(pid,u['id']))
  else:c.execute('INSERT INTO favorites VALUES(?,?)',(pid,u['id']))
 return {'ok':True}
@app.get('/api/admin/users')
def users(r:Request):
 admin(r)
 with db() as c:return {'users':[dict(x) for x in c.execute('SELECT id,email,name,admin FROM users')],'grants':[dict(x) for x in c.execute('SELECT * FROM grants')]}
@app.put('/api/admin/grants')
async def grants(r:Request):
 admin(r);b=await r.json()
 with db() as c:
  if not c.execute('SELECT 1 FROM galleries WHERE id=?',(b.get('gallery_id'),)).fetchone():fail(404,'Galleriet findes ikke')
  if not c.execute('SELECT 1 FROM users WHERE id=?',(b.get('user_id'),)).fetchone():fail(404,'Brugeren findes ikke')
  if b.get('view'):c.execute('INSERT OR REPLACE INTO grants VALUES(?,?,?,?,?)',(b['gallery_id'],b['user_id'],int(bool(b.get('upload'))),int(bool(b.get('download'))),int(bool(b.get('gps')))))
  else:c.execute('DELETE FROM grants WHERE gallery_id=? AND user_id=?',(b['gallery_id'],b['user_id']))
 return {'ok':True}
@app.post('/api/admin/invitations')
async def invite(r:Request):
 admin(r);b=await r.json();token=secrets.token_urlsafe(32)
 with db() as c:
  if not c.execute('SELECT 1 FROM galleries WHERE id=?',(b['gallery_id'],)).fetchone():fail(400,'Vælg et galleri')
  c.execute('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),b['email'].strip().lower(),b['name'][:100],b['gallery_id'],int(bool(b.get('upload'))),int(bool(b.get('download'))),int(bool(b.get('gps'))),time.time()+86400*7))
 return {'path':'/?invite='+token,'expires_days':7}
@app.post('/api/accept')
async def accept(r:Request):
 b=await r.json()
 if len(b.get('password',''))<12:fail(400,'Brug mindst 12 tegn')
 with db() as c:
  c.execute('BEGIN IMMEDIATE');inv=c.execute('SELECT * FROM invitations WHERE token=? AND expires>?',(hashlib.sha256(b.get('token','').encode()).hexdigest(),time.time())).fetchone()
  if not inv:fail(400,'Invitationen er udløbet eller brugt')
  u=c.execute('SELECT * FROM users WHERE email=?',(inv['email'],)).fetchone()
  if u:
   if not check(b['password'],u['password']):fail(401,'Brug din eksisterende adgangskode')
   u=dict(u)
  else:
   u={'id':secrets.token_hex(16),'email':inv['email'],'name':inv['name'],'admin':0}
   c.execute('INSERT INTO users VALUES(?,?,?,?,0)',(u['id'],u['email'],u['name'],password(b['password'])))
  c.execute('INSERT OR REPLACE INTO grants VALUES(?,?,?,?,?)',(inv['gallery_id'],u['id'],inv['upload'],inv['download'],inv['gps']))
  c.execute('DELETE FROM invitations WHERE token=?',(inv['token'],))
 return login_response(u)
DEFAULT={'version':1,'name':'Nordisk','colors':{'background':'#f7f6f2','surface':'#ffffff','text':'#263b34','accent':'#416c57'},'font':'sans','radius':16,'density':'comfortable'}
def validate_theme(t):
 if not isinstance(t,dict) or t.get('version')!=1:fail(400,'Designpakken skal have version 1')
 if not isinstance(t.get('name'),str) or not 1<=len(t['name'])<=60:fail(400,'Ugyldigt temanavn')
 colors=t.get('colors',{})
 if set(colors)!={'background','surface','text','accent'} or any(not isinstance(v,str) or not re.fullmatch('#[0-9a-fA-F]{6}',v) for v in colors.values()):fail(400,'Farver skal være #RRGGBB')
 if t.get('font') not in ('sans','serif') or type(t.get('radius')) is not int or not 0<=t['radius']<=32 or t.get('density') not in ('compact','comfortable'):fail(400,'Ugyldige layoutvalg')
 return {k:t[k] for k in DEFAULT}
@app.get('/api/theme')
def theme(r:Request):
 user(r)
 with db() as c:
  row=c.execute("SELECT value FROM settings WHERE key='theme'").fetchone()
 return json.loads(row[0]) if row else DEFAULT
@app.get('/api/admin/themes')
def themes(r:Request):
 admin(r)
 with db() as c:return [{'id':'default','theme':DEFAULT}]+[{'id':x['id'],'theme':json.loads(x['document'])} for x in c.execute('SELECT * FROM themes')]
@app.post('/api/admin/themes')
async def install_theme(r:Request):
 admin(r);form=await r.form();f=form.get('file')
 if not f or not hasattr(f,'read'):fail(400,'Vælg en designpakke')
 raw=await f.read(256001)
 await f.close()
 if len(raw)>256000:fail(413,'Designpakken er for stor')
 try:
  if str(f.filename).endswith('.zip'):
   with zipfile.ZipFile(io.BytesIO(raw)) as z:
    if len(z.infolist())!=1 or z.namelist()!=['theme.json'] or z.getinfo('theme.json').file_size>16000:fail(400,'ZIP skal kun indeholde theme.json, højst 16 KB')
    raw=z.read('theme.json')
  t=validate_theme(json.loads(raw))
 except HTTPException:raise
 except Exception:fail(400,'Ugyldig designpakke')
 tid=secrets.token_hex(16)
 with db() as c:c.execute('INSERT INTO themes VALUES(?,?)',(tid,json.dumps(t)))
 return {'id':tid,'theme':t}
@app.post('/api/admin/themes/{tid}/activate')
def activate(tid:str,r:Request):
 admin(r)
 with db() as c:
  row=c.execute('SELECT document FROM themes WHERE id=?',(tid,)).fetchone()
  if tid!='default' and not row:fail(404,'Tema findes ikke')
  c.execute("INSERT OR REPLACE INTO settings VALUES('theme',?)",(json.dumps(DEFAULT) if tid=='default' else row[0],))
 return {'ok':True}
