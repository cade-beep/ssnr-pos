// JavaScript entry point to bootstrap ts-node and load main.ts
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2022'
  }
});

// Load the actual main TypeScript file
require('./main.ts');
