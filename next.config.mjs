// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tesseract.js requires this to avoid SSR issues
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false }
    return config
  },
}
export default nextConfig
