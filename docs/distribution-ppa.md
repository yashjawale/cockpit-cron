# Automated Ubuntu PPA releases

This is an implementation plan, **not an active integration**. Goal: pushing
one version tag uploads signed *source* packages to a Launchpad PPA for the
supported Ubuntu series, where Launchpad builds and publishes `.deb` files.
The GitHub release `.deb` is **not** a PPA upload. See
[release workflow](../.github/workflows/release.yml),
[Debian packaging](../packaging/debian/), and
[distribution Makefile rules](../Makefile).

## Chosen architecture

Add a GitHub Actions job to the existing tag-triggered workflow (or a called
workflow), with `needs: source`. Download the source-job artifact rather than
rebuilding from current `main`. Build a Debian **source** package per Ubuntu
series, sign `.dsc` and `_source.changes` with a dedicated OpenPGP upload key,
and upload each `_source.changes` with `dput`. Launchpad builds and publishes
asynchronously. Do not attach these signing credentials to pull-request jobs.
The initial target series are `jammy` (22.04), `noble` (24.04), `resolute`
(26.04), and `stonking` (26.10). Confirm each is available as a Launchpad PPA
build target before enabling uploads. Review this list as Ubuntu support changes.

## Manual owner setup (one time)

1. Register/login at <https://launchpad.net/>; accept the PPA terms and create
   a public Ubuntu PPA named `cockpit-cron`. Select supported architectures.
2. Generate a dedicated OpenPGP signing key **on a trusted machine**. Add its
   public key to your Launchpad account and complete Launchpad's confirmation
   email. Make the Debian changelog maintainer email correspond to the key and
   Launchpad account. Back up the private key offline and record its complete
   fingerprint. Avoid putting your everyday personal signing key in CI.
3. Store the armored private key as the GitHub Actions secret
   `PPA_SIGNING_KEY_ASC`, its fingerprint as `PPA_SIGNING_FINGERPRINT`, and
   its passphrase as `PPA_SIGNING_PASSPHRASE`. Use a passphrase-protected key
   **dedicated to this PPA**. Restrict repository Actions access, and be able
   to revoke/rotate the key. Never put a key in
   Git, logs, build artifacts or untrusted PR jobs.
4. Optionally use a protected GitHub `ppa-publish` environment with tag/release
   restrictions. **Required human approval** of that environment would break
   the requested hands-off tag-to-publication behavior; choose restrictions
   accordingly. Confirm the PPA supports the selected Ubuntu series and the
   archive provides `debhelper-compat (= 13)`, `gettext`, and `cockpit-bridge`.

## Implementation status

- [x] Add `packaging/debian/prepare-ppa-source` to derive the quilt-compatible
      orig tarball and per-series source tree from the exact release artifact.
- [x] Add a tag-only matrix upload job in the release workflow for the four
      selected Ubuntu series. It uploads to `ppa:yashjawale/cockpit-plugins`;
      PPA publishing is independent from the GitHub release publishing gate.
- [ ] Verify PPA series/build dependency availability and exercise a signed
      source upload after owner setup.

## Agent implementation checklist

- [ ] Generate an Ubuntu-ready orig tarball from the exact release tarball.
      `packaging/debian/source/format` is `3.0 (quilt)`, but `make dist`
      includes a generated `debian/` in the upstream tarball. Unpack the
      release tarball into a staging directory. Repack its contents **excluding
      the top-level `debian/`** as
      `cockpit-cron_<UPSTREAM_VERSION>.orig.tar.xz`. Retain the original
      extracted `debian/` in the packaging working tree. Do not substitute a
      GitHub auto-generated tag archive: it lacks prebuilt `dist/` and the
      generated Debian files. Make this conversion a repeatable script with a
      temporary workspace and tests for the tar contents.
- [ ] For each chosen series, create a fresh packaging workspace, keep the
      orig tar beside the source directory, and insert a changelog entry for
      **that series**. Example for tag `0.1.1` and `noble`:
      `cockpit-cron (0.1.1-0ubuntu1~noble1) noble; urgency=medium`.
      Never upload the generated `unstable` entry unchanged. Use distinct
      monotonically increasing PPA revisions per series, and define a policy
      for retries: Launchpad cannot accept a second upload of the same version.
- [ ] In an Ubuntu environment with `dpkg-dev`, `devscripts`, `debhelper`,
      `gettext`, and `dput`, build source only (for example
      `dpkg-buildpackage -S -sa -k<FINGERPRINT>`). Import the secret key into
      a temporary `GNUPGHOME` (mode 0700); for a passphrase-protected key,
      arrange noninteractive loopback pinentry without echoing the passphrase.
      Ensure both `.dsc` and `_source.changes` are signed. Clean up temporary
      secret material at job end.
- [ ] Test extraction/build of the generated `.dsc` in an Ubuntu clean build
      environment (`sbuild`, `pbuilder` or an appropriate container) before
      uploading. `dpkg-buildpackage -b -us -uc` in the release workflow does
      not test the `3.0 (quilt)` source upload path. Check binary package
      includes the prebuilt UI and `/usr/share/cockpit/cron` without requiring
      npm/network in the Launchpad builder.
- [ ] Run `dput ppa:YOUR_LAUNCHPAD_USERNAME/cockpit-cron
      <package>_source.changes` only for a real versioned tag push, never for
      `workflow_dispatch` (including when its dry-run input is false) or PRs.
      For the first upload of a new
      upstream version, use `-sa` so the orig tar is included. Handle each
      series independently and record upload/acceptance/build status. An FTP
      upload is **not** proof of Launchpad acceptance or build success.
- [ ] Add validation of codename, tag (`^[0-9]+\.[0-9]+\.[0-9]+$` if adopting
      semantic release versions), version ordering, correct source tarball,
      and matching changelog. Test the script on a local sample tarball in CI
      without secrets; optionally check Launchpad API for accepted/published
      state and fail a monitoring job on rejection. Do not publish the private
      key as a workflow artifact.

Read Launchpad's [source-package guide](https://ubuntu.com/docs/launchpad/user/how-to/packaging/build-deb-packages-in-launchpad/)
and [PPA creation instructions](https://ubuntu.com/docs/launchpad/user/how-to/packaging/create-ppa/).
Use the Launchpad upload destination shown on *your* PPA's page; its owner may
not equal the GitHub username.

## Verification and operations

1. Test orig-tar creation and signed local source builds without uploading;
   the existing workflow's dry run must produce no PPA changes.
2. Publish a new tag. Inspect GitHub Actions, Launchpad acceptance email,
   source package page, build logs and `Published` status for **each** series.
3. On a clean Ubuntu machine for each target series, run
   `sudo add-apt-repository ppa:YOUR_LAUNCHPAD_USERNAME/cockpit-cron`,
   `sudo apt update`, `sudo apt install cockpit-cron`, and test the Cockpit UI.
4. On rejection/build failure, fix and increment the PPA revision; do not
   delete/reupload the same version. On key compromise, revoke it in Launchpad
   and GitHub, rotate secrets, and investigate uploads.

**Done when:** a tag triggers successful signed source uploads and Launchpad
publishes working packages for each supported Ubuntu series without manual
`dput` or confirmation.
