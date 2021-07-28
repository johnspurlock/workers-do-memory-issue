
import { createDurableObjectsNamespace, deleteDurableObjectsNamespace, deleteScript, listDurableObjectsNamespaces, putScript, updateDurableObjectsNamespace } from './cloudflare_api.ts';

const NAMESPACE_NAME = 'memory-issue-namespace';
const SCRIPT_NAME = 'memory-issue-repro';
const NAMESPACE_BINDING_NAME = 'memoryNamespace';
const DEBUG = false;

function readRequiredEnv(name: string): string {
    const rt = (Deno.env.get(name) || '').trim();
    if (rt.length === 0) throw new Error(`Need to set ${name}`);
    return rt;
}

function readCloudflareApiEnvs(): { accountId: string, apiToken: string } {
    const accountId = readRequiredEnv('CF_ACCOUNT_ID');
    const apiToken = readRequiredEnv('CF_API_TOKEN');
    return { accountId, apiToken };
}

async function push() {
    console.log('push!');

    console.log('bundling worker.ts into bundle.js...');
    let start = Date.now();
    const result = await Deno.emit('worker.ts', { bundle: 'module' });
    console.log(`bundle finished in ${Date.now() - start}ms`);

    if (result.diagnostics.length > 0) {
        console.warn(Deno.formatDiagnostics(result.diagnostics));
        throw new Error('bundle failed');
    }

    const scriptContentsStr = result.files['deno:///bundle.js'];
    if (typeof scriptContentsStr !== 'string') throw new Error(`bundle.js not found in bundle output files: ${Object.keys(result.files).join(', ')}`);
    const scriptContents = new TextEncoder().encode(scriptContentsStr);

    const { accountId, apiToken } = readCloudflareApiEnvs();

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
    start = Date.now();
    const script = await putScript(accountId, SCRIPT_NAME, scriptContents, [{ type: 'durable_object_namespace', name: NAMESPACE_BINDING_NAME, namespace_id: namespace.id }], apiToken);
    console.log(`put script ${SCRIPT_NAME} in ${Date.now() - start}ms`);
    if (DEBUG) console.log(script);

    if (typeof namespace.class !== 'string' || typeof namespace.script !== 'string') {
        console.log(`defining namespace ${NAMESPACE_NAME}...`);
        namespace = await updateDurableObjectsNamespace(accountId, apiToken, { ...namespace, class: 'MemoryDO', script: SCRIPT_NAME });
        console.log(`defined namespace ${NAMESPACE_NAME}`);
        if (DEBUG) console.log(namespace);
    }
}

async function teardown() {
    console.log('teardown!');

    const { accountId, apiToken } = readCloudflareApiEnvs();

    console.log(`deleting namespace ${NAMESPACE_NAME}...`);
    const namespace = (await listDurableObjectsNamespaces(accountId, apiToken)).find(v => v.name === NAMESPACE_NAME);
    if (namespace !== undefined) {
        await deleteDurableObjectsNamespace(accountId, apiToken, namespace.id);
        console.log(`deleted namespace ${NAMESPACE_NAME}`);
    } else {
        console.log(`namespace ${NAMESPACE_NAME} does not exist`);
    }

    console.log(`deleting script ${SCRIPT_NAME}...`);
    try {
        const deleteResult = await deleteScript(accountId, SCRIPT_NAME, apiToken);
        console.log(`deleted script ${SCRIPT_NAME}`);
        if (DEBUG) console.log(deleteResult);
    } catch (e) {
        if (typeof e.message === 'string' && e.message.includes('script_not_found')) {
            console.log(`script ${SCRIPT_NAME} does not exist`);
        } else {
            throw e;
        }
    }
}

try {
    const cmdFns: Record<string, () => Promise<void>> = {
        'push': push,
        'teardown': teardown,
    };
    const cmdFn = cmdFns[Deno.args[0]];
    if (cmdFn === undefined) throw new Error(`deno run --unstable --allow-env --allow-net --allow-read=. tool.ts <cmd>  # cmd one of: ${Object.keys(cmdFns).join(', ')}`);
    await cmdFn();
} catch (e) {
    Deno.stderr.writeSync(new TextEncoder().encode(e.message + '\n'));
    Deno.exit(1);
}
