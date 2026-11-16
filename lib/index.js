/**
 * dsh-wide-chat —— host 半。
 *
 * 这个插件全部逻辑都在浏览器端（lib/client.js）。
 * host 这一半是**故意空的**：DSH 的 loader 只会挂载 cordis.patch.yml 里
 * insert 的那些行，每一行都必须能 import 到一个真正的模块；空 apply
 * 就是「我不占服务、不注册工具，只是存在」。
 *
 * 为什么不干脆省掉这份文件：省掉 loader 会报找不到入口，
 * 整个 bundle 加载失败，客户端那一半也不会下载 —— 表现是"装了没反应"。
 */
export const name = 'dsh-wide-chat'

export function apply() {
  // 有意留空。
}
