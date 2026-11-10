# Automated Ubuntu PPA releases

This documents the active Launchpad PPA upload job. A numeric release tag
triggers signed source uploads for the configured Ubuntu series; Launchpad
builds and publishes their `.deb` files asynchronously. The GitHub release
`.deb` is a separate binary build. See
[release workflow](../.github/workflows/release.yml),
[Debian packaging](../packaging/debian/), and
[distribution Makefile rules](../Makefile).

## Chosen architecture

The tag-only PPA job downloads the source artifact from the same workflow run.
It supports annotated numeric tags such as `1`, `2`, and `3`, as well as dotted
numeric versions such as `1.2.3`. It builds a Debian **source** package per
Ubuntu series, signs `.dsc` and
`_source.changes` with the configured OpenPGP key, and uploads each
`_source.changes` with `dput`. Credentials are not exposed to pull-request or
manual workflow runs. PPA publication is independent of the GitHub release
gate; check Launchpad acceptance and build status separately.
The configured target series are `jammy` (22.04), `noble` (24.04), `resolute`
(26.04), and `stonking` (26.10). Recheck Launchpad target availability as
Ubuntu support changes.

## Manual owner setup (one time)

1. The configured destination is `ppa:yashjawale/cockpit-plugins`. Sign in at
   <https://launchpad.net/> and confirm access, publication status, and
   supported architectures/series for that PPA.
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
- [x] A tag-only matrix upload job builds and uploads signed source packages to
      `ppa:yashjawale/cockpit-plugins` for the configured Ubuntu series. The job
      accepts numeric and dotted numeric tags. PPA publishing is independent
      from the GitHub release publishing gate.
- [ ] Verify PPA series/build dependency availability and exercise a signed
      source upload after owner setup.

The source-preparation helper creates the quilt-compatible orig tarball,
per-series Debian revision/changelog, and source package from the release
artifact. The workflow imports the key into a temporary `GNUPGHOME`, signs the
source upload, and removes the key material at job end. The remaining owner-side
check is to verify Launchpad accepted and built each configured series; an FTP
upload alone does not prove acceptance or successful publication.

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
   `sudo add-apt-repository ppa:yashjawale/cockpit-plugins`,
   `sudo apt update`, `sudo apt install cockpit-cron`, and test the Cockpit UI.
4. On rejection/build failure, fix and increment the PPA revision; do not
   delete/reupload the same version. On key compromise, revoke it in Launchpad
   and GitHub, rotate secrets, and investigate uploads.

**Done when:** a tag triggers successful signed source uploads and Launchpad
publishes working packages for each supported Ubuntu series without manual
`dput` or confirmation.
