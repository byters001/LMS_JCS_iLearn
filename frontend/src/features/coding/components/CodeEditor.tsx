// Wraps @monaco-editor/react. Lazy-loaded (React.lazy/dynamic import) so
// Monaco never ships in the main bundle — not every assessment includes a
// coding section (CLAUDE1.md non-negotiable #7). This module is the actual
// code-split boundary: consumers must reach it via
// `React.lazy(() => import('@/features/coding/components/CodeEditor'))`
// inside a <Suspense>, never a static `import CodeEditor from '...'` at the
// top of a file — a static import here would defeat the whole point, since
// bundlers can't split off a module that's imported unconditionally. See
// features/attempts/components/CodingQuestion.tsx for the lazy() call.
//
// Requires a default export for React.lazy() to resolve against.
import Editor from '@monaco-editor/react'
import { MONACO_EDITOR_OPTIONS, MONACO_THEME } from '@/lib/monaco.config'

interface CodeEditorProps {
  language: string
  value: string
  onChange: (value: string) => void
  height?: string
}

export default function CodeEditor({ language, value, onChange, height = '480px' }: CodeEditorProps) {
  return (
    <Editor
      height={height}
      language={language}
      theme={MONACO_THEME}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={MONACO_EDITOR_OPTIONS}
    />
  )
}
