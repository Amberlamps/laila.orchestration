# Configure OpenNext Build

## Task Details

- **Title:** Configure OpenNext Build
- **Status:** Not Started
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Set Up Deployment Pipeline](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Configure OpenNext v3 for deploying Next.js 14 (Pages Router) to AWS Lambda + CloudFront. The OpenNext build transforms the Next.js output into deployment artifacts compatible with Lambda (server function), S3 (static assets), and CloudFront (cache behaviors). Create build scripts in `package.json` and an OpenNext configuration file.

### OpenNext Configuration

```typescript
// open-next.config.ts
// OpenNext v3 configuration for deploying Next.js 14 to AWS Lambda.
// Configures the server function, static assets, and cache behavior.

import type { OpenNextConfig } from "open-next/types/open-next";

const config: OpenNextConfig = {
  // Server function configuration
  default: {
    // Override the default wrapper for Lambda
    override: {
      // Use the Lambda wrapper for Function URL integration
      wrapper: "aws-lambda",
      // Use S3 for incremental static regeneration cache
      incrementalCache: "s3",
      // Use DynamoDB for tag-based cache revalidation
      tagCache: "dynamodb",
    },
  },

  // Build configuration
  buildCommand: "npx next build",
  buildOutputPath: ".next",

  // Dangerous: skip minification for debugging (set to false in production)
  dangerous: {
    disableTagCache: false,
    disableIncrementalCache: false,
  },
};

export default config;
```

### Package.json Build Scripts

```json
// Root package.json additions for OpenNext build.
{
  "scripts": {
    "build:next": "next build",
    "build:open-next": "open-next build",
    "build:lambdas": "pnpm --filter '@laila/*' --parallel run build",
    "build:all": "pnpm build:next && pnpm build:open-next && pnpm build:lambdas",
    "deploy:package": "node scripts/package-lambdas.js"
  }
}
```

### Lambda Packaging Script

```typescript
// scripts/package-lambdas.ts
// Packages Lambda function artifacts for Terraform deployment.
// Creates zip files from the built function bundles.
// Output: deploy/functions/{function-name}.zip

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import archiver from "archiver";

const FUNCTIONS = [
  "timeout-checker",
  "dag-reconciler",
  "audit-archiver",
  "status-propagation",
];

async function packageFunction(name: string): Promise<void> {
  const distDir = resolve(`functions/${name}/dist`);
  const outputDir = resolve("deploy/functions");
  await mkdir(outputDir, { recursive: true });

  const output = createWriteStream(`${outputDir}/${name}.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(distDir, false);
  await archive.finalize();
}

// Package all functions in parallel
await Promise.all(FUNCTIONS.map(packageFunction));
```

## Acceptance Criteria

- [ ] `open-next.config.ts` exists at the project root with OpenNext v3 configuration
- [ ] OpenNext is configured for Lambda wrapper mode (Function URL integration)
- [ ] Static assets are built and output to the correct directory for S3 upload
- [ ] Server function is built and output for Lambda deployment
- [ ] Build scripts are added to the root `package.json`
- [ ] `pnpm build:open-next` produces the expected output structure
- [ ] Lambda packaging script creates zip files for all background functions
- [ ] The OpenNext build output is compatible with the Terraform Lambda module
- [ ] Build completes without errors on a clean install

## Technical Notes

- OpenNext v3 transforms Next.js output into three deployment targets:
  1. **Server function:** The Lambda handler for SSR pages and API routes
  2. **Static assets:** Files to upload to S3 (`_next/static/`, `public/`)
  3. **Cache assets:** ISR/SSG cache data
- The Pages Router is used (not App Router). OpenNext v3 supports both, but the configuration differs slightly.
- The packaging script uses `archiver` to create zip files that Terraform's `aws_lambda_function` resource can deploy via the `filename` attribute.
- OpenNext adds roughly 50-100ms of cold start overhead on top of the base Lambda cold start. This is acceptable for the use case.

## References

- **OpenNext v3:** https://open-next.js.org/
- **Next.js 14 Pages Router:** https://nextjs.org/docs/pages
- **Terraform Integration:** Lambda function module accepts zip deployment packages

## Estimated Complexity

Medium — OpenNext v3 configuration is straightforward but requires careful alignment between the build output structure and the Terraform Lambda/S3/CloudFront configuration. Testing the full build pipeline end-to-end is important.
