#!/usr/bin/env node
// write-env.mjs — read frontend/.env and emit src/environments/environment.ts
// from src/environments/environment.template.ts. Runs as `prestart`/`prebuild`
// so developers never commit the generated file (it's gitignored) but always
// have a fresh one before serving or building.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, '..');
const envFile = resolve(frontendDir, '.env');
const templateFile = resolve(frontendDir, 'src/environments/environment.template.ts');
const outputFile = resolve(frontendDir, 'src/environments/environment.ts');

function loadEnv() {
  if (!existsSync(envFile)) {
    return {};
  }
  const raw = readFileSync(envFile, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = loadEnv();
const template = readFileSync(templateFile, 'utf8');

const placeholderValues = {
  __SUPABASE_URL__: env.SUPABASE_URL ?? 'https://your-project.supabase.co',
  __SUPABASE_ANON_KEY__: env.SUPABASE_ANON_KEY ?? 'your-supabase-anon-key',
  __API_BASE_URL__: env.API_BASE_URL ?? 'http://localhost:4000',
};

let output = template;
for (const [placeholder, value] of Object.entries(placeholderValues)) {
  output = output.split(placeholder).join(value);
}

writeFileSync(outputFile, output, 'utf8');
console.log(`[write-env] wrote ${outputFile}`);
