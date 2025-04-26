#!/bin/sh

# This script creates a clean single-commit history for the public repository without overriding local changes

echo "Creating a clean single-commit branch using local changes..."
current_branch=$(git rev-parse --abbrev-ref HEAD)

# Create a temporary orphan branch
git checkout --orphan clean-temp

# Add all files
git add .

# Create a single clean commit
git commit -m "Release UILensAI v0.1.8"

# Force push to the public repository
echo "Force pushing clean history to public repository..."
PUSH_PUBLIC=true git push -f origin clean-temp:master

# Return to the original branch
echo "Returning to original branch: $current_branch"
git checkout $current_branch

# Clean up temporary branch
git branch -D clean-temp

echo "Done! Public repository now has a clean single-commit history." 