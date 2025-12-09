/**
 * Build script for Tapko Widget
 * Uses esbuild to bundle the widget for CDN delivery
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');

// Read CSS file
const cssPath = path.join(__dirname, 'src/styles/widget.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Plugin to inject CSS into JS
const injectCSSPlugin = {
  name: 'inject-css',
  setup(build) {
    build.onLoad({ filter: /src\/index\.js$/ }, async (args) => {
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
const buildOptions = {
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'dist/tapko-widget.js',
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
 * Tapko Widget v1.0.0
 * Copyright (c) ${new Date().getFullYear()}
 * Licensed under MIT
 */`
  }
};

async function build() {
  try {
    console.log(`Building Tapko Widget (${isProduction ? 'production' : 'development'})...`);

    if (isWatch) {
      const context = await esbuild.context(buildOptions);
      await context.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(buildOptions);

      // Get file size
      const stats = fs.statSync('dist/tapko-widget.js');
      const fileSizeInKB = (stats.size / 1024).toFixed(2);

      console.log(`✓ Build complete!`);
      console.log(`  File: dist/tapko-widget.js`);
      console.log(`  Size: ${fileSizeInKB} KB`);

      if (isProduction) {
        // Also create unminified version for debugging
        await esbuild.build({
          ...buildOptions,
          outfile: 'dist/tapko-widget.debug.js',
          minify: false,
          sourcemap: true
        });
        console.log(`  Debug: dist/tapko-widget.debug.js`);
      }
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
