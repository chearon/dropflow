export default {
  root: 'site',
  build: {
    outDir: '../dist/site',
    target: 'esnext'
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
};
