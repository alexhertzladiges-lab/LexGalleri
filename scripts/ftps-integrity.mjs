// Read only the public entry point before deployment and the twelve public
// source files afterwards. No private file, config, database or media path.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectionCommands, publicFiles } from './ftps-plan.mjs';

const approvedBootstrap='572214cfa5f8cd30dd119d5b2386e8b5bf305cb12dd4d1ea0f9c5518b8a8cf8a';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function localPath(value) {
  if(typeof value!=='string'||!value.startsWith('/')||!/^[a-zA-Z0-9_/. -]+$/.test(value)||value.split('/').includes('..'))throw Error('Ugyldig lokal kontrolsti');
  return value;
}
export function preflightPlan(env,destination) {
  const lines=connectionCommands(env);
  return [...lines,'get "index.php" -o "'+localPath(destination)+'"','bye'].join('\n')+'\n';
}
export function verifyBootstrap(file) {
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768||digest(readFileSync(file))!==approvedBootstrap)throw Error('Den offentlige FTP-rod kunne ikke bekræftes som den godkendte LexGalleri-installation. Afbrudt før filændringer.');
}
export function verificationPlan(env,directory) {
  const lines=connectionCommands(env);localPath(directory);
  return [...lines,...publicFiles.map(file=>'get "'+file+'" -o "'+join(directory,file)+'"'),'bye'].join('\n')+'\n';
}
export function verifyPublicFiles(directory,root=process.cwd()) {
  for(const file of publicFiles) {
    const downloaded=join(directory,file),stat=lstatSync(downloaded),source=join(root,'public',file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==lstatSync(source).size||digest(readFileSync(downloaded))!==digest(readFileSync(source)))throw Error('SHA-256-kontrollen fejlede for offentlig fil: '+file);
  }
  return publicFiles.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode,first,second]=process.argv.slice(2);
    if(mode==='preflight')writeFileSync(first,preflightPlan(process.env,second),{mode:0o600});
    else if(mode==='check-root'){verifyBootstrap(first);console.log('LexGalleris offentlige installationsrod er verificeret før filændringer.');}
    else if(mode==='verify-plan') {
      const plan=verificationPlan(process.env,second);
      for(const file of publicFiles)mkdirSync(dirname(join(second,file)),{recursive:true,mode:0o700});
      writeFileSync(first,plan,{mode:0o600});
    } else if(mode==='check-files')console.log(verifyPublicFiles(first)+' offentlige filer genlæst via FTPS; alle SHA-256-kontroller bestået.');
    else throw Error('Ukendt kontrolhandling');
  }catch(error){console.error(error.message);process.exit(1);}
}
