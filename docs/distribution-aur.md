# Automated AUR releases

This is an implementation plan, **not an active integration**. Goal: a version
tag updates an AUR recipe without manual pushes; users then build/install it
locally. **AUR does not build or host installable binaries.** A fully
tag-to-published-*binary* AUR workflow is impossible; automatic publication
means updating `PKGBUILD` and `.SRCINFO` on the AUR. See
[Arch PKGBUILD template](../packaging/arch/PKGBUILD.in),
[Makefile](../Makefile), and [release workflow](../.github/workflows/release.yml).

## Naming and source choice

The existing release tarball contains prebuilt `dist/` JavaScript. The current
Arch template installs it without rebuilding, so [AUR's rules](https://wiki.archlinux.org/title/AUR_submission_guidelines#Rules_of_submission)
require the `-bin` suffix when source is available. Choose **`cockpit-cron-bin`**
for this automated recipe; keep the upstream tarball downloaded from GitHub
Releases, not committed to the AUR repository. If instead implementing a
fully source-built `cockpit-cron`, install the requisite Node/npm build inputs
and make the PKGBUILD *actually rebuild* `dist/` in an isolated Arch build;
only then revisit the unsuffixed name. Do not upload both names without a
clear reason and verified `provides`/`conflicts` behavior.

Tag -> release `source` job publishes versioned immutable tarball -> Arch
runner downloads it, generates/checks PKGBUILD, checksum and `.SRCINFO` ->
pushes AUR Git repository -> AUR publishes recipe -> users run `makepkg`.

## Manual owner setup (one time)

1. Search <https://archlinux.org/packages/> and <https://aur.archlinux.org/>
   to ensure the proposed package does not already exist; coordinate with an
   existing maintainer if it does. **AUR account creation is currently blocked**
   for the maintainer. AUR publication is deferred; do not add an AUR push job
   or treat the account/setup checklist as complete until account creation is
   available and a working account is confirmed.
2. Create a dedicated SSH key (`ssh-keygen -f ~/.ssh/aur`), register its **public**
   half in AUR's *My Account*, and confirm you can authenticate to
   `ssh://aur@aur.archlinux.org/cockpit-cron-bin.git`. Never put the private key
   in Git or in any release artifact.
3. **Manually test and publish the initial recipe** from a real Arch system
   or VM: update the template for the `-bin` package, use a release URL and a
   real SHA-256 checksum, then run `makepkg -s`, `namcap PKGBUILD`, `namcap`
   on the built package, install it, and test Cockpit. Add the required
   maintainer comment, accurate runtime/build dependencies (include a cron
   provider if the app requires `crontab`), SPDX license, and install files
   under `/usr`, not `/usr/local`. `gettext` is needed by `make install`;
   `make` comes from the expected `base-devel` toolchain. For the prebuilt
   bundle, use `PREBUILT_BUNDLE=1` so `make install` does not try to run npm.
4. Clone the *separate* AUR Git repository with SSH, commit `PKGBUILD`,
   `.SRCINFO` and a license for the AUR packaging sources (see the current
   [AUR submission guidelines](https://wiki.archlinux.org/title/AUR_submission_guidelines)),
   and push to `master`. The initial commit must be a tested, working package.
5. Store a **separate CI-specific** SSH private key authorized on that account
   in a GitHub secret such as `AUR_SSH_PRIVATE_KEY`. Limit the GitHub publisher
   to trusted version tags. Pin the AUR SSH server host key to the fingerprint
   published on <https://aur.archlinux.org/>; never use
   `StrictHostKeyChecking=no` or unauthenticated `ssh-keyscan` alone. Ensure
   the automation identity has Git name/email set and that its access can be
   revoked without revoking your personal SSH key.

## Deferred AUR work

The current `packaging/arch/PKGBUILD.in` builds the Arch package attached to
GitHub releases. It uses a local source archive and the release workflow fills
in its checksum; **that generated recipe is not ready to submit to AUR**. When
account creation is available, create an AUR-specific recipe using the
version-pinned GitHub release URL and real SHA-256, generate `.SRCINFO`, and
test with `makepkg`/`namcap` before publishing. Keep the AUR recipe separate
from the GitHub artifact-build recipe. The shared template now declares
`gettext` as a build dependency and `cockpit-cron` as a provided/conflicting
package name; retain these in the AUR recipe.

After an account is confirmed, resume the owner setup above: verify package
name availability, register a dedicated SSH key, pin the AUR host key, test
the initial recipe manually, then add tag-only CI publishing. Do not create the
CI secret or publisher job before account access and a manual AUR push have
been verified.

The [AUR submission guide](https://wiki.archlinux.org/title/AUR_submission_guidelines)
documents the SSH Git remote, required `.SRCINFO`, allowed branches and
prebuilt-deliverable naming. The [PKGBUILD reference](https://wiki.archlinux.org/title/PKGBUILD)
documents source hashes, dependencies and `arch=('any')`.

## Verification and operations

1. First manual release: confirm AUR page and `makepkg -si` work on Arch.
2. Push a **new** version tag and inspect GitHub Actions, AUR Git history,
   matching `.SRCINFO`, public source URL, SHA-256, and a clean Arch install.
3. If push fails, repair CI/key/SSH configuration and rerun the same tag's
   publisher job when safe. If the *recipe* is incorrect after publication,
   bump `pkgrel`, regenerate `.SRCINFO` and publish a corrected commit.
4. Watch AUR feedback, upstream releases and security updates. An automated
   recipe push is not a substitute for checking that `makepkg` still builds.

**Done when:** a new tag automatically updates a valid `cockpit-cron-bin`
PKGBUILD and `.SRCINFO` in AUR and users can build/install it without changes.
