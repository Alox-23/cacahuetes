import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import es from './src/i18n/es.json'

/** Fills <title> in index.html from the translation file (no hard-coded copy). */
function i18nTitle(): Plugin {
  return {
    name: 'i18n-title',
    transformIndexHtml: (html) => html.replace('%APP_TITLE%', es.app.documentTitle),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), i18nTitle()],
})
