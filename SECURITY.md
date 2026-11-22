# Security

If you find a security issue, please report it privately through GitHub's
[private vulnerability reporting](https://github.com/Kerd3/screening-room/security/advisories/new)
rather than in a public issue.

## How the project protects itself

- **Dependencies:** Dependabot opens weekly update pull requests and security fixes; CI must pass before they merge.
- **Secrets:** API keys and database URLs live in Vercel and GitHub Actions secrets, never in the repository. GitHub secret scanning with push protection blocks accidental commits of credentials.
- **Code scanning:** CodeQL analyses every push and pull request.
- **Branch protection:** `main` requires the CI checks to pass and can't be force-pushed or deleted.
- **App:** passwords are hashed with bcrypt; sessions are encrypted, httpOnly cookies; every API input is validated with Zod; write endpoints are rate limited per user or IP.
