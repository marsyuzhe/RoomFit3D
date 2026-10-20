# Public copy validation — 2026-10-20

The whitelist source was copied to a separate build workspace. No original node_modules or build output was copied. A fresh `npm ci --no-audit --no-fund` used the lockfile; cached downloads may have been used. Tests, check, production build and Windows NSIS packaging ran against that workspace. The default NSIS resource download timed out, so final packaging used an existing NSIS 3.12 compiler copied to the isolated workspace; that compiler is excluded from public source. This did not verify a fresh machine's complete packaging tool download. This is a local reproducibility check on the author's Windows machine, not an offline or clean-VM installation test.

```json
{
  "version": "0.2.0",
  "author": "Links Tam",
  "preRelease": true,
  "freshNpmCi": true,
  "tests": {
    "files": 171,
    "passed": 1624,
    "failed": 0
  },
  "svelteCheck": {
    "errors": 0,
    "warnings": 0
  },
  "productionBuild": true,
  "nsisInstaller": true,
  "nsisCompiler": "existing 3.12 bundle in isolated build workspace after default download timed out",
  "signed": false,
  "browserUiChecks": 7,
  "nativeUiChecks": 7,
  "realCycles": {
    "passed": true,
    "backend": "OPTIX",
    "resolution": [
      960,
      540
    ]
  },
  "packagedAssetChecks": 188,
  "peIconSizes": [
    16,
    24,
    32,
    48,
    64,
    128,
    256
  ],
  "sourceInputsByteEqualToBuildWorkspace": 742,
  "installerArchiveIntegrity": true,
  "cleanVmInstallUninstall": false,
  "phoneCaptureApplication": false,
  "blenderBundled": false
}
```

No Git commands, GitHub API/CLI, account login or automatic publication was used. Source uploads and Release publication are manual. Build logs and the full file/privacy audit remain local, outside the repository. The public source has no development dependencies, generated vendor data, local profile, old installer or private signing key. Dependencies are restored by npm ci; offline OCR language data and licensed model assets are included.
