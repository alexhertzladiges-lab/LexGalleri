import unittest,tempfile,os,io,zipfile,json
from pathlib import Path
os.environ['ARCHIVE_DATA']=tempfile.mkdtemp()
os.environ['SETUP_TOKEN']='test-setup-token'
os.environ['COOKIE_SECURE']='0'
from fastapi.testclient import TestClient
from PIL import Image
from app import app,DEFAULT
class SecurityFlow(unittest.TestCase):
 def test_complete_flow(self):
  owner=TestClient(app);guest=TestClient(app);stranger=TestClient(app)
  self.assertEqual(owner.post('/api/setup',json={'token':'wrong'}).status_code,403)
  self.assertEqual(owner.post('/api/setup',json={'token':'test-setup-token','name':'Admin','email':'admin@example.com','password':'long-test-password'}).status_code,200)
  g=owner.post('/api/galleries',json={'name':'Sommer'}).json()['id']
  private=owner.post('/api/galleries',json={'name':'Kun admin'}).json()['id']
  im=Image.new('RGB',(200,100),'green');f=io.BytesIO();im.save(f,'JPEG');raw=f.getvalue()
  p=owner.post(f'/api/galleries/{g}/photos',files={'file':('test.jpg',raw,'image/jpeg')}).json()['id']
  self.assertEqual(owner.post(f'/api/galleries/{g}/photos',files={'file':('test.jpg',raw,'image/jpeg')}).status_code,409)
  self.assertEqual(owner.patch('/api/photos/'+p,json={'title':'Sommer','taken':'1984','precision':'circa','place':'Skagen','lat':57.72,'lon':10.58}).status_code,200)
  inv=owner.post('/api/admin/invitations',json={'email':'guest@example.com','name':'Gæst','gallery_id':g}).json()['path'].split('=')[1]
  self.assertEqual(guest.post('/api/accept',json={'token':inv,'password':'guest-long-password'}).status_code,200)
  self.assertEqual(guest.post('/api/accept',json={'token':inv,'password':'guest-long-password'}).status_code,400)
  self.assertEqual(len(guest.get('/api/galleries').json()),1)
  self.assertEqual(guest.get(f'/api/galleries/{private}/photos').status_code,403)
  self.assertEqual(stranger.get(f'/api/photos/{p}/image').status_code,401)
  self.assertEqual(guest.get(f'/api/photos/{p}/image').status_code,200)
  self.assertIsNone(guest.get(f'/api/galleries/{g}/photos').json()['photos'][0]['lat'])
  self.assertEqual(guest.get(f'/api/photos/{p}/image?size=original').status_code,403)
  self.assertEqual(guest.post(f'/api/galleries/{g}/photos',files={'file':('test.jpg',raw,'image/jpeg')}).status_code,403)
  self.assertEqual(guest.get('/api/admin/users').status_code,403)
  self.assertEqual(guest.patch('/api/photos/'+p,json={}).status_code,403)
  self.assertEqual(owner.post('/api/galleries',headers={'origin':'https://evil.example'},json={'name':'bad'}).status_code,403)
  uid=guest.get('/api/me').json()['id']
  owner.put('/api/admin/grants',json={'gallery_id':g,'user_id':uid,'view':True,'download':True})
  self.assertEqual(guest.get(f'/api/photos/{p}/image?size=original').status_code,403)
  owner.put('/api/admin/grants',json={'gallery_id':g,'user_id':uid,'view':True,'download':True,'gps':True})
  self.assertEqual(guest.get(f'/api/photos/{p}/image?size=original').status_code,200)
  self.assertEqual(guest.get(f'/api/galleries/{g}/photos').json()['photos'][0]['lat'],57.72)
  owner.put('/api/admin/grants',json={'gallery_id':g,'user_id':uid,'view':False})
  self.assertEqual(guest.get(f'/api/photos/{p}/image').status_code,403)
  evil={**DEFAULT,'colors':{**DEFAULT['colors'],'accent':'url(https://evil.example)'}}
  self.assertEqual(owner.post('/api/admin/themes',files={'file':('theme.json',json.dumps(evil))}).status_code,400)
  z=io.BytesIO()
  with zipfile.ZipFile(z,'w') as pack:pack.writestr('../theme.json',json.dumps(DEFAULT))
  self.assertEqual(owner.post('/api/admin/themes',files={'file':('theme.zip',z.getvalue())}).status_code,400)
  theme={**DEFAULT,'name':'Hav','colors':{**DEFAULT['colors'],'accent':'#123456'}}
  tid=owner.post('/api/admin/themes',files={'file':('theme.json',json.dumps(theme))}).json()['id']
  self.assertEqual(owner.post('/api/admin/themes/'+tid+'/activate').status_code,200)
  self.assertEqual(owner.get('/api/theme').json()['colors']['accent'],'#123456')
  self.assertEqual(owner.patch('/api/photos/'+p,json={'taken':'2026-13-99','precision':'day'}).status_code,400)
  for precision in ('year','circa'):
   self.assertEqual(owner.patch('/api/photos/'+p,json={'taken':'0000','precision':precision}).status_code,400)
   self.assertEqual(owner.patch('/api/photos/'+p,json={'taken':'1984','precision':precision}).status_code,200)
  self.assertEqual(owner.put('/api/admin/grants',json={'gallery_id':g,'user_id':'missing','view':True}).status_code,404)
  self.assertEqual(owner.put('/api/admin/grants',json={'gallery_id':'missing','user_id':uid,'view':True}).status_code,404)
  self.assertEqual(owner.post('/api/logout').status_code,200)
  self.assertEqual(owner.get('/api/me').status_code,401)
if __name__=='__main__':unittest.main()
