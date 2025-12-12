/**
 * Build script for Tapko Widget
 * Uses esbuild to bundle the widget for CDN delivery
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');
const buildV2 = process.argv.includes('--v2') || process.env.BUILD_VERSION === 'v2';

// Read CSS files
const cssPath = buildV2
  ? path.join(__dirname, 'src/styles/widgetV2.css')
  : path.join(__dirname, 'src/styles/widget.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Plugin to inject CSS into JS
const injectCSSPlugin = {
  name: 'inject-css',
  setup(build) {
    const indexPattern = buildV2 ? /src\/indexV2\.js$/ : /src\/index\.js$/;

    build.onLoad({ filter: indexPattern }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8');

      // Replace the INJECTED_CSS placeholder with actual CSS
      contents = contents.replace(
        'INJECTED_CSS',
        JSON.stringify(cssContent)
      );

      return { contents, loader: 'js' };
    });
  }
};

// Build configuration
const entryPoint = buildV2 ? 'src/indexV2.js' : 'src/index.js';
const outfile = buildV2 ? 'dist/tapko-widget-v2.js' : 'dist/tapko-widget.js';
const version = buildV2 ? 'v2.0.0' : 'v1.0.0';

const buildOptions = {
  entryPoints: [entryPoint],
  bundle: true,
  outfile: outfile,
  format: 'iife',
  target: ['es2015'],
  platform: 'browser',
  minify: isProduction,
  sourcemap: !isProduction,
  plugins: [injectCSSPlugin],
  define: {
    'process.env.API_URL': JSON.stringify(
      process.env.API_URL || 'https://api.tapko.com'
    ),
    'process.env.NODE_ENV': JSON.stringify(
      isProduction ? 'production' : 'development'
    )
  },
  banner: {
    js: `/**
 * Tapko Widget ${version}
 * Copyright (c) ${new Date().getFullYear()}
 * Licensed under MIT
 */`
  }
};

async function build() {
  try {
    const buildType = buildV2 ? 'V2' : 'V1';
    console.log(`Building Tapko Widget ${buildType} (${isProduction ? 'production' : 'development'})...`);

    if (isWatch) {
      const context = await esbuild.context(buildOptions);
      await context.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(buildOptions);

      // Get file size
      const stats = fs.statSync(outfile);
      const fileSizeInKB = (stats.size / 1024).toFixed(2);

      console.log(`✓ Build complete!`);
      console.log(`  File: ${outfile}`);
      console.log(`  Size: ${fileSizeInKB} KB`);

      if (isProduction) {
        // Also create unminified version for debugging
        const debugOutfile = buildV2
          ? 'dist/tapko-widget-v2.debug.js'
          : 'dist/tapko-widget.debug.js';

        await esbuild.build({
          ...buildOptions,
          outfile: debugOutfile,
          minify: false,
          sourcemap: true
        });
        console.log(`  Debug: ${debugOutfile}`);
      }
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
