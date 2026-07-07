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
  # expose the actual release tag to later workflow steps (e.g. the Zulip announcement)
  [ -n "$GITHUB_ENV" ] && echo "RELEASE_TAG=v$RELEASE_VERSION_WITHOUT_PRERELEASE" >> "$GITHUB_ENV"
  # A pre-release is signalled by the workflow's checkbox (PRERELEASE), and a
  # semver pre-release suffix on the version is still honored as a fallback.
  PRERELEASE_VERSION=$(node -e "const p = require('semver').parse('$RELEASE_VERSION'); console.log(process.env.PRERELEASE === 'true' || (p != null && p.prerelease.length > 0))")
  # expose whether this is a pre-release to later workflow steps (e.g. the Zulip announcement)
  [ -n "$GITHUB_ENV" ] && echo "RELEASE_IS_PRERELEASE=$PRERELEASE_VERSION" >> "$GITHUB_ENV"
  npm version $RELEASE_VERSION_WITHOUT_PRERELEASE --message "release $RELEASE_VERSION_WITHOUT_PRERELEASE [no ci]"
  git push origin $(git describe --tags --exact-match)
  npm run package
  RELEASE_VSCE_PRERELEASE_OPT=$([[ "$PRERELEASE_VERSION" == "true" ]] && echo "--pre-release" || echo "")
  npx vsce publish -p $RELEASE_VSCE_TOKEN $RELEASE_VSCE_PRERELEASE_OPT
  # publish the same .vsix to Open VSX (used by VSCodium, Cursor, Gitpod, code-server, …)
  # optional: skip if no token is configured so it never blocks the VS Code release
  if [ -n "$RELEASE_OVSX_TOKEN" ]; then
    npx ovsx publish asciidoctor-vscode-$RELEASE_VERSION_WITHOUT_PRERELEASE.vsix -p $RELEASE_OVSX_TOKEN $RELEASE_VSCE_PRERELEASE_OPT
  else
    echo No Open VSX token specified, skipping publication to open-vsx.org.
  fi
  git push origin $RELEASE_BRANCH
  node tasks/release-notes.js
  RELEASE_GH_PRERELEASE_OPT=$([[ "$PRERELEASE_VERSION" == "true" ]] && echo "--prerelease" || echo "")
  gh release create v$RELEASE_VERSION_WITHOUT_PRERELEASE -t v$RELEASE_VERSION_WITHOUT_PRERELEASE -F release-notes.md $RELEASE_GH_PRERELEASE_OPT
  gh release upload v$RELEASE_VERSION_WITHOUT_PRERELEASE asciidoctor-vscode-$RELEASE_VERSION_WITHOUT_PRERELEASE.vsix
  npm version --no-git-tag-version "$(npx semver -i patch $RELEASE_VERSION_WITHOUT_PRERELEASE)-dev"
  git commit -a -m 'prepare branch for development [no ci]'
  git push origin $RELEASE_BRANCH
)
exit_code=$?

git status -s -b

exit $exit_code
