export type Req = PutRequest | QueryRequest | ClearRequest;
export type Result = PutResult | QueryResult | ClearResult;

export interface SuccessResponse<TResult> {
    readonly success: true;
    readonly version: number;
    readonly ensureLoadedMillis: number;
    readonly processId: string;
    readonly instanceId: string;
    readonly loadedChunks: number;
    readonly loadedRecords: number;
    readonly loadedSize: number;
    readonly loadedListCalls: number;
    readonly memoryChunks: number;
    readonly result: TResult;
}

export interface FailureResponse {
    readonly success: false;
    readonly version?: number;
    readonly ensureLoadedMillis?: number;
    readonly processId?: string;
    readonly instanceId?: string;
    readonly loadedChunks?: number;
    readonly loadedRecords?: number;
    readonly loadedSize?: number;
    readonly loadedListCalls?: number;
    readonly memoryChunks?: number;
    readonly error: string;
    readonly side: string;
}

//#region Put

export interface PutRequest {
    readonly kind: 'put';
}

export interface PutResult {
    readonly kind: 'put';
    readonly updateCount: number;
    readonly insertCount: number;
    readonly attributesUpdateCount: number;
    readonly debug?: string;
}

export type PutResponse = SuccessResponse<PutResult> | FailureResponse;

//#endregion

//#region Query

export interface QueryRequest {
    readonly kind: 'query';
}   

export interface QueryResult {
    readonly kind: 'query';
    readonly counts: Record<string, number>[];
    readonly ids?: Record<string, string[]>[];
    readonly debug?: string;
}

export type QueryResponse = SuccessResponse<QueryResult> | FailureResponse;

//#endregion

//#region Clear

export interface ClearRequest {
    readonly kind: 'clear';
}   

export interface ClearResult {
    readonly kind: 'clear';
}

export type ClearResponse = SuccessResponse<ClearResult> | FailureResponse;

//#endregion
