import React, { useMemo, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'

export default function ReadOnlyViewer({ json, html, className = '' }) {
  const extensions = useMemo(() => ([
    StarterKit, // includes link + underline in v3
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ]), [])

  const editor = useEditor({
    extensions,
    editable: false,
    content: json || { type: 'doc', content: [{ type: 'paragraph' }] },
  })

  useEffect(() => {
    if (editor && json) editor.commands.setContent(json)
  }, [editor, json])

  const cleanHtml = useMemo(() => (html ? DOMPurify.sanitize(html) : ''), [html])

  if (json) {
    if (!editor) return null
    return (
      <div className={className}>
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: cleanHtml || '<p class="text-gray-500">No content</p>' }}
    />
  )
}
