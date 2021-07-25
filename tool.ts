
import { existsSync } from './deps_tool.ts';
import { createDurableObjectsNamespace, listDurableObjectsNamespaces, putScript, updateDurableObjectsNamespace } from './cloudflare_api.ts';

const NAMESPACE_NAME = 'memory-issue-namespace';
const SCRIPT_NAME = 'memory-issue-repro';
const NAMESPACE_BINDING_NAME = 'memoryNamespace';
const DEBUG = false;

function readRequiredEnv(name: string): string {
    const rt = (Deno.env.get(name) || '').trim();
    if (rt.length === 0) throw new Error(`Need to set ${name}`);
    return rt;
}

async function push() {
    console.log('push!');

    if (!existsSync('worker.js')) throw new Error('worker.js does not exists, did you run: deno bundle worker.ts worker.js');
    const scriptContents = Deno.readFileSync('worker.js');
    
    const accountId = readRequiredEnv('CF_ACCOUNT_ID');
    const apiToken = readRequiredEnv('CF_API_TOKEN');

    let namespace = (await listDurableObjectsNamespaces(accountId, apiToken)).find(v => v.name === NAMESPACE_NAME);
    if (namespace === undefined) {
        console.log(`creating namespace ${NAMESPACE_NAME}...`);
        namespace = await createDurableObjectsNamespace(accountId, apiToken, { name: NAMESPACE_NAME });
        console.log(`created namespace ${NAMESPACE_NAME}`);
    } else {
        console.log(`${NAMESPACE_NAME} namespace exists`);
    }
    if (DEBUG) console.log(namespace);

    console.log(`putting script ${SCRIPT_NAME}...`);
    const start = Date.now();
    const script = await putScript(accountId, SCRIPT_NAME, scriptContents, [{ type: 'durable_object_namespace', name: NAMESPACE_BINDING_NAME, namespace_id: namespace.id }], apiToken);
    console.log(`put script ${SCRIPT_NAME} in ${Date.now() - start}ms`);
    if (DEBUG) console.log(script);

    if (typeof namespace.class !== 'string' || typeof namespace.script !== 'string') {
        console.log(`updating namespace ${NAMESPACE_NAME}...`);
        namespace = await updateDurableObjectsNamespace(accountId, apiToken, { ...namespace, class: 'MemoryDO', script: SCRIPT_NAME });
        console.log(`updated namespace ${NAMESPACE_NAME}`);
        if (DEBUG) console.log(namespace);
    }
}

try {
    const cmdFns: Record<string, () => Promise<void>> = {
        'push': push,
    };
    const cmdFn = cmdFns[Deno.args[0]];
    if (cmdFn === undefined) throw new Error(`deno run --unstable --allow-env --allow-net --allow-read=. tool.ts <cmd>  # cmd one of: ${Object.keys(cmdFns).join(', ')}`);
    await cmdFn();
} catch (e) {
    Deno.stderr.writeSync(new TextEncoder().encode(e.message + '\n'));
    Deno.exit(1);
}
