#!/bin/bash

if [ -z $RELEASE_VSCE_TOKEN ]; then
  echo No Visual Studio Code Extension token specified for publishing to marketplace.visualstudio.com/VSCode. Stopping release.
  exit 1
fi
if [ -z $RELEASE_VERSION ]; then
    echo No release version specified. Stopping release.
    exit 1
fi
RELEASE_BRANCH=$GITHUB_REF_NAME
if [ -z $RELEASE_USER ]; then
  export RELEASE_USER=$GITHUB_ACTOR
fi
RELEASE_GIT_NAME=$(curl -s https://api.github.com/users/$RELEASE_USER | jq -r .name)
RELEASE_GIT_EMAIL=$RELEASE_USER@users.noreply.github.com

# configure git to push changes
git config --local user.name "$RELEASE_GIT_NAME"
git config --local user.email "$RELEASE_GIT_EMAIL"

# release!
(
  set -e
  # pre-release versions are unsupported by VS Code
  # > We only support major.minor.patch for extension versions and semver pre-release tags are not supported.
  # > Support for this will arrive in the future.
  # https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions
  RELEASE_VERSION_WITHOUT_PRERELEASE=$(node -e "console.log(require('semver').coerce('$RELEASE_VERSION').version)")
  PRERELEASE_VERSION=$(node -e "console.log(require('semver').parse('$RELEASE_VERSION').prerelease.length > 0)")
  npm version $RELEASE_VERSION_WITHOUT_PRERELEASE --message "release $RELEASE_VERSION_WITHOUT_PRERELEASE [no ci]"
  git push origin $(git describe --tags --exact-match)
  npm run package
  RELEASE_VSCE_PRERELEASE_OPT=$([[ "$PRERELEASE_VERSION" == "true" ]] && echo "--pre-release" || echo "")
  npx vsce publish -p $RELEASE_VSCE_TOKEN $RELEASE_VSCE_PRERELEASE_OPT
  git push origin $RELEASE_BRANCH
  node tasks/release-notes.js
  RELEASE_GH_PRERELEASE_OPT=$([[ "$PRERELEASE_VERSION" == "true" ]] && echo "--prerelease" || echo "")
  gh release create v$RELEASE_VERSION_WITHOUT_PRERELEASE -t v$RELEASE_VERSION_WITHOUT_PRERELEASE -F release-notes.md $RELEASE_GH_PRERELEASE_OPT
  gh release upload v$RELEASE_VERSION_WITHOUT_PRERELEASE asciidoctor-vscode-$RELEASE_VERSION_WITHOUT_PRERELEASE.vsix
  npm pkg set version="$(npx semver -i patch $RELEASE_VERSION_WITHOUT_PRERELEASE)-dev"
  git commit -a -m 'prepare branch for development [no ci]'
  git push origin $RELEASE_BRANCH
)
exit_code=$?

git status -s -b

exit $exit_code
