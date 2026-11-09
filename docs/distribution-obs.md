# Automated openSUSE Build Service releases

This is an implementation plan, **not an active integration**. Goal: a version
tag updates a public OBS package and OBS builds/publishes it without manual
uploads. A package in `home:USERNAME` is a third-party repository, not the
official openSUSE distribution. See the [release workflow](../.github/workflows/release.yml),
[RPM template](../packaging/cockpit-cron.spec.in), and
[Makefile](../Makefile).

## Chosen architecture

Use a **tag-triggered GitHub Actions job** depending on the existing `source`
job. It downloads exactly that job's two `.tar.xz` artifacts, assembles RPM
and Debian source build descriptions from the release tarball, uploads
those files and an OBS `.changes` file to `home:yashjawale/cockpit-cron` using
`osc`, and checks OBS build results. OBS builds/publishes asynchronously; a
successful `osc commit` only
means sources were accepted, **not** that a repository was published.

Tag -> source job -> OBS upload/commit -> OBS remote builds -> published
repositories for enabled targets. Do **not** enable a second OBS tag webhook
for this package unless replacing this workflow, to avoid duplicate/racing
builds. This package was SCM-managed; the owner disabled SCM sync for the
manual upload test. Do not mix SCM updates and direct `osc` uploads as
competing sources of truth. OBS's
[SCM/CI integration](https://openbuildservice.org/help/manuals/obs-user-guide/cha-obs-scm-ci-workflow-integration)
is an alternative, but it must reproduce this project's generated tarballs and
versioned spec; merely triggering `rebuild_package` on tag push would rebuild
the *previous* version, not publish the new one.

## Manual owner setup (one time)

1. Sign in at <https://build.opensuse.org/> and use the existing home project
   `home:yashjawale` and package `cockpit-cron`. Add one available repository,
   such as Tumbleweed x86_64; confirm build and publish flags are enabled.
   Verify the actual openSUSE distribution repository path in OBS, not in a
   stale documentation example.
2. Install/configure `osc` on your own machine, and install `dpkg-dev` so
   `dpkg-source` is available. From the repository root, run `make obs-sources`
   (or set `OBS_OUTPUT=/path/to/output`).
   Upload the resulting RPM spec, Debian `.dsc` and companion archives, plus
   both upstream tarballs and `cockpit-cron.changes`. Arch users can use the
   project's AUR recipe instead. Check each
   build log and test installation before trusting automated uploads. The
   formats and dependency names need validation on every target family.
3. Arrange an OBS identity for CI with **write rights only to the intended
   project/package**, if possible; store its credentials in GitHub Actions
   secrets (for example `OBS_USER`/`OBS_PASSWORD` or the authentication method
   supported by the installed `osc`). A dedicated automation account with
   restricted project permissions is preferable to a personal password.
   Confirm the credentials work with the selected OBS API and `osc` version.
4. Restrict the publisher job to trusted tag events, keep credentials out of
   logs and untrusted PR workflows, and decide whether a protected GitHub
   environment would introduce a manual approval (which is incompatible with
   fully unattended release publication). Record project URL, repo names and
   actual installed package URL for user-facing docs.

## Agent implementation checklist

- [ ] Add an OBS job with `needs: source` to `.github/workflows/release.yml`
      or a reusable workflow called from it. Skip upload when `DRY_RUN=true`;
      **also** reject all non-tag events, even if the manual workflow's
      dry-run input is false. Still let dry runs assemble and validate the
      upload files. Use the
      release artifact produced in the **same workflow run**, not a mutable
      GitHub branch or `latest` release URL. Derive version from the tag and
      verify generated spec `%{version}` and both source filenames match it.
- [ ] Use `make obs-sources` on the release tarball. It obtains
      the generated RPM spec from inside the tarball and creates a Debian
      source package (`.dsc`, `.orig.tar.xz`, and
      `.debian.tar.xz`), adding Debian revision `-1` to the generated upstream
      version as required by format `3.0 (quilt)`. The spec template contains
      placeholders and must not be uploaded directly. Upload both RPM source archives with exact matching
      filenames; keep all companion Debian source files together.
- [ ] Track an OBS `.changes` file in this repository; GitHub is the source of
      truth for package sources and changelog history. Have CI create a new
      valid `osc vc`-style entry for each version with the tag's release notes;
      preserve old entries. Validate generated metadata and ensure repeated
      runs for the same tag do not create duplicate changelog entries or
      unnecessary OBS rebuilds. Do not keep independent OBS-side packaging
      edits; document that CI replaces package contents from GitHub.
- [ ] Install a pinned/known `osc` version on the runner. Create its config
      with restricted permissions in a temporary location from secrets,
      securely clean it up, and invoke `osc` with that config. Prefer a checked
      out package working copy (`osc checkout home:USER cockpit-cron`), copy
      the generated build descriptions, all referenced source archives, and
      updated changes file, run `osc add` (and
      `osc delete` only for **known superseded release tarballs**), inspect
      `osc status`, then `osc commit -m "Update to VERSION"`. Be explicit about
      whether old tarballs remain; automatic deletes must not remove unrelated
      maintainer files. Do not commit release binaries into Git.
- [ ] Verify that OBS started building the newly committed source revision,
      wait with a bounded timeout for each configured repo/arch, then fail the
      job on `failed`, `unresolvable`, `broken`, or a build timeout. Check that
      publish is enabled and results have reached the public repo; a build
      result can be successful before the repo metadata is updated. Treat OBS
      API status and published artifacts as separate checks.
- [ ] Test behavior on a repeated CI run (same tag), on a failed OBS build,
      with one repository/arch disabled, and on missing source artifacts.
      Add/enable OBS repositories in project settings and validate each family:
      RPM targets use the spec and Debian/Ubuntu targets use the `.dsc`. Arch
      is distributed through the AUR recipe, not OBS. This UI package is
      architecture-independent; RPMs use the prebuilt UI bundle on every
      target. RHEL 7 is end-of-life and unsupported; remove its OBS target
      rather than preserving compatibility workarounds for it. EOL targets
      should not be advertised as supported just because OBS lists them.

The OBS [basic workflow](https://openbuildservice.org/help/manuals/obs-user-guide/cha-obs-basicworkflow)
explains `osc` checkout/commit/results. Do not assume `osc commit`'s exit code
is a build success signal.

## Verification and operations

1. On a dry run inspect the prepared spec, archive filenames and changes file;
   verify OBS remains untouched.
2. Push a real version tag. Check that the OBS package's source revision
   changed to that version, inspect each repository/architecture build log and
   ensure the package appears in a **published** OBS download repository.
3. Follow OBS's generated repository installation instructions on clean
   Tumbleweed/Leap systems and test the Cockpit Cron UI.
4. For failures, fix the packaging in Git, test locally, then use a new
   release version (or a documented packaging-revision bump on the same
   upstream version). Avoid silently replacing an already published tarball.

**Done when:** one tag yields a version-matched, successful, publicly available
OBS package, with no manual `osc commit` after the one-time setup.
