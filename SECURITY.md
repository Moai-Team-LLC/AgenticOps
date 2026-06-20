# Security Policy

## Supported versions

AgenticOps is pre-1.0; security fixes land on the latest `0.x` minor.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue or PR.

Use GitHub's private vulnerability reporting: the repository's **Security** tab →
**Report a vulnerability**. We aim to acknowledge within 5 business days and to
share a remediation timeline after triage.

Helpful details: affected version or commit, reproduction steps, and impact.
Coordinated disclosure is appreciated.

## Scope notes

AgenticOps is an operations substrate. When deploying it, the usual agent threat
model still applies — enforce least-privilege identities, scope credentials
(never commit them), and treat tool output and ingested content as untrusted.
See the Agentic Product Standard's Layer 8 (Security & Identity) for the full
model.
