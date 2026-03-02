import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
    '../../packages/domain/src/**/*.{ts,tsx}',
  ],
};

export default config;
