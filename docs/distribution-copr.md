# Automated Copr releases

This is an implementation plan, **not an active integration**. Goal: pushing a
version tag (for example `0.1.1`) produces a persistent, installable Copr RPM
without a manual upload. Copr is a third-party repository, not Fedora's
official package archive. See [the release workflow](../.github/workflows/release.yml),
[Packit configuration](../packit.yaml), and [RPM template](../packaging/cockpit-cron.spec.in).

## Chosen architecture

Use **Packit-as-a-service's `copr_build` release trigger**. It runs when the
GitHub release is published by `.github/workflows/release.yml`, which is itself
started by pushing a tag. This avoids storing Copr credentials in GitHub
Actions. Packit already runs PR builds here; do not confuse its ephemeral PR
projects with the persistent public release project. Its release job is
currently commented out in `packit.yaml`.

Tag -> GitHub Actions builds source and creates GitHub release -> Packit sees
release event -> Packit makes SRPM -> Copr builds RPMs -> Copr publishes repos.
Packit/Copr builds happen asynchronously: successful creation of the GitHub
release alone does **not** mean the Copr builds succeeded. To require a single
green release status, implement a separate status check against Copr's API.

## Manual owner setup (one time)

1. Register at <https://accounts.fedoraproject.org/> and log in at
   <https://copr.fedorainfracloud.org/>. Decide on the Copr owner username.
2. Create a project named `cockpit-cron`; enable only a Fedora release/arch
   that exists in the Copr chroot list and on which this package builds.
   Keep publishing enabled and disable expiration/deletion for this project.
   Make sure this is **not** a disposable CI project.
3. Enable Packit-as-a-service for `yashjawale/cockpit-cron` using Packit's
   onboarding instructions. Confirm existing PR Copr jobs run first.
4. In the Copr project's settings, set **Packit allowed forge projects** to
   include `github.com/yashjawale/cockpit-cron`. Grant Packit **builder**
   permission when requested (and admin only if you want Packit to modify
   project settings/chroots); these are separate authorization steps.
5. Save the project URL and the *actual* owner name for the config below.
   None of these steps can be completed merely by merging repository files.

## Agent implementation checklist

- [ ] Uncomment/add a release `copr_build` job in `packit.yaml` with `owner`,
      `project: cockpit-cron`, `trigger: release`, and a deliberately limited
      `targets` list (or omit `targets` to inherit the custom Copr project's
      enabled chroots). Do **not** copy the PR-only targets blindly: some
      targets may not exist or have required dependencies. Set a unique
      `identifier` if Packit runs more than one `copr_build` job. For a custom
      owner, configure persistence and chroots **in Copr**; Packit does not
      update the boolean project settings for custom owners.
- [ ] Keep the existing `post-upstream-clone`/`create-archive` actions working.
      They regenerate the spec and node cache. Confirm the SRPM contains both
      `Source0` (release tarball) and `Source1` (node cache), and the spec
      Version exactly equals the tag. The current generated spec has an old
      development version; do not publish it unchanged.
- [ ] Ensure the source tarball can be built with `make srpm` and the generated
      RPM spec builds in a clean target chroot. Test both Fedora's
      `nodejs-esbuild` rebuild path and any CentOS prebuilt-bundle path before
      enabling those targets. Review license/bundled-NPM metadata and runtime
      dependencies (`cockpit-bridge`, plus a working cron implementation).
- [ ] Fix stale comments in `packit.yaml`/`README.md` only when behavior has
      changed; document the real Copr URL and installation command after a
      successful published build.
- [ ] Ensure the release job runs only for a published versioned GitHub
      release originating from a trusted tag. The current workflow also has
      a manual `workflow_dispatch` input that can disable dry-run mode;
      reject non-tag refs in every publisher, even if dry-run is false.
- [ ] Provide a retrigger procedure for an upstream release in case Packit
      misses a webhook; do not retag an existing version to fix a failed build.

Illustrative release job (substitute your real Copr owner and tested targets):

```yaml
  - job: copr_build
    trigger: release
    identifier: published
    owner: YOUR_COPR_USERNAME
    project: cockpit-cron
    targets:
      - fedora-44
```

Use the [Packit Copr job reference](https://packit.dev/docs/configuration/upstream/copr_build)
to check current target names and permissions; it explicitly documents custom
projects and release triggers. Do not add a second Copr webhook or a separate
`copr-cli` tag workflow unless replacing this design, or each tag may build
twice.

## Verification and operations

1. Before a real release, test PR builds and GitHub Actions' `workflow_dispatch`
   dry run. Packit `trigger: release` does **not** fire on the dry run.
2. Push a new tag and verify the GitHub release exists; inspect the Packit
   dashboard, then all enabled Copr build logs and the published package.
3. On a fresh Fedora system: `sudo dnf copr enable
   YOUR_COPR_USERNAME/cockpit-cron`, `sudo dnf install cockpit-cron`, then
   verify `/usr/share/cockpit/cron` and the Cockpit UI. Check CentOS separately
   if enabled.
4. On failure, change the spec/config in a new commit and cut a **new version**
   for a user-facing release; use Packit's documented retrigger only when the
   same sources can safely be rebuilt. Monitor future distro EOL/chroot changes.

**Done when:** a fresh tag leads, without uploads by a human, to a successful
build in a persistent Copr repository and a clean-machine install.
