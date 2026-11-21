# Contributing

Contributions are welcome. Please open an issue for bugs or feature ideas, and
submit code changes as pull requests against `main`.

## Development setup

Install the dependencies for your distribution and build the project as
described in the [README](README.md#development-dependencies):

```sh
git clone https://github.com/yashjawale/cockpit-cron.git
cd cockpit-cron
make
```

For local development, use `make devel-install` and reload Cockpit in your
browser after rebuilding.

## Checks and tests

Run the static checks and integration tests before opening a pull request:

```sh
make codecheck
TEST_BROWSER=firefox make check
```

The integration tests run in a VM. See the [README testing instructions](README.md#running-tests-locally)
and [AGENTS.md](AGENTS.md) for setup and troubleshooting details.

## Translations

The project uses gettext PO catalogs. After changing translatable strings,
regenerate the template with:

```sh
make po/cockpit-cron.pot
```

Weblate hosting is being set up; until it is available, translation updates
can be submitted as PO file changes in a pull request.

## Pull requests

- Keep changes focused and follow the existing code and documentation style.
- Include tests or documentation updates where useful.
- Describe the change and the checks you ran in the pull request.
- Add screenshots for user-visible UI changes when practical.
