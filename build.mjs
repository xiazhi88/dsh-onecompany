/**
 * dsh-onecompany 构建脚本：esbuild 一把梭。
 *  - host:  src/host/index.ts  → lib/index.js  (ESM, node；外部依赖保持 external)
 *  - typert: src/host/typert.ts → lib/typert.js (ESM, node；zod external)
 *  - client: src/client/index.tsx → lib/client.js (CJS closure-factory，
 *            window.__ModuleLoader__.load 交接；平台模块 external，其余 inline)
 * 用法: node build.mjs [--watch]
 */
import { build, context } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'

const watch = process.argv.includes('--watch')

/** 客户端平台模块：由 web shell 的模块表提供（external，运行时用注入的 require 解析）。 */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

/** host 半外部依赖：安装进 profile 后由 pnpm 提供；其余全部内联，保证单文件自洽。 */
const HOST_EXTERNALS = [
  'zod',
  'cron-parser',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-llm',
]

const hostConfig = {
  entryPoints: ['src/host/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  external: [...HOST_EXTERNALS],
  logLevel: 'info',
}

const typertConfig = {
  entryPoints: ['src/host/typert.ts'],
  outfile: 'lib/typert.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: false,
  external: ['zod'],
  logLevel: 'info',
}

const clientConfig = {
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.css': 'text' },
  external: [...PLATFORM_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  banner: {
    js: `window.__ModuleLoader__.load({ id: 'dsh-onecompany', factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
}

await mkdir('lib', { recursive: true })

if (watch) {
  const contexts = await Promise.all([hostConfig, typertConfig, clientConfig].map((c) => context(c)))
  await Promise.all(contexts.map((c) => c.watch()))
  console.log('[dsh-onecompany] watch 模式已启动')
} else {
  await Promise.all([hostConfig, typertConfig, clientConfig].map((c) => build(c)))
  console.log('[dsh-onecompany] 构建完成：lib/index.js, lib/typert.js, lib/client.js')
}
