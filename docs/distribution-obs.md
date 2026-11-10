# Automated openSUSE Build Service releases

This documents the OBS publishing integration for tagged releases. A package
in `home:USERNAME` is a third-party repository, not the
official openSUSE distribution. See the [release workflow](../.github/workflows/release.yml),
[RPM template](../packaging/cockpit-cron.spec.in), and
[Makefile](../Makefile).

## Chosen architecture

Use a **tag-triggered GitHub Actions job** depending on the existing `source`
job. It downloads that job's release tarball, assembles RPM
and Debian source build descriptions from the release tarball, and uploads
those files plus an OBS `.changes` entry to `home:yashjawale/cockpit-cron` using
`osc`. The workflow runs as a dry run on `workflow_dispatch`; only a pushed
version tag can write to OBS. OBS builds/publishes asynchronously; a successful
`osc commit` means sources were accepted, **not** that a repository was
published. Check build and publish status in OBS after the workflow completes.

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
2. Enable build and publish for the desired distributions in the project's
   **Repositories** settings. RHEL 7 is unsupported and has been removed.
   Published repository URLs follow
   `https://download.opensuse.org/repositories/home:/yashjawale/REPOSITORY/`;
   the exact install instructions and signing-key setup are shown by OBS for
   each repository. Do not guess the repository segment or omit its key.
3. Create a dedicated OBS automation account with write access only to
   `home:yashjawale/cockpit-cron` if possible. In GitHub, open **Settings →
   Secrets and variables → Actions** and add repository secrets `OBS_USER` and
   `OBS_PASSWORD`. Never put credentials in workflow files or variables.
4. Run **Actions → release → Run workflow** to exercise the dry-run path. It
   assembles the OBS source files and uploads them as `obs-sources-dry-run`,
   without requiring OBS credentials or modifying OBS. Inspect that artifact
   before creating/pushing a real annotated release tag. The source job
   rejects lightweight or non-numeric tags and checks the archive version
   against the tag before any publisher runs. OBS publishing supports
   Cockpit-style numeric tags such as `1`, `2`, `3`, and dotted versions such
   as `1.2.3`.

## Implementation status and remaining verification

- [x] Add an OBS job with `needs: source` to `.github/workflows/release.yml`.
      Manual runs only assemble and validate the upload files; the job also
      explicitly requires a tag-push event before using credentials. Use the
      release artifact produced in the **same workflow run**, not a mutable
      GitHub branch or `latest` release URL. Derive version from the tag and
      verify the generated spec version and release archive filename match it.
- [x] Use `make obs-sources` on the release tarball. It obtains
      the generated RPM spec from inside the tarball and creates a Debian
      source package (`.dsc`, `.orig.tar.xz`, and
      `.debian.tar.xz`), adding Debian revision `-1` to the generated upstream
      version as required by format `3.0 (quilt)`. The spec template contains
      placeholders and must not be uploaded directly. The spec consumes the
      prebuilt UI bundle from the release archive, so no separate Node cache is
      needed for OBS. Keep all companion Debian source files together.
- [x] Generate an idempotent OBS `.changes` entry from the tag release notes;
      preserve prior OBS history. New entries derive from the GitHub tag's
      release notes; repeated runs for the same tag don't add duplicates.
- [x] Install `osc` on the runner. Create its config
      with restricted permissions in a temporary location from secrets,
      securely clean it up, and invoke `osc` with that config. Prefer a checked
      out package working copy (`osc checkout home:USER cockpit-cron`), copy
      the generated build descriptions, all referenced source archives, and
      updated changes file; inspect `osc status`, then commit. The job removes
      only superseded files matching the release helper's exact tarball and
      Debian-source filename patterns. It leaves unrelated package files
      untouched and never commits release binaries to Git.
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

1. On a dry run inspect the prepared spec, archive filenames, and Debian source
   descriptions; verify OBS remains untouched. The dry-run artifact does not
   include `cockpit-cron.changes`, which is updated against the current OBS
   package history during the authenticated tag-upload step.
2. Push a real version tag. Check that the OBS package's source revision
   changed to that version, inspect each repository/architecture build log and
   ensure the package appears in a **published** OBS download repository.
3. Follow OBS's generated repository installation instructions on clean
   Tumbleweed/Leap systems and test the Cockpit Cron UI. If the OBS page does
   not show combined install commands, the repository base URL has this form:
   `https://download.opensuse.org/repositories/home:/yashjawale/REPOSITORY/`.
   For example, `openSUSE_Tumbleweed` and `xUbuntu_24.04` are repository
   segments. RPM systems can add that URL as a repository; Debian/Ubuntu also
   need the `Release.key` from the same URL installed as an apt signing key.
   Use the exact project/repository URL shown by OBS for the target distro.
4. For failures, fix the packaging in Git, test locally, then use a new
   release version (or a documented packaging-revision bump on the same
   upstream version). Avoid silently replacing an already published tarball.

**Done when:** one tag yields a version-matched, successful, publicly available
OBS package, with no manual `osc commit` after the one-time setup.
