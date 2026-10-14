import {mkdir,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const base = path.join(homedir(), '.local/share/riose-tools/blender-4.0.2');
const downloadDir = path.join(base, 'packages');
const extractDir = path.join(base, 'root');
const packages = ['blender','blender-data','libfftw3-double3','libfftw3-single3','libembree4-4','libjemalloc2','libopencolorio2.1t64','libopenimageio2.4t64','libopenvdb10.0t64','libosdcpu3.5.0t64','libosdgpu3.5.0t64','libpotrace0','libspnav0','libdcmtk17t64','libpystring0','liblog4cplus-2.0.5t64'];
await mkdir(downloadDir,{recursive:true}); await mkdir(extractDir,{recursive:true});
const download = spawnSync('apt-get',['download',...packages],{cwd:downloadDir,encoding:'utf8',stdio:'inherit'});
if (download.error) throw download.error;
if (download.status !== 0) throw new Error('apt-get download failed; this helper currently targets Ubuntu 24.04 packages.');
for (const name of await readdir(downloadDir)) if (name.endsWith('.deb')) {
  const extraction = spawnSync('dpkg-deb',['-x',path.join(downloadDir,name),extractDir],{encoding:'utf8',stdio:'inherit'});
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error(`Failed to extract ${name}`);
}
process.stdout.write(`Blender 4.0.2 portable package extracted to ${extractDir}/usr/bin/blender\n`);
