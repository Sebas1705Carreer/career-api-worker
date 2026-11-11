# Security policy

This is a personal project maintained by one person. Security reports are welcome and handled on a best-effort basis, with no guaranteed response time.

## Supported versions

Only the latest code on the `development` branch is supported. There are no maintained older releases.

## Reporting a vulnerability

Please report it **privately**, not in a public issue or pull request:

1. Open the **Security** tab of [Sebas1705Carreer/career-api-worker](https://github.com/Sebas1705Carreer/career-api-worker/security).
2. Choose **Report a vulnerability** (GitHub private vulnerability reporting).

If that button is not available, open a public issue that only says you need a private channel for a security report, with no technical details, and a way to reach you will be arranged.

Useful to include: what is affected, steps to reproduce, the impact you expect, and a suggested fix if you have one. Never include real secrets or tokens in a report.

## Scope

The Worker behind https://api.sebas1705.dev: authentication of write routes, rate limiting, input validation, security headers, and anything that could let someone read or change data without the API token. The read endpoints are public by design.

Out of scope: findings that need a compromised device or account, social engineering, denial of service by sheer traffic volume, and issues in third-party services (GitHub, Cloudflare, Firebase) themselves.
