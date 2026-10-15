# ACT III hosted demo verification — Issue #142

**Checked:** 2026-10-14 19:46 BRT (clean browser session)
**Status:** `#142_BLOCKED_UNKNOWN_DEPLOY_REVISION`

## Release candidate

- Repository: `santleme/riose-agro`
- Release branch: `release/amd-act-iii`
- Release SHA: `0d79e416a5297b846274001d3b3281a1e674c674`
- Issue branch: `actiii/142-deploy-sha`
- Public URL:

## Public demo smoke check

Opened the public URL in a newly created browser tab without signing in. The app loaded as **Agroville — laboratório de fazendas**. The HTML, `style.css`, and `app.js` each returned HTTP 200. The page and those assets contain no `localhost`, `127.0.0.1`, or `file://` references.

Configured the scenario to **Mais concentrado**. The simulation advanced to day 3. The 30-day comparison rendered with a 415.9 kg scenario result versus the 386.7 kg reference, and R$ 4,838 scenario feeding cost. The comparison disclaimer remained visible: results are illustrative and do not predict real performance or guide nutrition decisions. No authentication prompt or visible application error occurred.

## Deployment identity and limits

- The expected release SHA is the branch SHA above.
- The hosted page exposes no Git SHA, release branch, build timestamp, version endpoint, or deployment identifier. Its HTML identifies the app only as Agroville MVP 0.1.
- HTTP responses show Cloudflare as the edge server. This does not establish the origin host or deployment provider.
- No hosting/deploy configuration or deployment workflow is present in the repository. The connected OpenAI Sites account has one RIOSE project (RIOSE — Guided demo), but its live URL differs from the README demo URL. Its only saved version uses SHA `67da619d17d1c44c6563a35993808be03052d6f8`, which is absent from `santleme/riose-agro`; it cannot establish the README demo's deployed revision.
- Browser console and detailed network logs were not available through the clean-session browser surface used for this check; successful document and asset requests plus the completed interaction flow are the available evidence.

Therefore the demo is functional, but its deployed revision cannot be verified as `0d79e416a5297b846274001d3b3281a1e674c674`. No release binding or redeployment is claimed.

## Current candidate checkpoint

The release branch has since advanced to `e897c53b2d99ae0ae4de9db31ece281375bf96b1`. Issue #142 remains open, and its current issue body/comment history does not record a verified public URL or deployed SHA for this candidate. The browser observations above concern the earlier source SHA only and do not verify the current candidate. The judge-facing README therefore omits a deployment URL until #142 records a verified one.
