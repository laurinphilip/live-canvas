# Security policy

## Supported version

Security fixes are applied to the latest released version of Live Canvas.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose or damage user data. Use GitHub's **Security → Report a vulnerability** private reporting feature after the repository owner enables it.

Include the affected version, impact, reproduction steps, and any suggested mitigation. Do not include real private vault contents. If private vulnerability reporting is not enabled yet, contact the repository owner privately before sharing technical details.

## Security model

Live Canvas is local-first. It does not make network requests, send telemetry, require an account, or execute note contents. It reads note metadata through Obsidian and writes only to the configured Canvas file. Users must explicitly adopt a pre-existing target Canvas.
