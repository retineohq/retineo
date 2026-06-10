/**
 * RETINEO Core — Adapter IPC Protocol
 * JSON-RPC 2.0 over child_process stdin/stdout
 */

export interface JSONRPCRequest<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: T;
}

export interface JSONRPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard Error Codes
export const AdapterErrorCodes = {
  INVALID_REQUEST: 1000,
  UNSUPPORTED_MIME: 1001,
  PARSE_ERROR: 2000,
  TIMEOUT: 3000,
  INTERNAL_ERROR: 5000,
  OCR_FAILED: 5001,
  TRANSCRIPTION_FAILED: 5002,
} as const;

// Methods

export interface InitializeParams {
  workDir: string;
  config: Record<string, unknown>;
}

export interface InitializeResult {
  adapterId: string;
  version: string;
}

export interface CapabilitiesResult {
  mimeTypes: string[];
  extensions: string[];
}

export interface IngestParams {
  uri: string;
  mimeType?: string;
}

export interface IngestResult {
  content: string;           // normalized markdown
  metadata: {
    blocks: Array<{
      type: string;
      offset: number;
      length: number;
      timestamp?: number;
      speaker?: string;
      bbox?: [number, number, number, number];
      confidence?: number;
    }>;
  };
  segments?: Array<{
    spanStart: number;
    spanEnd: number;
    content: string;
    metadata: {
      blocks: Array<{
        type: string;
        offset: number;
        length: number;
        timestamp?: number;
        speaker?: string;
        bbox?: [number, number, number, number];
        confidence?: number;
      }>;
    };
  }>;
}

export interface ShutdownParams {
  graceful: boolean;
}

export type AdapterMethod =
  | { method: 'initialize'; params: InitializeParams; result: InitializeResult }
  | { method: 'capabilities'; params: undefined; result: CapabilitiesResult }
  | { method: 'ingest'; params: IngestParams; result: IngestResult }
  | { method: 'shutdown'; params: ShutdownParams; result: void };

// Transport
export interface AdapterTransport {
  send(request: JSONRPCRequest): Promise<JSONRPCResponse>;
  close(): Promise<void>;
}
