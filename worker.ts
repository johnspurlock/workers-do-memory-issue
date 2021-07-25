import { ModuleWorkerContext, DurableObjectNamespace } from './deps.ts';
import { APPLICATION_JSON_UTF8 } from './constants.ts';
import { ClearRequest, ClearResponse, PutRequest, PutResponse, QueryRequest, QueryResponse } from './memory_do_rpc.d.ts';
import { WorkerEnv } from './worker_types.d.ts';
export { MemoryDO } from './memory_do.ts';

export default {

    async fetch(request: Request, env: WorkerEnv, _ctx: ModuleWorkerContext): Promise<Response> {
        try {
            return await handleRequest(request, env.memoryNamespace);
        } catch (e) {
            return new Response(`${e.stack || e}`, { status: 500 });
        }
    },

};

//

const DO_INSTANCE_NAME = 'singleton';

async function handleRequest(request: Request, memoryNamespace: DurableObjectNamespace): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/hang') {
        return await fetchFromSingletonDO('/hang', {}, memoryNamespace);
        
    }
    if (url.pathname === '/put') {
        const body: PutRequest = { kind: 'put' };
        const res = await fetchFromSingletonDO('/', body, memoryNamespace);
        const putResponse = await res.json() as PutResponse;
        return new Response(JSON.stringify(putResponse, undefined, 2), { headers: { 'Content-Type': APPLICATION_JSON_UTF8 } });
    }
    if (url.pathname === '/query') {
        const body: QueryRequest = { kind: 'query' };
        const res = await fetchFromSingletonDO('/', body, memoryNamespace);
        const queryResponse = await res.json() as QueryResponse;
        return new Response(JSON.stringify(queryResponse, undefined, 2), { headers: { 'Content-Type': APPLICATION_JSON_UTF8 } });
    }
    if (url.pathname === '/clear') {
        const body: ClearRequest = { kind: 'clear' };
        const res = await fetchFromSingletonDO('/', body, memoryNamespace);
        const clearResponse = await res.json() as ClearResponse;
        return new Response(JSON.stringify(clearResponse, undefined, 2), { headers: { 'Content-Type': APPLICATION_JSON_UTF8 } });
    }
    return new Response('404', { status: 404 });
}

async function fetchFromSingletonDO(url: string, bodyObj: unknown, memoryNamespace: DurableObjectNamespace): Promise<Response> {
    const body = JSON.stringify(bodyObj);
    return await memoryNamespace.get(memoryNamespace.idFromName(DO_INSTANCE_NAME)).fetch(url, { method: 'POST', body });
}
