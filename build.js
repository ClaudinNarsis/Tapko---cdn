/**
 * Build script for Tapko Widget
 * Uses esbuild to bundle the widget for CDN delivery
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = envContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        acc[key.trim()] = valueParts.join('=').trim();
      }
      return acc;
    }, {});

  // Only set env vars if they don't already exist
  Object.keys(envVars).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = envVars[key];
    }
  });

  console.log('📝 Loaded .env file');
  console.log('   API_URL from .env:', envVars.API_URL);
}

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
const entryPoint = 'src/index.js';
const outfile = 'dist/tapko-widget.js';
const version = 'v2.0.0';

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
    console.log(`Building Tapko Widget (${isProduction ? 'production' : 'development'})...`);
    console.log('🔍 API_URL being injected into build:', process.env.API_URL || 'https://api.tapko.com');
    console.log('---');

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
        const debugOutfile = 'dist/tapko-widget.debug.js';

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
