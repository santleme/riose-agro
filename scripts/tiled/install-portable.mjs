import {chmod,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const dir = path.join(homedir(), '.local/share/riose-tools/tiled-1.12.2');
const appImage = path.join(dir, 'Tiled-1.12.2_Linux_x86_64.AppImage');
const url = 'https://github.com/mapeditor/tiled/releases/download/v1.12.2/Tiled-1.12.2_Linux_x86_64.AppImage';
await mkdir(dir, {recursive: true});
const response = await fetch(url);
if (!response.ok) throw new Error(`Tiled download failed: HTTP ${response.status}`);
await writeFile(appImage, Buffer.from(await response.arrayBuffer()));
await chmod(appImage, 0o755);
const result = spawnSync(appImage, ['--appimage-extract'], {cwd: dir, encoding: 'utf8', stdio: 'inherit'});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`AppImage extraction failed with status ${result.status}`);
process.stdout.write(`Tiled 1.12.2 extracted to ${dir}/squashfs-root/AppRun\n`);
