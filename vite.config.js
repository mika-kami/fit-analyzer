import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return vars;
  } catch { return {}; }
}

export default defineConfig(({ mode }) => {
  const llmVars = loadEnvFile(resolve(__dirname, '.env_llm'));
  // Process env (Vercel injects VITE_* here at build time)
  const processEnv = process.env;

  // Inject VITE_* vars from .env_llm, but let process.env (Vercel dashboard vars) override
  const define = {};
  for (const [key, value] of Object.entries(llmVars)) {
    if (key.startsWith('VITE_') && !(key in processEnv)) {
      define[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  }

  return {
    plugins: [react()],
    server: { port: 5173 },
    define,
  };
});
