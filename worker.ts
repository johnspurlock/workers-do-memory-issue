import { ModuleWorkerContext, DurableObjectNamespace } from './deps.ts';
import { APPLICATION_JSON_UTF8 } from './constants.ts';
import { ClearRequest, FailureResponse, PutRequest, QueryRequest, Result, SuccessResponse } from './memory_do_rpc.d.ts';
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

async function handleRequest(request: Request, memoryNamespace: DurableObjectNamespace): Promise<Response> {
    const url = new URL(request.url);

    const m = /^\/([a-z]+)\/(\d+)$/.exec(url.pathname);
    if (m) {
        const path = m[1];
        const n = parseInt(m[2]);
        if (!(n >= 1 && n <= 30)) throw new Error(`n should be between 1 and 30`);

        if (path === 'hang') {
            const objectName = computeObjectName(n);
            return await fetchFromObject('/hang', {}, memoryNamespace, objectName);
        }
        const requestBody = computeRequestBody(path);
        if (requestBody !== undefined) {
            const numObjects = n;
            const objectNames = computeObjectNames(numObjects);
            const results = await Promise.allSettled(computeObjectNames(numObjects).map(v => computeResponse(requestBody, memoryNamespace, v)));
            const responses: NamedObjectResponse[] = [];
            for (let i = 0; i < results.length; i++) {
                responses.push(convertPromiseSettledResult(results[i], objectNames[i]));
            }
            const summary = computeSummary(numObjects, responses);
            return new Response(JSON.stringify({ summary, responses }, undefined, 2), { headers: { 'Content-Type': APPLICATION_JSON_UTF8 } });
        }
    }
    return new Response('404', { status: 404 });
}

function computeSummary(numObjects: number, responses: NamedObjectResponse[]): unknown {
    const expectedChunks = 4096 * numObjects;
    let actualChunks = 0;
    const processInstances: Record<string, number> = {};
    const loadeds = [];
    for (const { objectName, responseObject } of responses) {
        if (responseObject.success) {
            actualChunks += responseObject.memoryChunks;
            processInstances[responseObject.staticId] = (processInstances[responseObject.staticId] || 0) + 1;
            if (responseObject.ensureLoadedMillis > 0) {
                loadeds.push(`${objectName} in ${responseObject.ensureLoadedMillis}ms`);
            }
        }
    }
    const dataLoadedPercentage = actualChunks / expectedChunks * 100;
    return { numObjects, dataLoadedPercentage, processInstances, loadeds };
}

function computeObjectNames(numObjects: number): string[] {
    const rt: string[] = [];
    for (let n = 1; n <= numObjects; n++) {
        rt.push(computeObjectName(n));
    }
    return rt;
}

function computeObjectName(n: number): string {
    return `feed-2021-07-${n.toString().padStart(2, '0')}`;
}

function computeRequestBody(path: string): PutRequest | QueryRequest | ClearRequest | undefined {
    if (path === 'put') return { kind: 'put' } as PutRequest;
    if (path === 'query') return { kind: 'query' } as QueryRequest;
    if (path === 'clear') return { kind: 'clear' } as ClearRequest;
    return undefined;
}

async function fetchFromObject(url: string, bodyObj: unknown, memoryNamespace: DurableObjectNamespace, objectName: string): Promise<Response> {
    const body = JSON.stringify(bodyObj);
    return await memoryNamespace.get(memoryNamespace.idFromName(objectName)).fetch(url, { method: 'POST', body });
}

async function computeResponse(body: unknown, memoryNamespace: DurableObjectNamespace, objectName: string): Promise<NamedObjectResponse> {
    const res = await fetchFromObject('/', body, memoryNamespace, objectName);
    const responseObject = await res.json() as ObjectResponse;
    return { objectName, responseObject };
}

function convertPromiseSettledResult(result: PromiseSettledResult<NamedObjectResponse>, objectName: string): NamedObjectResponse {
    if (result.status === 'fulfilled') return result.value;
    const responseObject = {
        success: false,
        error: `type=${typeof result.reason} reason=${result.reason} stack=${typeof result.reason === 'object' ? result.reason.stack : undefined}`,
        side: 'client',
    } as FailureResponse;
    return { objectName, responseObject };
}

//

type NamedObjectResponse = { objectName: string, responseObject: ObjectResponse };
type ObjectResponse = SuccessResponse<Result> | FailureResponse;