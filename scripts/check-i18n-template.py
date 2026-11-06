"""Smoke-check that all supported source formats are in the gettext template."""

import pathlib
import re
import sys


def main():
    pot = pathlib.Path(sys.argv[1]).read_text()
    assert re.search(r'#: .*src/index\.html:\d+.*\nmsgid "Cockpit Cron"', pot)
    assert re.search(r'#: .*src/manifest\.json:\d+.*\nmsgid "Cron jobs"', pot)
    assert re.search(r'#: .*src/components/LevelSwitcher\.tsx:\d+.*\nmsgid "Cron job level"', pot)
    assert re.search(
        r'#: .*in\.yashjawale\.cockpit_cron\.metainfo\.xml:\d+.*\n'
        r'msgid "Cockpit plugin for managing cron jobs"', pot)
    assert re.search(
        r'msgid "\$0 cron job is not managed by this plugin"\s+'
        r'msgid_plural "\$0 cron jobs are not managed by this plugin"', pot)
    assert '#-#-#-#-#' not in pot
    assert pot.startswith('# Cockpit Cron translation template.\n')
    assert 'Report-Msgid-Bugs-To: https://github.com/yashjawale/cockpit-cron/issues' in pot


if __name__ == "__main__":
    main()
