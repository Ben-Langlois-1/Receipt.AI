"""Build-time source/license preparation; never imported by the application."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import tarfile
import urllib.request

root = Path(__file__).resolve().parent.parent
destination = root / 'build/appimage-sources'
destination.mkdir(parents=True, exist_ok=True)
licenses = root / 'resources/licenses'
for item in json.loads((root / 'scripts/appimage-sources.json').read_text()):
    target = destination / item['file']
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
        with urllib.request.urlopen(item['url'], timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise RuntimeError('Source checksum mismatch: ' + item['file'])
        target.write_bytes(data)
    if '.tar.' in item['file']:
        with tarfile.open(fileobj=io.BytesIO(target.read_bytes()), mode='r:*') as archive:
            for member in archive.getmembers():
                leaf = member.name.split('/')[-1]
                if member.isfile() and member.name.count('/') == 1 and leaf in ['LICENSE', 'LGPL2.txt']:
                    output = destination / (item['file'].split('.tar')[0] + '-' + leaf + '.txt')
                    output.write_bytes(archive.extractfile(member).read())
    print('Verified:', item['file'], flush=True)
for notice in destination.glob('*.txt'):
    shutil.copyfile(notice, licenses / ('AppImage-' + notice.name))
readme = '''AppImage runtime source and relinking materials

The default header is unmodified AppImage/type2-runtime 20251108, commit
dd6cebedcbddde9c82f89b011e8e1d40b6e43868, binary SHA-256
2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d.
Its MIT license and the musl, squashfuse, libfuse LGPL-2.1, zstd, zlib and
mimalloc notices accompany the application. The exact libfuse 3.15.0 source,
the runtime's mount.c patch and runtime build recipes are in this archive.
The checked-in upstream install-dependencies.sh pins libfuse and squashfuse.
The other permissive dependencies are obtained from Alpine 3.21 by the
upstream build recipe; no byte-identical rebuild is claimed for those packages.

For a modified libfuse, extract type2-runtime, replace/amend the fuse sources
used by scripts/common/install-dependencies.sh (and its source checksum),
retain the supplied upstream mount.c patch where applicable, then use the
upstream BUILD.md Docker instructions to rebuild runtime-x86_64.
Repackage Receipt.AI from its source checkout with:
  RECEIPTAI_APPIMAGE_RUNTIME=/absolute/path/runtime-x86_64 npm run package:linux
This changes the standalone mount runtime, not Receipt.AI's financial code.
Receipt.AI imposes no additional restriction on modifying/relinking LGPL code
or reverse engineering needed to debug such modifications. Third-party grants
remain effective independently of the application's own license status.

The curated AppImage recipe omits electron-builder's old optional GConf,
appindicator, indicator, notify, Xss and Xtst helper library copies. Standard
desktop GTK/X11 libraries remain OS prerequisites, just as for the RPM.
'''
(destination / 'README.txt').write_text(readme)
shutil.copyfile(root / 'scripts/appimage-sources.json', destination / 'source-manifest.json')
(licenses / 'AppImage-runtime-NOTICE.txt').write_text(readme)
(root / 'release/sources').mkdir(parents=True, exist_ok=True)
with tarfile.open(root / 'release/sources/Receipt.AI-appimage-runtime-sources.tar', 'w') as archive:
    for file in sorted(destination.iterdir()):
        if file.is_file():
            archive.add(file, arcname=file.name)
