import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ root: __dirname, plugins: [react()], logLevel: 'silent', css: { postcss: resolve(__dirname, '..') } });
