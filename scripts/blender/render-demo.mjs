import {access} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = path.join(homedir(), '.local/share/riose-tools/blender-4.0.2/usr/bin/blender');
let executable = process.env.BLENDER_BIN || bundle;
try { await access(executable); } catch { throw new Error(`Blender executable missing: ${executable}. Run npm run tools:install-blender or set BLENDER_BIN.`); }
const prefix = path.join(homedir(), '.local/share/riose-tools/blender-4.0.2');
const env = {...process.env,
  BLENDER_SYSTEM_DATAFILES: path.join(prefix,'usr/share/blender/datafiles'),
  BLENDER_SYSTEM_SCRIPTS: path.join(prefix,'usr/share/blender/scripts'),
  LD_LIBRARY_PATH: [path.join(prefix,'usr/lib/x86_64-linux-gnu'),path.join(prefix,'usr/lib'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const version = spawnSync(executable, ['--version'], {cwd: repo, env, encoding: 'utf8'});
if (version.status !== 0) throw new Error(`Could not inspect Blender version: ${version.stderr}`);
process.stdout.write(`Blender CLI: ${(version.stdout.match(/Blender \d+\.\d+\.\d+/) ?? ['version not reported'])[0]}\n`);
const result = spawnSync(executable,['--background','--factory-startup','--python',path.join(repo,'scripts/blender/create-rustic-water-trough.py')],{cwd:repo,env,encoding:'utf8',maxBuffer:16*1024*1024});
if (result.stdout) process.stdout.write(result.stdout.split('\n').slice(-15).join('\n'));
if (result.stderr) process.stderr.write(result.stderr.split('\n').slice(-8).join('\n'));
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Blender headless render failed with status ${result.status}`);
