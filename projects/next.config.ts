import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: '..',
  },
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
