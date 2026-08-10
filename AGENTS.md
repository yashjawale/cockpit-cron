# Cockpit Cron

## Running tests

Run the integration tests with Firefox instead of Chromium, as Chromium is not
installed in this development environment:

    TEST_BROWSER=firefox make check

To run a single test method against an already prepared image:

    TEST_OS=centos-9-stream TEST_BROWSER=firefox test/check-application TestApplication.testAddJob

`test/check-application --list` lists the available test methods.
