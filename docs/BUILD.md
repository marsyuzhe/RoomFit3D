# Build and package / 开发构建

Validated toolchain: Windows 11 x64, Node.js 24.13.0 x64, npm 11.6.2. `.nvmrc` selects Node 24 and `.npmrc` enforces package engine requirements. Rust is not used. Internet access is needed to install npm packages and, on a fresh machine, download Electron / NSIS packaging tools. Do not copy a developer’s node_modules into the repository.

Open PowerShell in the repository root:

```powershell
cd app
npm ci
npm test -- --maxWorkers=2
npm run check
npm run build
npm run desktop:pack
```

Run build and packaging sequentially. Packaging consumes the completed build, creates a marked `../release-app` staging folder and writes the installer to `../dist`. Electron 42 uses an explicit install-electron step; the command above downloads it, and desktop:pack also checks and downloads it if missing. The package script only replaces a staging folder bearing its expected marker. It does not need Git. The historical author-workspace NSIS path is optional; electron-builder can download the normal toolchain when it is absent. To launch an unpackaged compiled build, run `npm run desktop` after `npm run build`. For browser development use `npm run dev -- --host 127.0.0.1 --port 5204`, then open `/studio` (the root route is the inherited upstream application).

The necessary small GLB/texture resources, 150 thumbnails, 12 template thumbnails and 4 MiB OCR data are present in the source. `predev` and `build` regenerate `static/vendor/ocr` and `static/vendor/pdfjs` from installed dependencies and assets/ocr. Do not upload those generated vendor copies. No extra asset ZIP is needed to build or edit.

Optional renderer: install Blender 4.5.9 LTS and select it in the UI. QA: Python 3.12 plus `python -m pip install Pillow`; set `ROOMFIT_BLENDER` to Blender and `ROOMFIT_PYTHON` to Python for optional render scripts. `scripts/verify-render.py` checks the image and matching manifest. Some historical UI/performance scripts expect locally generated evidence and a running app; they are not all self-contained acceptance tests. The self-contained automated suite is `npm test`; core-only is `npm run test:roomfit`.

Release branding uses a custom icon. The build stays unsigned. electron-builder edits executable icon and version metadata with signExecutable=false; there is no certificate or private signing key in the source.



## Packaging download troubleshooting

This machine's default NSIS resource download timed out. The verified installer was then built with the already available NSIS 3.12 bundle in the isolated build workspace's `tools/nsis/nsis-bundle`; that compiler is not part of the public source or application runtime. A new contributor normally lets electron-builder fetch its standard NSIS tools. If a corporate network blocks those downloads, fix network/proxy access or obtain the official electron-builder NSIS resources under their license and point the documented local bundle path at them. This release did not validate a fresh VM's entire packaging tool download. The app's planning/build tests and production compilation do not depend on that local compiler.
