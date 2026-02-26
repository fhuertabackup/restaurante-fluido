/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    server-componentsExternalPackages: ['@supabase/ssr']
  }
}

export default nextConfig
