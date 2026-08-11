/**
 * Node-only：系统 curl 回退实现。
 *
 * 仅 Node 管线路由（fetch-backend / runner）import 此文件；Worker 打包
 * 不包含它（curl-runner 注册表保持 null，回退逻辑跳过）。
 *
 * 用途：部分 CDN（openai.com 等）按 Node TLS 指纹拦截 403，但接受 curl 的
 * TLS 栈。与 scripts/update/fetch.ts 行为对齐。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerCurlRunner, type CurlRunner } from './curl-runner';

const execFileAsync = promisify(execFile);

const curlRunner: CurlRunner = (args, options) =>
  execFileAsync('curl', args, {
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
    timeout: options.timeout,
  });

registerCurlRunner(curlRunner);
