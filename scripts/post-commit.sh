#!/bin/sh

echo "Pushing to private repository..."
git push private HEAD:master

# Only push to public repository if explicitly requested
if [ "$PUSH_PUBLIC" = "true" ]; then
  echo "Pushing to public repository..."
  echo "NOTE: For clean commit history, consider using: npm run clean-push"
  git push origin HEAD:master
fi 