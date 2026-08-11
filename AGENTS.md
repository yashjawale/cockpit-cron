# Cockpit Cron

## Documentation

The `README.md` at the repository root covers development dependencies,
building, installing, running the tests, CI, and release workflows.

Architecture documentation lives in the `docs/` directory:

- `docs/ARCHITECTURE.md` - module layers, data model, and key design decisions
- `docs/crontab-format.md` - the on-disk crontab format the module manages
- `docs/data-flow.md` - read/write/import flows and consistency model

When making a major change to the module, update the relevant `docs/` page so
that the documentation stays accurate before opening a pull request.

## Running tests

Run the integration tests with Firefox instead of Chromium, as Chromium is not
installed in this development environment:

    TEST_BROWSER=firefox make check

To run a single test method against an already prepared image:

    TEST_OS=centos-9-stream TEST_BROWSER=firefox test/check-application TestApplication.testAddJob

`test/check-application --list` lists the available test methods.
