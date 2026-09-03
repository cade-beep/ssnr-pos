// Bootstrap ts-node for the Excel sync check (mirrors electron/main.js)
require('ts-node').register({ compilerOptions: { module: 'commonjs', target: 'es2022' } });
require('../electron/excelSyncService.check.ts');
