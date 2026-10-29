/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * ビルド時に Service Worker を生成する。
 * ビルド成果物と public/ の全ファイルを事前キャッシュ対象として書き込み、
 * 内容のハッシュをキャッシュ名に使うので、更新時は古いキャッシュだけが入れ替わる。
 */
function serviceWorker(): Plugin {
  return {
    name: 'koenowa-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = join(process.cwd(), 'public');
      const publicFiles = listFiles(publicDir).map((f) => relative(publicDir, f).split('\\').join('/'));
      const files = ['./', ...Object.keys(bundle), ...publicFiles]
        .filter((f) => !f.endsWith('.map'))
        .map((f) => (f === './' ? f : `./${f}`));
      const hash = createHash('sha256');
      for (const item of Object.values(bundle)) {
        hash.update(item.fileName);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const f of publicFiles) hash.update(readFileSync(join(publicDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(join(process.cwd(), 'sw', 'sw.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__PRECACHE_VERSION__', version)
          .replace('__PRECACHE_FILES__', JSON.stringify(files)),
      });
    },
  };
}

/** 画面に表示するバージョン番号。package.json の version だけを管理元にする */
const appVersion = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;

export default defineConfig({
  // GitHub Pages 等のサブパスでも動くよう相対パスで出力する
  base: './',
  // ビルド時に package.json の version を埋め込む（画面のコードには番号を書かない）
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
