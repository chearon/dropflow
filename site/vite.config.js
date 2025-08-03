export default {
  root: 'site',
  build: {
    outDir: '../dist/site',
    target: 'esnext',
    sourcemap: true
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  resolve: {
    conditions: ['typescript', 'browser']
  }
};
