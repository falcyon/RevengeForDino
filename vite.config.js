export default {
  base: '/lab/dinoRevenge/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        dev: 'dev.html',
        demo: 'demo.html',
      },
    },
  },
};
