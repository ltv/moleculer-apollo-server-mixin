const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')
const outDir = path.resolve(__dirname, 'dist')

const filter = (x) => ['.bin', '@app'].indexOf(x) === -1
const nodeModules = fs.readdirSync('node_modules').filter(filter)

// const options = ;
const defaultOptions = {
  entryPoints: ['src/index.ts'],
  color: true,
  minify: false,
  bundle: true,
  sourcemap: false,
  platform: 'node',
  tsconfig: './tsconfig.json',
  logLevel: 'error',
  external: nodeModules,
}

const build = (format = 'cjs') => {
  const options = Object.assign(defaultOptions, {
    format,
    outfile: `${outDir}/index.${format}.js`,
  })
  return esbuild.build(options)
}

const outFormats = ['cjs', 'esm']

Promise.all(outFormats.map((f) => build(f))).catch((e) => {
  console.error(e)
  process.exit(1)
})
