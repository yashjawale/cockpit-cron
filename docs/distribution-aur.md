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
   existing maintainer if it does. Create an AUR account.
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

## Agent implementation checklist

- [ ] Fix `packaging/arch/PKGBUILD.in` or add a separate versioned template.
      `Makefile` currently generates a **local**, development-version
      `packaging/arch/PKGBUILD` with `source=("cockpit-cron-...tar.xz")`,
      `sha256sums=('SKIP')`, `pkgname=cockpit-cron`, and `depends` inside
      `package()`. These must **not** be pushed to AUR as-is. Use a public
      version-pinned release URL, real SHA-256, `pkgname=cockpit-cron-bin`,
      `provides=('cockpit-cron')`, `conflicts=('cockpit-cron')`, `arch=('any')`
      if contents are architecture independent, and an explicit
      `PREBUILT_BUNDLE=1` install. Validate no native binary slips into `dist/`
      before deciding `arch=('any')`.
- [ ] Add a job running on an Arch environment with a working `makepkg`
      (for example a maintained Arch runner/container) to the release workflow,
      with `needs: source` and, for publishing, the GitHub release creation
      step having completed. Download the **same-run** source tarball artifact
      to compute `sha256sum`; the PKGBUILD URL must point to the GitHub
      *release asset*, not the short-lived Actions artifact. Since `source`
      creates the release, the URL should exist before publishing AUR.
- [ ] On a dry run, generate the recipe and `.SRCINFO` without secrets, build
      it against the local same-run tarball (or a staging release URL), run
      `namcap`, inspect installed paths and verify exact version. Dry runs do
      **not** publish a GitHub release; do not run `makepkg` against its
      nonexistent release URL. Test the release-URL download separately on a
      real published tag.
- [ ] For real tags only, use `makepkg --printsrcinfo > .SRCINFO` after
      generating the final `PKGBUILD` (reject `workflow_dispatch` even if
      dry-run is false). Clone the AUR repository over SSH on
      its `master` branch; update only the intended packaging files, check
      `git diff`, skip an identical no-op rerun, then commit/push. Pull/rebase
      or safely fail on an AUR maintainer's concurrent edits; never force push
      or overwrite user/maintainer changes blindly. Include an SSH host-key
      check, keep the key out of job logs, and dispose of it after use.
- [ ] Set `pkgver` to the released version and reset `pkgrel=1` for a new
      version; for a packaging-only fix with the same upstream tarball, bump
      `pkgrel` instead. Review changes to source licenses/dependencies at
      every release. AUR Git and source archives must remain separate from
      this GitHub repository's generated `PKGBUILD` and from built packages.

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
