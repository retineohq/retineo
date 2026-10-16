# Publishing and package transition

## New package: `@retineo/memory-core`

1. Verify version in `package.json` and `packages/memory-core/package.json` (currently `0.7.0`).
2. Build and test:

```bash
npm run build
npm test
```

3. Login and publish (public scoped package):

```bash
npm login
npm publish --access public
```

4. Verify installation in a scratch directory:

```bash
mkdir /tmp/check && cd /tmp/check && npm init -y
npm i @retineo/memory-core
node -e "import('@retineo/memory-core').then(m => console.log(Object.keys(m).length, 'exports'))"
```

**Status 2026-10-17:** `@retineo/memory-core@0.7.1` published successfully.
Root `package.json` now exposes `main`/`types` pointing to
`packages/memory-core/dist/index.{js,d.ts}`.

5. Tag is already pushed (`v0.7.0`). GitHub release notes can reuse `CHANGELOG.md` section.

## Legacy package: `@retineo/core` (0.4.5)

The legacy package remains installable; it is soft-sunset via README migration
note on the new package. When ready (after 1.0 of memory-core or earlier if
desired), deprecate explicit versions:

```bash
npm deprecate @retineo/core@0.4.5 "Renamed to @retineo/memory-core. Use that instead."
```

If multiple versions exist:

```bash
for v in $(npm view @retineo/core versions --json | tr -d '[]",' | tr ' ' '\n' | grep -v '^$'); do
  npm deprecate "@retineo/core@$v" "Renamed to @retineo/memory-core. Use that instead."
done
```

Check state:

```bash
npm view @retineo/core deprecated
npm view @retineo/memory-core version
```
