/**
 * M11 Task 2: Fetch Engine
 * 
 * web_read and http_get with timeout handling and streaming
 */

export {
  http_get,
  web_read,
  stream_get,
  configureRetry,
  FetchError,
} from './fetch.js';

export type {
  FetchResponse,
  StreamingFetchResponse,
  HttpGetOptions,
  WebReadOptions,
  RetryConfig,
} from './fetch.js';
