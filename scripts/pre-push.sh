#!/bin/sh

# Get the remote being pushed to
remote="$1"
url=$(git remote get-url "$remote")

# Validate pushes to public repository
if [ "$remote" = "origin" ]; then
  if [ "$PUSH_PUBLIC" != "true" ]; then
    echo "ERROR: Direct push to public repository not allowed."
    echo "Please set PUSH_PUBLIC=true to push to public repository."
    exit 1
  fi
fi 