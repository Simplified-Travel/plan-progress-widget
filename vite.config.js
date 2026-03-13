import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.js'),
            name: 'GenerationWidget',
            formats: ['iife', 'es'],
            fileName: (format) => `widget.${format}.js`,
        },
        // pusher-js and the polyfill are bundled in — no external deps for the embedder
        rollupOptions: {},
    },
    server: {
        port: 5174,
    },
})