import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, PluginOption } from 'vite';
import { execSync } from 'child_process';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';

function gitOutput(command: string, fallback = '') {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const commitHash = gitOutput('git rev-parse --verify --short=8 HEAD', 'local');
const versionTag = gitOutput('git --no-pager tag --sort -taggerdate --points-at HEAD')
  .split('\n')[0]
  .trim();
// If not empty then it's not clean
const gitCleanString = gitOutput('git status --porcelain');
const gitClean = gitCleanString ? false : true;
if (!gitClean) console.log('Git is dirty because of:\n' + gitCleanString);

console.log(`version is ${versionTag || commitHash}${gitClean ? '' : '-dirty'}`);

// Detect fluent file changes
export function i18nHotReload(): PluginOption {
  return {
    name: 'i18n-hot-reload',
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.ftl')) {
        console.log('Fluent files updated');
        server.hot.send({
          type: 'custom',
          event: 'locales-update',
        });
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __VERSION_TAG__: JSON.stringify(versionTag),
    __GIT_CLEAN__: gitClean,
  },
  plugins: [
    react({ babel: { plugins: [jotaiReactRefresh] } }),
    i18nHotReload(),
    visualizer() as PluginOption,
    sentryVitePlugin({
      org: 'slimevr',
      project: 'slimevr-server-gui-react',
    }),
  ],
  build: {
    target: 'es2022',
    emptyOutDir: true,

    commonjsOptions: {
      include: [/solarxr-protocol/, /node_modules/],
    },

    sourcemap: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
    needsInterop: ['solarxr-protocol'],
    include: ['solarxr-protocol'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
    },
  },
});
