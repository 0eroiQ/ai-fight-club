import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const origin = loadEnv(mode, process.cwd(), 'VITE_COUNCIL_BRIDGE_ORIGIN').VITE_COUNCIL_BRIDGE_ORIGIN?.trim();
  if (origin) {
    const url = URL.canParse(origin) ? new URL(origin) : null;
    if (url?.protocol !== 'https:' || url.origin !== origin) {
      throw new Error('VITE_COUNCIL_BRIDGE_ORIGIN must be a public HTTPS origin with no trailing slash.');
    }
  }
  return { base: '/ai-fight-club/' };
});
