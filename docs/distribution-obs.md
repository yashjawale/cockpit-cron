# Automated openSUSE Build Service releases

This is an implementation plan, **not an active integration**. Goal: a version
tag updates a public OBS package and OBS builds/publishes it without manual
uploads. A package in `home:USERNAME` is a third-party repository, not the
official openSUSE distribution. See the [release workflow](../.github/workflows/release.yml),
[RPM template](../packaging/cockpit-cron.spec.in), and
[Makefile](../Makefile).

## Chosen architecture

Use a **tag-triggered GitHub Actions job** depending on the existing `source`
job. It downloads exactly that job's two `.tar.xz` artifacts, extracts the
**generated** spec for the tag, uploads all source files and an OBS `.changes`
file to `home:YOUR_OBS_USERNAME/cockpit-cron` using `osc`, and checks OBS build
results. OBS builds/publishes asynchronously; a successful `osc commit` only
means sources were accepted, **not** that a repository was published.

Tag -> source job -> OBS upload/commit -> OBS remote builds -> published RPM
repository. Do **not** enable a second OBS tag webhook for this same package
unless replacing this workflow, to avoid duplicate/racing builds. OBS's
[SCM/CI integration](https://openbuildservice.org/help/manuals/obs-user-guide/cha-obs-scm-ci-workflow-integration)
is an alternative, but it must reproduce this project's generated tarballs and
versioned spec; merely triggering `rebuild_package` on tag push would rebuild
the *previous* version, not publish the new one.

## Manual owner setup (one time)

1. Sign up at <https://build.opensuse.org/> and create/enable the home project
   `home:YOUR_OBS_USERNAME` and package `cockpit-cron` (the account/project
   name may differ from your GitHub username). Add one available repository,
   such as Tumbleweed x86_64; confirm build and publish flags are enabled.
   Verify the actual openSUSE distribution repository path in OBS, not in a
   stale documentation example.
2. Install/configure `osc` on your own machine and manually upload a **test
   release** containing matching generated `cockpit-cron.spec`, source tarball,
   node-cache tarball and `cockpit-cron.changes`; run `osc build` if practical.
   Check `osc results`, build log and clean-system installation before trusting
   an automated upload. The spec has an openSUSE dependency branch but has not
   been established as working for every target; adjust it first if needed.
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
- [ ] Obtain the release spec from inside the built source tarball. The root
      `cockpit-cron.spec` in a normal checkout can be stale/ignored; the
      template contains `%{VERSION}` and `%{NPM_PROVIDES}` placeholders and
      cannot be uploaded directly. The spec's `Source0` is the source tarball,
      and `Source1` references the node-cache tarball: upload **both** with
      exactly matching filenames even if the openSUSE build branch does not
      use `Source1` at compile time.
- [ ] Track an OBS `.changes` file for this package (either in this repository
      as a versioned template/maintained file or in OBS). Have CI create a new
      valid `osc vc`-style entry for each version with the tag's release notes;
      preserve old entries. Validate generated metadata and ensure repeated
      runs for the same tag do not create duplicate changelog entries or
      unnecessary OBS rebuilds. Never overwrite existing OBS packaging edits
      without detecting/merging them or documenting that GitHub is the sole
      source of truth.
- [ ] Install a pinned/known `osc` version on the runner. Create its config
      with restricted permissions in a temporary location from secrets,
      securely clean it up, and invoke `osc` with that config. Prefer a checked
      out package working copy (`osc checkout home:USER cockpit-cron`), copy
      the three release files and updated changes file, run `osc add` (and
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
      Add further OBS targets only after validating the dependencies for each.

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
