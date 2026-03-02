/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@laila/shared", "@laila/domain", "@laila/database"],
};

export default nextConfig;
