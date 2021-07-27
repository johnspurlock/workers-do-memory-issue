import { APPLICATION_JSON, APPLICATION_JSON_UTF8 } from './constants.ts';

//#region Durable objects

export async function listDurableObjectsNamespaces(accountId: string, apiToken: string): Promise<readonly DurableObjectsNamespace[]> {
    const url = `${computeAccountBaseUrl(accountId)}/workers/durable_objects/namespaces`;
    return (await execute('listDurableObjectsNamespaces', 'GET', url, apiToken) as ListDurableObjectsNamespacesResponse).result;
}

export async function createDurableObjectsNamespace(accountId: string, apiToken: string, payload: { name: string, script?: string, class?: string}): Promise<DurableObjectsNamespace> {
    const url = `${computeAccountBaseUrl(accountId)}/workers/durable_objects/namespaces`;
    return (await execute('createDurableObjectsNamespace', 'POST', url, apiToken, JSON.stringify(payload)) as CreateDurableObjectsNamespaceResponse).result;
}

export async function updateDurableObjectsNamespace(accountId: string, apiToken: string, payload: { id: string, name?: string, script?: string, class?: string }): Promise<DurableObjectsNamespace> {
    const url = `${computeAccountBaseUrl(accountId)}/workers/durable_objects/namespaces/${payload.id}`;
    return (await execute('updateDurableObjectsNamespace', 'PUT', url, apiToken, JSON.stringify(payload)) as UpdateDurableObjectsNamespaceResponse).result;
}

export async function deleteDurableObjectsNamespace(accountId: string, apiToken: string, namespaceId: string): Promise<void> {
    const url = `${computeAccountBaseUrl(accountId)}/workers/durable_objects/namespaces/${namespaceId}`;
    await execute('deleteDurableObjectsNamespace', 'DELETE', url, apiToken) as CloudflareApiResponse;
}

//#endregion

//#region Worker scripts

export async function putScript(accountId: string, scriptName: string, scriptContents: Uint8Array, bindings: Binding[], apiToken: string): Promise<Script> {
    const url = `${computeAccountBaseUrl(accountId)}/workers/scripts/${scriptName}`;
    const formData = new FormData();
    const metadata = { 'main_module': 'main', bindings, 'usage_model': 'bundled' };
    const metadataBlob = new Blob([ JSON.stringify(metadata) ], { type: APPLICATION_JSON });
    const scriptBlob = new Blob([ scriptContents.buffer ], { type: 'application/javascript+module' });
    formData.set('metadata', metadataBlob);
    formData.set('script', scriptBlob, 'main');
    return (await execute('putScript', 'PUT', url, apiToken, formData) as PutScriptResponse).result;
}

export async function deleteScript(accountId: string, scriptName: string, apiToken: string): Promise<DeleteScriptResult> {
    const url = `${computeAccountBaseUrl(accountId)}/workers/scripts/${scriptName}`;
    return (await execute('deleteScript', 'DELETE', url, apiToken) as DeleteScriptResponse).result;
}

//#endregion

//

const DEBUG = false;

function computeAccountBaseUrl(accountId: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
}

async function execute(op: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, apiToken: string, body?: string /*json*/ | FormData): Promise<CloudflareApiResponse> {
    const headers = new Headers({ 'Authorization': `Bearer ${apiToken}`});
    if (typeof body === 'string') {
        headers.set('Content-Type', APPLICATION_JSON_UTF8);
        if (DEBUG) console.log(body);
    }
    const fetchResponse = await fetch(url, { method, headers, body });
    const contentType = fetchResponse.headers.get('Content-Type') || '';
    if (![APPLICATION_JSON_UTF8, APPLICATION_JSON].includes(contentType)) throw new Error(`Unexpected content-type: ${contentType}, fetchResponse=${fetchResponse}, body=${await fetchResponse.text()}`);
    const apiResponse = await fetchResponse.json() as CloudflareApiResponse;
    if (DEBUG) console.log(apiResponse);
    if (!apiResponse.success) {
        throw new Error(`${op} failed: errors=${apiResponse.errors.map(v => `${v.code} ${v.message}`).join(', ')}`);
    }
    return apiResponse;
}

//

export type Binding = DurableObjectNamespaceBinding;

export interface DurableObjectNamespaceBinding {
    readonly type: 'durable_object_namespace';
    readonly name: string;
    readonly 'namespace_id': string;
}

export interface Message {
    readonly code: number;
    readonly message: string;
}

export interface CloudflareApiResponse {
    readonly success: boolean;
    readonly errors: readonly Message[];
    readonly messages?: readonly Message[];
}

export interface ListDurableObjectsNamespacesResponse extends CloudflareApiResponse {
    readonly result: readonly DurableObjectsNamespace[];
}

export interface CreateDurableObjectsNamespaceResponse extends CloudflareApiResponse {
    readonly result: DurableObjectsNamespace;
}

export interface UpdateDurableObjectsNamespaceResponse extends CloudflareApiResponse {
    readonly result: DurableObjectsNamespace;
}

export interface DurableObjectsNamespace {
    readonly id: string;
    readonly name: string;
    readonly script: string | null;
    readonly class: string | undefined;
}

export interface PutScriptResponse extends CloudflareApiResponse {
    readonly result: Script;
}

export interface Script {
    readonly id: string;
    readonly etag: string;
    readonly handlers: readonly string[];
    readonly 'named_handlers'?: readonly NamedHandler[];
    readonly 'modified_on': string;
    readonly 'created_on': string;
    readonly 'usage_model': string;
}

export interface NamedHandler {
    readonly name: string;
    readonly handlers: readonly string[];
}

export interface DeleteScriptResponse extends CloudflareApiResponse {
    readonly result: DeleteScriptResult;
}

export interface DeleteScriptResult {
    readonly id: string;
}
