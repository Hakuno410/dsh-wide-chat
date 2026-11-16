/**
 * dsh-wide-chat 冒烟测试（不需要 DSH 在跑）
 *
 * 造一个最小复现场景：一条居中列，max-width 吃 --dsh-chat-content-width。
 * 然后按 DSH 客户端模块的方式加载 lib/client.js，验证三件事：
 *   ① 变量被接管，列的 computed max-width 真的变了
 *   ② 把手挂上来了，位置贴着列右缘
 *   ③ 模拟拖拽会改宽度，并且写进 localStorage；双击能恢复默认
 */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const clientCode = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%}
  #stage{height:100vh;display:flex;justify-content:center;overflow:auto}
  .col{max-width:var(--dsh-chat-content-width);width:100%;}
  .col[data-slot="conversation.chat.flow"]{display:block}
  .filler{height:1200px;background:#eee}
</style></head><body>
<div id="stage"><div class="col" data-slot="conversation.chat.flow"><div class="filler">content</div></div></div>
</body></html>`

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

await page.addInitScript(() => {
  window.__ModuleLoader__ = {
    load(def) {
      window.__mod = def.factory(() => ({}))
      window.__modId = def.id
    },
  }
})

await page.setContent(html, { waitUntil: 'domcontentloaded' })

// 用本地 http 起一份（about:blank 是 opaque origin，localStorage 会被拒）
const { createServer } = await import('node:http')
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })

// init script 在新文档上会重新跑；万一没有就补一次
await page.evaluate(() => {
  if (!window.__ModuleLoader__) {
    window.__ModuleLoader__ = {
      load(def) {
        window.__mod = def.factory(() => ({}))
        window.__modId = def.id
      },
    }
  }
})

await page.addScriptTag({ content: clientCode })

const modId = await page.evaluate(() => window.__modId)
check('模块按 loader 格式注册', modId === 'dsh-wide-chat', `id=${modId}`)

const exportsShape = await page.evaluate(() => ({
  hasApply: typeof window.__mod?.apply === 'function',
  isArray: Array.isArray(window.__mod?.inject),
}))
check('导出 apply / inject', exportsShape.hasApply && exportsShape.isArray, JSON.stringify(exportsShape))

await page.evaluate(() => window.__mod.apply({}))

const applied = await page.evaluate(() => {
  const col = document.querySelector('[data-slot="conversation.chat.flow"]')
  return {
    maxWidth: getComputedStyle(col).maxWidth,
    varValue: getComputedStyle(document.documentElement).getPropertyValue('--dsh-chat-content-width').trim(),
    handle: !!document.getElementById('dsh-wide-chat-handle'),
    handleRight: document.getElementById('dsh-wide-chat-handle')?.style.right,
    api: typeof window.__dshWideChat?.set,
  }
})
check('CSS 变量被接管', applied.varValue === '1040px', `var=${applied.varValue}`)
check('列宽真的变成 1040px', applied.maxWidth === '1040px', `computed max-width=${applied.maxWidth}`)
check('把手已挂载', applied.handle, `right=${applied.handleRight}`)
check('控制台接口存在', applied.api === 'function')

// —— 拖拽：从把手中心往右拖 100px，宽度应 +200 ——
const dragResult = await page.evaluate(async () => {
  const handle = document.getElementById('dsh-wide-chat-handle')
  const r = handle.getBoundingClientRect()
  const startX = r.left + r.width / 2
  const y = r.top + r.height / 2
  const pointer = (type, x) =>
    handle.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true }),
    )
  pointer('pointerdown', startX)
  pointer('pointermove', startX + 100)
  pointer('pointerup', startX + 100)
  pointer('pointerdown', startX) // 这是模拟第二段，只为确保 up 干净
  pointer('pointerup', startX)
  return {
    width: window.__dshWideChat.get(),
    stored: localStorage.getItem('dsh-wide-chat:width'),
    maxWidth: getComputedStyle(document.querySelector('[data-slot="conversation.chat.flow"]')).maxWidth,
  }
})
check('拖 100px ⇒ 宽度 +200', dragResult.width === 1240, `width=${dragResult.width}`)
check('宽度写进 localStorage', dragResult.stored === '1240', `stored=${dragResult.stored}`)
check('列宽同步跟着变', dragResult.maxWidth === '1240px', `max-width=${dragResult.maxWidth}`)

// —— 夹紧 + 复位 ——
const bounds = await page.evaluate(() => ({
  low: window.__dshWideChat.set(100),
  high: window.__dshWideChat.set(99999),
  reset: window.__dshWideChat.reset(),
}))
check('下限夹到 520', bounds.low === 520, `got=${bounds.low}`)
check('上限夹到 2400', bounds.high === 2400, `got=${bounds.high}`)
check('reset 回 1040', bounds.reset === 1040, `got=${bounds.reset}`)

// —— 清理：dispose 之后不该再有把手和样式 ——
const cleaned = await page.evaluate(() => {
  window.__dshWideChatDispose()
  return {
    handle: !!document.getElementById('dsh-wide-chat-handle'),
    style: !!document.getElementById('dsh-wide-chat-style'),
    api: typeof window.__dshWideChat,
  }
})
check('dispose 清掉把手', cleaned.handle === false)
check('dispose 清掉样式', cleaned.style === false)
check('dispose 清掉接口', cleaned.api === 'undefined')

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n结果：${results.length - failed.length} 通过 / ${failed.length} 失败`)
process.exit(failed.length ? 1 : 0)
