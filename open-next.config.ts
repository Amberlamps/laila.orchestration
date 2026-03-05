/**
 * OpenNext v3 configuration for deploying Next.js 14 (Pages Router) to AWS Lambda.
 *
 * Transforms the Next.js build output into deployment artifacts:
 *   - Server function: Lambda handler for SSR pages and API routes
 *   - Static assets: Files for S3 upload (_next/static/, public/)
 *   - Cache assets: ISR/SSG cache data
 *
 * The output in .open-next/ is consumed by the Terraform Lambda + CloudFront modules.
 *
 * @see https://opennext.js.org/aws/config
 */

import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';

const config: OpenNextConfig = {
  default: {
    override: {
      // Use the standard Lambda wrapper for Function URL integration
      wrapper: 'aws-lambda',
      // API Gateway V2 / Function URL compatible converter
      converter: 'aws-apigw-v2',
      // Use S3 for incremental static regeneration cache (fetch + html/rsc/json)
      incrementalCache: 's3',
      // Use DynamoDB for tag-based cache revalidation (revalidatePath / revalidateTag)
      tagCache: 'dynamodb',
      // Use SQS for ISR revalidation queue
      queue: 'sqs',
    },
    // Minify disabled: OpenNext's minimizer crashes on broken pnpm symlinks
    // (caniuse-lite symlink target not copied to .open-next output)
    minify: false,
  },

  // Build the Next.js app via pnpm (corepack may not be enabled)
  buildCommand: 'npx pnpm --filter @laila/web run build',

  // The Next.js app lives in apps/web/ within the monorepo
  appPath: 'apps/web',

  // Build output (.next) is produced inside apps/web/
  buildOutputPath: 'apps/web',

  // package.json location for dependency resolution
  packageJsonPath: 'apps/web',

  dangerous: {
    disableTagCache: false,
    disableIncrementalCache: false,
  },
};

export default config;
