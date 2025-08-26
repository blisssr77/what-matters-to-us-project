import React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false, protocols: ['http', 'https', 'mailto'] }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: valueJSON ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate({ editor }) {
      onChangeJSON(editor.getJSON(), editor.getHTML())
    },
  })

  if (!editor) return null

  const insertTemplate = (tpl) => editor.commands.insertContent(tpl)
  const setLink = () => {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt('Enter URL', prev)
    if (url === null) return
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run()
  }

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
    <div className="wm-editor">
      {/* Toolbar */}
      <div className="wm-toolbar">
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

        {templates && templates.length > 0 && (
          <div className="ml-auto text-xs">
            <select
              className="wm-select"
              onChange={(e) => {
                const tpl = templates.find(t => t.id === e.target.value)
                if (tpl) insertTemplate(tpl.contentJSON)
                e.currentTarget.selectedIndex = 0
              }}
            >
              <option>Insert template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="wm-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}