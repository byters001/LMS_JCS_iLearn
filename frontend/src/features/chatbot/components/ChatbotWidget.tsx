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

  return (
    <div ref={containerRef} className="fixed right-6 bottom-6 z-40">
      {isOpen && (
        <div className="absolute right-0 bottom-16 flex h-[32rem] w-96 flex-col rounded-lg border border-border bg-background shadow-lg">
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

      <button
        type="button"
        aria-label={isOpen ? 'Close reports assistant' : 'Open reports assistant'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'flex size-14 items-center justify-center rounded-full bg-brand-accent text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-accent/90',
        )}
      >
        {isOpen ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  )
}
