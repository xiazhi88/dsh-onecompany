import { TYPERT } from '../host/typert.ts'

/**
 * 浏览器端 Remote 装配。
 *
 * 注意：客户端的 generated Remote 装配**要求 strict codec（zod 实例）**，
 * 因此这里必须带上 host 清单的 zod schema——代价是 zod 会被内联进浏览器包
 * （约 700KB，gzip 后约 200KB，浏览器按 rev 缓存）。曾试过构建期生成
 * 纯数据 + src-json 描述符（包体 137KB），但被装配层拒绝：
 * `client api: generated Remote <field> has no strict codec`。
 */
export const TYPERT_REMOTE = {
  package: TYPERT.package,
  descriptors: TYPERT.invocations.map(({
    id, service, namespace, method, invocation, parameters, result,
  }) => ({
    id,
    service,
    namespace,
    method,
    invocation,
    parameters,
    result,
  })),
}
