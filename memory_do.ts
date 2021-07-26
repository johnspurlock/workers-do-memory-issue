import { DurableObjectState } from './deps.ts';
import { DurableObjectEnv } from './worker_types.d.ts';
import { APPLICATION_JSON_UTF8 } from './constants.ts';
import { ClearRequest, ClearResult, FailureResponse, PutRequest, PutResult, QueryRequest, QueryResult, Req, Result, SuccessResponse } from './memory_do_rpc.d.ts';
import { generateUuid } from './uuid_v4.ts';

export class MemoryDO {
    readonly state: DurableObjectState;
    readonly env: DurableObjectEnv;
    readonly instanceId: string;

    loaded = false;
    loadedChunks = 0;
    loadedRecords = 0;
    loadedSize = 0;
    loadedListCalls = 0;
    chunks = new Map<string, Chunk>(); // chunkKey -> Chunk

    constructor(state: DurableObjectState, env: DurableObjectEnv) {
        this.state = state;
        this.env = env;
        if (_staticId === undefined) _staticId = computeUniqueId();
        this.instanceId = computeUniqueId();
    }

    async fetch(request: Request): Promise<Response> {
        const hangRes = await tryHandleHang(request); if (hangRes) return hangRes;
        
        return await this.computeResponse(request);
    }

    //

    private async computeResponse(request: Request): Promise<Response> {
        let ensureLoadedMillis: number | undefined;
        const version = 1;
        const staticId = _staticId;
        const instanceId = this.instanceId;
        let loadedChunks: number | undefined;
        let loadedRecords: number | undefined;
        let loadedSize: number | undefined;
        let loadedListCalls: number | undefined;
        let memoryChunks: number | undefined;

        try {
            const start = Date.now();
            await this.ensureLoaded();
            ensureLoadedMillis = Date.now() - start;
            loadedChunks = this.loadedChunks;
            loadedRecords = this.loadedRecords;
            loadedSize = this.loadedSize;
            loadedListCalls = this.loadedListCalls;
            const req = await request.json() as Req;
            const result = await this.computeResult(req);
            memoryChunks = this.chunks.size;
            
            return new Response(JSON.stringify({ success: true, version, ensureLoadedMillis, staticId, instanceId, loadedChunks, loadedRecords, loadedSize, loadedListCalls, memoryChunks, result } as SuccessResponse<Result>, undefined, 2), { headers });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, version, ensureLoadedMillis, staticId, instanceId, loadedChunks, loadedRecords, loadedSize, loadedListCalls, memoryChunks, side: 'do', error: `${e.stack || e}` } as FailureResponse, undefined, 2), { headers });
        }
    }

    private async ensureLoaded() {
        if (this.loaded) return;

        const limit = 512; // watch out, too large and it will hang!!  kenton says 16mb
        let start: string | undefined;
        while (true) {
            const results = await this.state.storage.list({ prefix: CHUNK_PREFIX, limit, start });
            this.loadedListCalls++;
            for (const [chunkKey, chunkObj] of results) {
                if (chunkKey === start) continue; // start = inclusive
                const chunk = chunkObj as Chunk;
                this.chunks.set(chunkKey, chunk);
                this.loadedChunks++;
                this.loadedRecords += Object.keys(chunk).length;
                this.loadedSize += JSON.stringify(chunkObj).length;
                if (start === undefined || chunkKey > start) {
                    start = chunkKey;
                }
            }
            // if (this.loadedChunks > 3500) break;
            if (results.size < limit) break;
        }
        this.loaded = true;
    }

    private async computeResult(req: Req): Promise<Result> {
        if (req.kind === 'put') {
            return await this.computePutResult(req);
        }
        if (req.kind === 'query') {
            return this.computeQueryResult(req);
        }
        if (req.kind === 'clear') {
            return this.computeClearResult(req);
        }
        throw new Error(`computeResult: Unsupported kind: ${req['kind']}`);
    }

    private computeQueryResult(_req: QueryRequest): QueryResult {
        let lineStrings = 0;
        for (const chunk of this.chunks.values()) {
            for (const [_id, _lineString] of Object.entries(chunk)) {
                lineStrings++;
            }
        }
        return { kind: 'query', counts: {}, ids: undefined, debug: `lineStrings=${lineStrings}` } as QueryResult;
    }

    private async computePutResult(_req: PutRequest): Promise<PutResult> {
        const updateCount = 0;
        const attributesUpdateCount = 0;

        const toInsert: Record<string, Chunk> = {};
        let toInserts = 0;
        for (let i = 0; i < 4096; i++) {
            const chunkId = i.toString(16).padStart(3, '0');
            const chunkKey = computeChunkKey(chunkId);
            if (!this.chunks.has(chunkKey)) {
                const chunk = generateChunk();
                toInsert[chunkKey] = chunk;
                toInserts++;
                if (toInserts === 1024) break; // limit the number to insert in one go, to avoid excess cpu issues
            }
        }
        const insertKeys = Object.keys(toInsert);
        const insertCount = insertKeys.length;
        while (insertKeys.length > 0) {
            const batch: Record<string, Chunk> = {};
            for (let i = 0; i < Math.min(insertKeys.length, 128); i++) {
                const key = insertKeys.shift()!;
                batch[key] = toInsert[key];
                delete toInsert[key];
            }
            await this.state.storage.put(batch);
            for (const [key, value] of Object.entries(batch)) {
                this.chunks.set(key, value);
            }
        }

        return { kind: 'put', insertCount, updateCount, attributesUpdateCount } as PutResult;
    }

    private async computeClearResult(_req: ClearRequest): Promise<ClearResult> {
        await this.state.storage.deleteAll();
        this.chunks.clear();
        return { kind: 'clear' } as ClearResult;
    }

}

//

const DATA_VERSION = 1;
const CHUNK_PREFIX = `v${DATA_VERSION}-chunk-`;

let _staticId: string | undefined;

const headers: HeadersInit = { 'Content-Type': APPLICATION_JSON_UTF8 };

async function tryHandleHang(request: Request): Promise<Response | undefined> {
    if (!(request.method === 'POST' && /^https:\/\/[a-z-]+\/hang$/.test(request.url))) return undefined;
    // await new Promise(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000000000));
    return new Response(`after hang ???`, { status: 200 });
}

function computeChunkKey(chunkId: string): string {
    return `${CHUNK_PREFIX}${chunkId}`;
}

function generateChunk(): Chunk {
    const chunk: Chunk = {};
    // try to hit 3.1k
    for (let i = 0; i < 31; i++) {
        chunk[`item${i}`] = 'x'.repeat(100);
    }
    return chunk;
}

function computeUniqueId() {
    return `${new Date().toISOString()}-${generateUuid().split('-').pop()}`;
}

//

type Chunk = Record<string, string>;
