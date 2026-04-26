import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// cubejs is CoffeeScript-compiled CJS that uses `(function(){}).call(this)`
// to grab the global object. Inside ES modules `this` is `undefined`, so
// solve.js crashes on `this.Cube`. Patch its source to use `globalThis`.
//
// We register the patch in TWO places:
//   1. As a Vite plugin `transform` hook — applies during prod build (Rollup).
//   2. As an esbuild plugin via `optimizeDeps.esbuildOptions` — applies
//      during dev/test pre-bundling, which runs *before* Vite transforms.
//
// Without (2), dev server and vitest see an unpatched bundle and crash.
function patchCubejs(): Plugin {
  return {
    name: 'patch-cubejs-this',
    enforce: 'pre',
    transform(code, id) {
      if (!/cubejs[\\/]lib[\\/]/.test(id)) return null
      if (!code.includes('.call(this)')) return null
      return {
        code: code.replace(/\}\)\.call\(this\)/g, '}).call(globalThis)'),
        map: null,
      }
    },
  }
}

export default defineConfig({
  // Allow overriding the base path at build time so the app can be hosted
  // under a subpath (e.g. GitHub Pages: https://user.github.io/repo/).
  // The deploy workflow sets VITE_BASE to "/<repo>/".
  base: process.env.VITE_BASE || '/',
  plugins: [patchCubejs(), react()],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: 'patch-cubejs-this-esbuild',
          setup(build) {
            build.onLoad({ filter: /cubejs[\\/]lib[\\/].*\.js$/ }, async (args) => {
              const src = await fs.promises.readFile(args.path, 'utf8')
              return {
                contents: src.replace(/\}\)\.call\(this\)/g, '}).call(globalThis)'),
                loader: 'js',
              }
            })
          },
        },
      ],
    },
  },
})
