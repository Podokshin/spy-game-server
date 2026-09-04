import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        whoami: path.resolve(import.meta.dirname, 'whoami/index.html'),
        categories: path.resolve(import.meta.dirname, 'categories/index.html'),
        mission: path.resolve(import.meta.dirname, 'mission/index.html'),
        mafia: path.resolve(import.meta.dirname, 'mafia/index.html'),
        codenames: path.resolve(import.meta.dirname, 'codenames/index.html'),
        wavelength: path.resolve(import.meta.dirname, 'wavelength/index.html'),
        spy: path.resolve(import.meta.dirname, 'spy/index.html'),
        nardy: path.resolve(import.meta.dirname, 'nardy/index.html'),
        crocodile: path.resolve(import.meta.dirname, 'crocodile/index.html'),
        skuf: path.resolve(import.meta.dirname, 'skuf/index.html'),
        wall: path.resolve(import.meta.dirname, 'wall/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
      // Общие виджеты (радио, боковые видео) пока остаются vanilla-скриптами
      // на Express-сервере — в dev их нужно явно проксировать, в проде их
      // отдаёт server.js fallback на public/.
      '/radio.js': 'http://localhost:3000',
      '/radio.css': 'http://localhost:3000',
      // shorts.js больше нигде не подключается (видео теперь React-панель
      // справа), но shorts.css остаётся — оттуда стили клика по .credit.
      '/shorts.css': 'http://localhost:3000',
      '/game-chrome.css': 'http://localhost:3000',
      // Каждая мигрированная игра переиспользует свой существующий
      // public/<game>/style.css (вёрстка уже была в порядке, менять её не
      // просили) — в dev его тоже нужно явно проксировать.
      '^/(spy|mission|codenames|mafia|wavelength|whoami|nardy|categories|crocodile|skuf|wall)/style\\.css$': 'http://localhost:3000',
      '/nardy/rules-client.js': 'http://localhost:3000',
    },
  },
})
