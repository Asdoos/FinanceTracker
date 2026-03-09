#!/bin/sh
set -e

if [ -z "$CONVEX_URL" ]; then
  echo "ERROR: CONVEX_URL environment variable is required."
  echo "Example: docker run -e CONVEX_URL=https://your-deployment.convex.cloud ..."
  exit 1
fi

echo "Injecting CONVEX_URL into bundle..."
find /usr/share/nginx/html -name "*.js" \
  -exec sed -i "s|__CONVEX_URL_PLACEHOLDER__|$CONVEX_URL|g" {} \;

exec nginx -g "daemon off;"
