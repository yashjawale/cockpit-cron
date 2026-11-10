# Automated Copr releases

This is the active Packit release integration. Publishing a tagged GitHub
release triggers builds in a persistent Copr RPM repository. Copr is a
third-party repository, not Fedora's official package archive. See
[the release workflow](../.github/workflows/release.yml),
[Packit configuration](../packit.yaml), and [RPM template](../packaging/cockpit-cron.spec.in).

## Chosen architecture

Use **Packit-as-a-service's `copr_build` release trigger**. It runs when the
GitHub release is published by `.github/workflows/release.yml`, which starts
from a pushed numeric release tag. This avoids storing Copr credentials in
GitHub Actions. PR builds use ephemeral projects; published release builds use
the persistent `yash/cockpit-plugins` project configured in `packit.yaml`.

Tag -> GitHub Actions builds source and creates GitHub release -> Packit sees
release event -> Packit makes SRPM -> Copr builds RPMs -> Copr publishes repos.
Packit/Copr builds happen asynchronously: successful creation of the GitHub
release alone does **not** mean the Copr builds succeeded. To require a single
green release status, implement a separate status check against Copr's API.

## Manual owner setup (one time)

1. Register at <https://accounts.fedoraproject.org/> and log in at
   <https://copr.fedorainfracloud.org/>. Decide on the Copr owner username.
2. Create a project named `cockpit-plugins`; this shared repository can host
   separate packages for multiple Cockpit plugins. Enable only Fedora/CentOS
   releases and architectures on which the packages build. If a `cockpit-cron`
   project already exists, create this new project rather than assuming COPR
   will redirect or rename it.
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

## Remaining verification

The release job, persistent project, and target list are configured. Packit and
Copr run asynchronously, so after a real tag inspect the Packit dashboard,
every enabled chroot's build log, and the published repository. The repository
URL is `https://copr.fedorainfracloud.org/coprs/yash/cockpit-plugins/`.
The source spec uses the prebuilt bundle and declares runtime requirements for
Cockpit and a system `crontab` executable.

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
3. On a fresh Fedora system: `sudo dnf copr enable yash/cockpit-plugins`,
   `sudo dnf install cockpit-cron`, then
   verify `/usr/share/cockpit/cron` and the Cockpit UI. Check CentOS separately
   if enabled.
4. On failure, change the spec/config in a new commit and cut a **new version**
   for a user-facing release; use Packit's documented retrigger only when the
   same sources can safely be rebuilt. Monitor future distro EOL/chroot changes.

**Done when:** a fresh tag leads, without uploads by a human, to a successful
build in a persistent Copr repository and a clean-machine install.
