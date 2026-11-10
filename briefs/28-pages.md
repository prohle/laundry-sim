# Brief 28 — static export and GitHub Pages

Implement task **5.10** only. The repo is public but there is no live URL. GitHub Pages can host the
page with no external account, and the page is already static.

## 1. `next.config.ts`

```ts
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig: NextConfig = {
  output: process.env.STATIC_EXPORT ? "export" : "standalone",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};
```

Keep `standalone` as the default so the container build still works.

## 2. The video path

The page is a client component (it has the table toggle). Change the video `src` from `/fold.mp4` to:

```tsx
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
<video src={`${base}/fold.mp4`} ... />
```

`NEXT_PUBLIC_*` is inlined at build time, so this works in both modes.

## 3. The workflow

`.github/workflows/pages.yml`:

- trigger: push to `main`, and `workflow_dispatch`;
- permissions: `contents: read`, `pages: write`, `id-token: write`;
- steps: checkout, setup-node 22 with npm cache, `npm ci`,
  `STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/laundry-sim npm run build`,
  `actions/configure-pages`, `actions/upload-pages-artifact` with `path: out`,
  `actions/deploy-pages`.

## 4. `.nojekyll`

Add `public/.nojekyll` so Pages does not run Jekyll over `_next`.

## Acceptance

```
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/laundry-sim npm run build
ls out/index.html out/fold.mp4 out/_next | head
```

The build exits 0 and `out/index.html` references `/laundry-sim/_next/...` and `/laundry-sim/fold.mp4`.
Then `npm run build` with no env still exits 0 (the container path).

## Constraints

- Do not change the page copy or layout.
- Do not remove the Dockerfile or the standalone default.
- Keep the workflow under 40 lines.

## Report

The two build outputs, the asset paths in `out/index.html`, and the workflow file. Do not commit.
