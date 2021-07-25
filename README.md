# workers-do-memory-issue
Minimal repro example for the recent Workers DO issue where objects will reset immediately without throwing errors

After cloning the repo locally, set the two required env variables:
 - `export CF_ACCOUNT_ID=<cloudflare account id hex string>`
 - `export CF_API_TOKEN=<cloudflare api token with Workers Scripts:Edit rights>`

Ensure `deno` is installed (it's [easy to install](https://deno.land/#installation))

Build the module js worker script:
 - `deno bundle worker.ts worker.js`

Upload the module js worker script:
 - `deno run --unstable --allow-env --allow-net --allow-read=. tool.ts push`

From the cloudflare dashboard, deploy the new worker `memory-issue-repro` to a route.  Once deployed, there are three endpoints:
 - `https://memory-issue-repro.your-subdomain.workers.dev/put`: Loads initial data to durable object storage
 - `https://memory-issue-repro.your-subdomain.workers.dev/query`: Simulates read from the durable object, with initial load from storage
 - `https://memory-issue-repro.your-subdomain.workers.dev/hang`: Intential hang, useful for catching DO reset errors
