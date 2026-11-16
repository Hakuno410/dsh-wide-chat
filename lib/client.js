/**
 * dsh-wide-chat —— client 半（跑在 Web GUI 里）
 * ============================================================================
 * 一句话：把 `--dsh-chat-content-width` 这个 CSS 变量接管过来，给一条能拖的把手。
 *
 * 为什么是这一个变量：
 *   DSH 的会话列是 `.V4vHZW_column{max-width:var(--dsh-chat-content-width)}`
 *   （类名是构建哈希，会随版本变；变量名是稳定的）。
 *   输入框、审批卡、用户气泡宽度**全部由它派生**，所以改它一个，整列跟着变，
 *   不用碰任何结构。
 *
 * 为什么用 !important：
 *   这个变量有可能被写成 `:root` 的内联 style（运行时算出来的）。
 *   CSS 自定义属性上，`!important` 的样式表规则能压过内联声明。
 *
 * 为什么把手是 position:fixed：
 *   不往 React 树里插节点，不碰布局，HMR/会话切换都不会把它甩掉。
 *   位置每次现算：优先贴着真正的会话列右缘，找不到就退回视口居中公式。
 *
 * 存哪：localStorage['dsh-wide-chat:width']（和 DSH 内置的键分开，互不干扰）。
 */
window.__ModuleLoader__.load({
	id: 'dsh-wide-chat',
	factory: (require) => {
		const exports = {}

		const KEY = 'dsh-wide-chat:width'
		const STYLE_ID = 'dsh-wide-chat-style'
		const HANDLE_ID = 'dsh-wide-chat-handle'
		const DEFAULT_WIDTH = 1040
		const MIN_WIDTH = 520
		const MAX_WIDTH = 2400

		const clamp = (n) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)))

		function readWidth() {
			try {
				const n = parseInt(window.localStorage.getItem(KEY) || '', 10)
				if (Number.isFinite(n)) return clamp(n)
			} catch {
				/* 隐私模式读不到就用默认 */
			}
			return DEFAULT_WIDTH
		}

		function writeWidth(n) {
			try {
				window.localStorage.setItem(KEY, String(clamp(n)))
			} catch {
				/* 存不下也不影响本次使用 */
			}
		}

		/** 找到真正的会话列，用来把把手贴在它右缘。找不到返回 null（退回公式定位）。 */
		function findColumn(width) {
			const slot = document.querySelector('[data-slot="conversation.chat.flow"]')
			if (!slot) return null
			let node = slot
			for (let i = 0; i < 5 && node; i++) {
				const rect = node.getBoundingClientRect()
				if (rect.width > 0 && Math.abs(rect.width - width) <= 16) return node
				node = node.parentElement
			}
			// 量不准就退回它的父节点（通常就是那条居中列）
			return slot.parentElement || slot
		}

		function apply(ctx) {
			// HMR / 重复挂载：先把上一份收拾干净，别叠两个把手
			const prev = window.__dshWideChatDispose
			if (typeof prev === 'function') {
				try {
					prev()
				} catch {
					/* 旧的清理失败不影响新的 */
				}
			}

			let width = readWidth()

			// ── 样式：只声明变量 + 把手外观 ──────────────────────────────────
			let styleEl = document.getElementById(STYLE_ID)
			if (!styleEl) {
				styleEl = document.createElement('style')
				styleEl.id = STYLE_ID
				document.head.appendChild(styleEl)
			}

			// ── 把手 ────────────────────────────────────────────────────────
			let handle = document.getElementById(HANDLE_ID)
			if (!handle) {
				handle = document.createElement('div')
				handle.id = HANDLE_ID
				handle.className = 'dsh-wide-chat-handle'
				handle.setAttribute('role', 'separator')
				handle.setAttribute('aria-orientation', 'vertical')
				handle.setAttribute('title', '拖动调整聊天宽度 · 双击恢复默认')
				document.body.appendChild(handle)
			}

			function renderStyle() {
				styleEl.textContent = [
					// 核心：接管列宽变量
					`:root{--dsh-chat-content-width:${width}px !important}`,
					// 把手本体：细长竖条，静止时几乎透明，悬停/拖动才显形
					`.dsh-wide-chat-handle{`,
					`position:fixed;top:50%;transform:translateY(-50%);`,
					`width:10px;height:44vh;min-height:180px;`,
					`border-radius:6px;cursor:col-resize;`,
					`background:transparent;`,
					`transition:background .15s ease,opacity .15s ease;`,
					`opacity:.55;z-index:2147483000;`,
					`touch-action:none;pointer-events:auto;`,
					`}`,
					`.dsh-wide-chat-handle:hover,`,
					`.dsh-wide-chat-handle[data-dragging="1"]{`,
					`background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.35));`,
					`opacity:1;`,
					`}`,
					`.dsh-wide-chat-handle::after{`,
					`content:"";position:absolute;left:50%;top:50%;`,
					`transform:translate(-50%,-50%);`,
					`width:2px;height:56px;border-radius:2px;`,
					`background:var(--dsw-alias-label-tertiary,rgba(160,160,160,.8));`,
					`opacity:.5;`,
					`}`,
					`.dsh-wide-chat-handle:hover::after,`,
					`.dsh-wide-chat-handle[data-dragging="1"]::after{opacity:1}`,
				].join('')
			}

			function positionHandle() {
				if (!handle) return
				const column = findColumn(width)
				if (column) {
					const rect = column.getBoundingClientRect()
					const right = Math.max(0, Math.round(window.innerWidth - rect.right - 5))
					handle.style.right = right + 'px'
				} else {
					// 找不到列：按"居中列"的公式兜底
					handle.style.right = `calc((100% - ${width}px) / 2 - 5px)`
				}
			}

			function applyAll() {
				renderStyle()
				positionHandle()
			}

			// ── 拖拽 ────────────────────────────────────────────────────────
			// 列是居中的：指针右移 dx ⇒ 右缘右移 dx ⇒ 宽度增加 2dx。
			// 所以换算系数是 2，这样把手才 1:1 跟着鼠标走，不飘。
			function onPointerDown(event) {
				if (event.button !== 0 && event.pointerType === 'mouse') return
				event.preventDefault()
				const startX = event.clientX
				const startWidth = width
				handle.dataset.dragging = '1'
				try {
					handle.setPointerCapture(event.pointerId)
				} catch {
					/* 某些环境不支持捕获，靠 window 监听兜底 */
				}

				function onMove(ev) {
					const next = clamp(startWidth + (ev.clientX - startX) * 2)
					if (next === width) return
					width = next
					applyAll()
				}

				function finish() {
					writeWidth(width)
					delete handle.dataset.dragging
					handle.removeEventListener('pointermove', onMove)
					handle.removeEventListener('pointerup', finish)
					handle.removeEventListener('pointercancel', finish)
					window.removeEventListener('pointermove', onMove)
					window.removeEventListener('pointerup', finish)
				}

				handle.addEventListener('pointermove', onMove)
				handle.addEventListener('pointerup', finish)
				handle.addEventListener('pointercancel', finish)
				window.addEventListener('pointermove', onMove)
				window.addEventListener('pointerup', finish)
			}

			function onDoubleClick() {
				width = DEFAULT_WIDTH
				writeWidth(width)
				applyAll()
			}

			function onWindowResize() {
				positionHandle()
			}

			handle.addEventListener('pointerdown', onPointerDown)
			handle.addEventListener('dblclick', onDoubleClick)
			window.addEventListener('resize', onWindowResize)

			// 会话切换/侧栏开合都会改列的位置：轻量跟着走（200ms 一次，只读几何）
			const follow = window.setInterval(positionHandle, 200)

			applyAll()

			// 控制台备用入口（不方便拖的时候用）
			window.__dshWideChat = {
				get: () => width,
				set: (n) => {
					width = clamp(Number(n) || DEFAULT_WIDTH)
					writeWidth(width)
					applyAll()
					return width
				},
				reset: () => {
					width = DEFAULT_WIDTH
					writeWidth(width)
					applyAll()
					return width
				},
			}

			const dispose = () => {
				window.clearInterval(follow)
				handle.removeEventListener('pointerdown', onPointerDown)
				handle.removeEventListener('dblclick', onDoubleClick)
				window.removeEventListener('resize', onWindowResize)
				try {
					styleEl.remove()
				} catch {
					/* 已经没了 */
				}
				try {
					handle.remove()
				} catch {
					/* 已经没了 */
				}
				delete window.__dshWideChat
				delete window.__dshWideChatDispose
			}
			window.__dshWideChatDispose = dispose

			// 走 DSH 的生命周期（有就挂，没有也不影响，dispose 已经挂在 window 上）
			try {
				if (ctx && typeof ctx.on === 'function') ctx.on('dispose', dispose)
			} catch {
				/* 宿主版本差异，忽略 */
			}

			return dispose
		}

		const inject = []
		exports.apply = apply
		exports.inject = inject
		return exports
	},
})
