# ECHO Core — Distribution Guide

## Install via npm (recommended)

```bash
npm install -g echo-core
```

Or run without installing:

```bash
npx echo-core <command>
```

Requires Node.js >= 20.

## Download standalone binary

For machines without Node.js, download a prebuilt binary from [GitHub Releases](https://github.com/your-org/echo-core/releases).

| Platform | Binary |
|----------|--------|
| Linux x64 | `echo-core-linux-x64` |
| macOS x64 | `echo-core-macos-x64` |
| Windows x64 | `echo-core-win-x64.exe` |

Binaries include built-in adapters and docs, but **native dependencies** (e.g., `better-sqlite3`, `hnswlib-node`) may not work in binary form. For full functionality, use npm install.

## Install from source

```bash
git clone https://github.com/your-org/echo-core.git
cd echo-core
pnpm install
pnpm build
pnpm test
```

Run locally:

```bash
node bin/echo-core.js <command>
```

## Limitations

- Standalone binaries are best-effort for zero-dependency deployment.
- Native modules (`better-sqlite3`, `hnswlib-node`) may fail in binaries; npm install is preferred.
- Docker, Kubernetes, and Helm are not included in the open-core distribution.
