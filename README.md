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

From the cloudflare dashboard, deploy the new worker `memory-issue-repro` to a route.  Once deployed, there are three data endpoints: `put`, `query`, and `clear`.  Each endpoint takes a trailing `n` path token to indicate how many objects to create for the scenario (n = 1 to 50).

Example using n = 20

First, ensure the data is generated and saved to DO storage:
 - Hit `https://memory-issue-repro.your-subdomain.workers.dev/put/20` until the `dataLoadedPercentage` reaches `100`

To query all objects at once, each one will load from storage on the initial request:
 - Hit `https://memory-issue-repro.your-subdomain.workers.dev/query/20`
 - It's expected that the first request might take the slow path (objects will load from storage, and `loadeds.length` > 0), but subsequent requests should be fast (`loadeds.length` == 0)
 - The issue seems to be that once you have a large enough `n`, DO instances will be loaded inside the same isolate/process and thus compete for the same memory limit and storage api calls.  You'll see the slow path for subsequent requests when this happens, which is unexpected.
 - Observe `processInstances` to see how many DO instances are mapped into which process.

To clear all data from all instances:
 - Hit `https://memory-issue-repro.your-subdomain.workers.dev/clear/20`


There is also one instance-level endpoint called `hang`, it also takes a trailing number path token but in this case it represent which object instance to target

To cause a intentional hanging request to one of the objects:
 - Hit `https://memory-issue-repro.your-subdomain.workers.dev/hang/17` to target object 17
