# Written by MCP Forge. Collects per-test results and prints one machine readable line.
import json

_RESULTS = []


def pytest_runtest_logreport(report):
    failed_setup = report.when == "setup" and report.outcome != "passed"
    if report.when == "call" or failed_setup:
        _RESULTS.append({
            "name": report.nodeid.split("::")[-1],
            "outcome": report.outcome,
            "detail": (report.longreprtext or "")[-1500:] if report.outcome != "passed" else "",
            "secs": round(report.duration, 3),
        })


def pytest_collectreport(report):
    if report.outcome == "failed":
        _RESULTS.append({"name": "collect " + str(report.nodeid), "outcome": "failed",
                         "detail": (report.longreprtext or "")[-1500:], "secs": 0})


def pytest_sessionfinish(session, exitstatus):
    print("\nFORGE_RESULT " + json.dumps({"exit": int(exitstatus), "tests": _RESULTS}))
