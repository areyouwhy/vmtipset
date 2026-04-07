// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';

// Load .env.local into process.env for server-side libs like @vercel/blob
const env = loadEnv('', process.cwd(), '');
Object.assign(process.env, env);

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
});
