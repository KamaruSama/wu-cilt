# Security policy

## Supported version

Only the latest `main` branch is supported.

## Reporting a vulnerability

Please do not publish security vulnerabilities, exposed credentials, session cookies, or personal data in a public issue.

Email [contact@likezara.com](mailto:contact@likezara.com) with:

- a concise description and reproduction steps;
- the affected path or feature;
- the likely impact; and
- a safe way to contact you for follow-up.

Do not send real CILT credentials, OTPs, or copied public-ticket text that contains personal data. Acknowledgement and remediation will be coordinated privately.

## Security boundaries

- CILT credentials are handled at request time and are not recorded as user records.
- An upstream CILT session cookie exists only in the server-side Redis session store for up to 15 minutes.
- Public tickets are intentionally permanent and public; the form accepts text only and rejects links, files, and common personal-data patterns.
- Deployment secrets belong in the deployment secret store, never in Git.
