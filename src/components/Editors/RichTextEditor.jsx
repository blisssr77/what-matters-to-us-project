import React, {useMemo, useEffect} from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Link as LinkIcon,
  Undo, Redo
} from 'lucide-react'

export default function RichTextEditor({
  valueJSON,
  onChangeJSON,
  templates = [],              // pass [] or omit to hide dropdown
  placeholder = 'Write your note…',
}) {
  const extensions = useMemo(() => ([
    StarterKit.configure({
      bulletList: { keepMarks: true },
      orderedList: { keepMarks: true },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
  ]), [placeholder])

  const editor = useEditor({
    extensions,
    content: valueJSON ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate({ editor }) {
      onChangeJSON(editor.getJSON(), editor.getHTML())
    },
  })

  if (!editor) return null

  // inside RichTextEditor component
  useEffect(() => {
    if (!editor) return
    if (!valueJSON) { editor.commands.clearContent(); return }
    const current = editor.getJSON()
    const next = valueJSON
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      editor.commands.setContent(next, false) // don't fire onUpdate again
    }
  }, [editor, valueJSON])

  const Btn = ({ onClick, active, title, children }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`wm-btn ${active ? 'is-active' : ''}`}
    >
      {children}
    </button>
  )

  const Divider = () => <span className="wm-sep" />

  return (
    <div className="wm-content max-w-full break-words overflow-x-hidden min-w-0">
      {/* Toolbar */}
      <div className="wm-toolbar flex flex-wrap items-center gap-2 p-2 border-b bg-gray-50 w-full min-w-0">
        <Btn title="Bold"      active={editor.isActive('bold')}      onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></Btn>
        <Btn title="Italic"    active={editor.isActive('italic')}    onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></Btn>
        <Btn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></Btn>

        <Divider />

        <Btn title="Bulleted list"  active={editor.isActive('bulletList')}  onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></Btn>
        <Btn title="Numbered list"  active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>

        <Divider />

        <Btn title="Align left"   active={editor.isActive({ textAlign: 'left' })}   onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={16} /></Btn>
        <Btn title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={16} /></Btn>
        <Btn title="Align right"  active={editor.isActive({ textAlign: 'right' })}  onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={16} /></Btn>

        <Divider />

        {/* <Btn title="Insert link" onClick={setLink}><LinkIcon size={16} /></Btn> */}
        <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo size={16} /></Btn>
        <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo size={16} /></Btn>
      </div>

      {/* Editor */}
      <div className="wm-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}