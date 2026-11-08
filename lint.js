'use strict';
const fs = require('fs');
const { ESLint } = require('eslint');

(async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  if (scripts.length !== 1) throw new Error(`Expected one inline application script, found ${scripts.length}.`);
  const eslint = new ESLint({ useEslintrc: false, overrideConfigFile: '.eslintrc.json' });
  const results = await eslint.lintText(scripts[0], { filePath: 'index.inline.js' });
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) console.log(output);
  if (results.some(result => result.errorCount > 0)) process.exitCode = 1;
  else console.log('Inline application script passed ESLint.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
