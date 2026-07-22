import { Download, Loader2, MessageCircle, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { downloadChatbotQueryExport, useAskChatbot } from '../api'
import { EXPORTABLE_CHATBOT_FUNCTIONS } from '../types'
import type { AskChatbotResult } from '../types'

// FAB geometry (must match the size-14 button + right-6/bottom-6 default
// classes below) — used both to compute the default drag position and to
// clamp dragging within the viewport.
const FAB_SIZE_PX = 56
const EDGE_MARGIN_PX = 24
// Below this many pixels of pointer movement, a pointerdown+pointerup is
// treated as a click (open/close), not a drag — without this, the ordinary
// "click to open" gesture would register as a zero-distance drag and never
// actually open the panel.
const DRAG_THRESHOLD_PX = 4

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Same wording as chatbot.service.ts's SYSTEM_PROMPT lists to the model —
// kept in sync manually since the two live in different apps/languages,
// not because the frontend calls into that prompt directly.
const NO_MATCH_MESSAGE =
  "I can only answer questions about attendance by date, students who failed an assessment, a trainer's performance, or a batch's roster. Try rephrasing your question."

const GENERIC_ERROR_MESSAGE = 'Something went wrong answering that. Please try again.'

interface ChatMessage {
  id: string
  question: string
  status: 'pending' | 'success' | 'error'
  result?: AskChatbotResult
  errorMessage?: string
}

function isDownloadable(result: AskChatbotResult): boolean {
  return result.functionCalled !== null && EXPORTABLE_CHATBOT_FUNCTIONS.has(result.functionCalled)
}

function ChatBubbleSkeleton() {
  return (
    <div className="flex items-center gap-1.5 self-start rounded-lg bg-muted px-3 py-2.5" role="status" aria-label="Thinking">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </div>
  )
}

function DownloadButton({ result }: { result: AskChatbotResult }) {
  const [isDownloading, setIsDownloading] = useState(false)

  async function handleDownload() {
    setIsDownloading(true)
    try {
      await downloadChatbotQueryExport(result.queryLogId, `${result.functionCalled}-export.csv`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export this result.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isDownloading} onClick={handleDownload} className="self-start">
      {isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {isDownloading ? 'Preparing…' : 'Download CSV'}
    </Button>
  )
}

function ChatExchange({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[85%] self-end rounded-lg bg-brand-accent px-3 py-2 text-sm text-white">
        {message.question}
      </p>

      {message.status === 'pending' && <ChatBubbleSkeleton />}

      {message.status === 'success' && message.result && (
        <div className="flex max-w-[85%] flex-col items-start gap-2 self-start">
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-brand-primary">{message.result.answer}</p>
          {isDownloadable(message.result) && <DownloadButton result={message.result} />}
        </div>
      )}

      {message.status === 'error' && (
        <p className="max-w-[85%] self-start rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message.errorMessage}
        </p>
      )}
    </div>
  )
}

export function ChatbotWidget() {
  const user = useAuthStore((state) => state.user)
  const [isOpen, setIsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const askChatbot = useAskChatbot()

  // Draggable FAB position — session-only component state (not
  // localStorage), matching this app's existing in-memory-only UI-state
  // convention (e.g. layouts/components/Sidebar.tsx's collapse toggle).
  // `null` means "never dragged yet" — the default bottom-right position
  // then comes from the right-6/bottom-6 CSS classes below, not from this
  // state, so the very first render (before any layout measurement is even
  // possible) looks identical to the pre-drag widget.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    originX: number
    originY: number
    dragged: boolean
  } | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  // Reads the FAB's actual current on-screen box rather than trusting
  // `position` alone — needed because `position` stays null (CSS-default
  // bottom-right) until the first drag, so this is the only way to know
  // the real starting point a drag begins from.
  function getCurrentFabRect(): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) return { x: rect.left, y: rect.top }
    return {
      x: window.innerWidth - FAB_SIZE_PX - EDGE_MARGIN_PX,
      y: window.innerHeight - FAB_SIZE_PX - EDGE_MARGIN_PX,
    }
  }

  function handleFabPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    const current = getCurrentFabRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: current.x,
      originY: current.y,
      dragged: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleFabPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.dragged = true
    setPosition({
      x: clamp(drag.originX + dx, EDGE_MARGIN_PX, window.innerWidth - FAB_SIZE_PX - EDGE_MARGIN_PX),
      y: clamp(drag.originY + dy, EDGE_MARGIN_PX, window.innerHeight - FAB_SIZE_PX - EDGE_MARGIN_PX),
    })
  }

  function handleFabPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    // A drag that never crossed the threshold is a plain click — toggling
    // here (instead of a separate onClick) is what keeps an actual drag
    // from also firing a click and immediately re-toggling the panel.
    if (!drag.dragged) {
      setIsOpen((open) => !open)
    }
  }

  // Client-side convenience only — the real gate is server-side
  // ('chatbot.query', seeded to super_admin + faculty only; see
  // backend/src/modules/chatbot/chatbot.routes.ts). A student who somehow
  // hit POST /chatbot/ask directly would still be rejected there.
  const canUseChatbot = user?.roles.some((role) => role === 'super_admin' || role === 'faculty') ?? false
  if (!canUseChatbot) {
    return null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || askChatbot.isPending) return

    const messageId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: messageId, question: trimmed, status: 'pending' }])
    setQuestion('')

    try {
      const result = await askChatbot.mutateAsync(trimmed)
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: 'success', result } : m)),
      )
    } catch (err) {
      const isNoMatch = err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      const errorMessage = isNoMatch
        ? NO_MATCH_MESSAGE
        : err instanceof Error
          ? err.message
          : GENERIC_ERROR_MESSAGE
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: 'error', errorMessage } : m)),
      )
    }
  }

  // Panel anchor flips to whichever side actually has room, based on the
  // FAB's current half of the viewport — a plain `right-0 bottom-16` (the
  // original, fixed-position-only layout) would run the 384px/24rem-wide
  // panel off-screen once the FAB is dragged toward the left or top edge.
  const fabCenterX = (position?.x ?? window.innerWidth - FAB_SIZE_PX - EDGE_MARGIN_PX) + FAB_SIZE_PX / 2
  const fabCenterY = (position?.y ?? window.innerHeight - FAB_SIZE_PX - EDGE_MARGIN_PX) + FAB_SIZE_PX / 2
  const openLeftward = fabCenterX > window.innerWidth / 2
  const openUpward = fabCenterY > window.innerHeight / 2

  return (
    <div
      ref={containerRef}
      // z-40 already sits above the sidebar (no z-index — implicit stacking
      // order) and both layouts' sticky headers (z-10), confirmed by
      // grepping every z-* usage in this codebase — the highest anything
      // else reaches short of a modal is z-40 here already exceeding both.
      // Kept below z-50 (Dialog/DropdownMenu/the fullscreen-exit and
      // submit-attempt confirm modals) deliberately: a real modal should
      // still cover this, dragged position or not.
      className={cn('fixed z-40', position === null && 'right-6 bottom-6')}
      style={position ? { left: position.x, top: position.y } : undefined}
    >
      {isOpen && (
        <div
          className={cn(
            'absolute flex h-[32rem] w-96 flex-col rounded-lg border border-border bg-background shadow-lg',
            openLeftward ? 'right-0' : 'left-0',
            openUpward ? 'bottom-16' : 'top-16',
          )}
        >
          <div className="flex shrink-0 items-center justify-between rounded-t-lg border-b border-border bg-brand-primary px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Reports Assistant</p>
              <p className="text-xs text-white/70">Ask about attendance, results, or rosters</p>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
              className="flex size-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <MessageCircle className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Ask about attendance by date, students who failed an assessment, a trainer's
                  performance, or a batch's roster.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <ChatExchange key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t border-border p-3">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question…"
              disabled={askChatbot.isPending}
              maxLength={1000}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={askChatbot.isPending || !question.trim()}>
              {askChatbot.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      )}

      {/* Click-to-toggle AND drag-to-reposition on the same element — see
          handleFabPointerUp for how the two are told apart (a pointer
          gesture that never moved past DRAG_THRESHOLD_PX toggles the panel;
          anything past that is a drag and doesn't). touch-none stops the
          browser's own touch-scroll gesture from fighting the drag on
          touchscreens. */}
      <button
        type="button"
        aria-label={isOpen ? 'Close reports assistant' : 'Open reports assistant'}
        aria-expanded={isOpen}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        className="flex size-14 touch-none items-center justify-center rounded-full bg-brand-accent text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-accent/90 active:cursor-grabbing"
      >
        {isOpen ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  )
}
