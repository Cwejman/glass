// The interface, compiled: Solid's TSX through Babel, bundled by Bun for the browser.

import { transformAsync } from '@babel/core'
import solid from 'babel-preset-solid'
import typescript from '@babel/preset-typescript'
import { join } from 'node:path'

const solidPlugin: Bun.BunPlugin = {
  name: 'solid',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
      const out = await transformAsync(await Bun.file(path).text(), {
        filename: path,
        presets: [[solid, { generate: 'dom' }], [typescript, {}]],
      })
      return { contents: out!.code!, loader: 'js' }
    })
  },
}

export async function buildInterface(root: string) {
  const r = await Bun.build({
    entrypoints: [join(root, 'ui/main.tsx')],
    outdir: join(root, 'dist'),
    target: 'browser',
    conditions: ['browser', 'solid'],
    plugins: [solidPlugin],
    naming: 'app.js',
  })
  if (!r.success) throw new AggregateError(r.logs, 'the interface did not build')
}
