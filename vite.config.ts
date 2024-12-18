import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: false,
    terserOptions: {
      compress: false,
      mangle: false,
    },
  },
  server: {
    proxy: {
      // Proxy all /api requests to Wrangler
      '/import-to-shopify-batch': 'http://localhost:8788',
      '/get-shopify-stores': 'http://localhost:8788',
      '/get-magento-attributes': 'http://localhost:8788',
      '/get-magento-categories': 'http://localhost:8788',
      '/get-shopify-products': 'http://localhost:8788',
      '/search-magento-products': 'http://localhost:8788',
      '/create-configurable-product': 'http://localhost:8788',
      '/get-configurable-variants': 'http://localhost:8788',
      '/create-attribute-value': 'http://localhost:8788',
      '/import-to-magento': 'http://localhost:8788'
    }
  }
})
