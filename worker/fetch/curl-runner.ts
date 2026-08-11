/**
 * curl 回退运行器注册表 —— 纯接口，无 Node 依赖。
 *
 * 系统 curl 是 Node 独有能力（Worker 无子进程）。Node 侧通过
 * `curl.ts` 注册实现；Worker 侧不注册，回退逻辑自动跳过
 * （Cloudflare fetch 栈不受 TLS 指纹拦截影响）。
 */

export interface CurlResult {
  stdout: string;
}

export type CurlRunner = (
  args: string[],
  options: { timeout: number; maxBuffer?: number },
) => Promise<CurlResult>;

let runner: CurlRunner | null = null;

/** Node 侧注册系统 curl 实现（worker/fetch/curl.ts 自注册）。 */
export function registerCurlRunner(r: CurlRunner): void {
  runner = r;
}

/** 获取已注册的 curl 实现；Worker 运行时返回 null。 */
export function getCurlRunner(): CurlRunner | null {
  return runner;
}
