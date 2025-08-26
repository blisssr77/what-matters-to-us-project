import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'

export default function RichTextEditor({
  valueJSON,
  onChangeJSON,
  templates = [],
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Write your note…' }),
    ],
    content: valueJSON ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate({ editor }) {
      onChangeJSON(editor.getJSON(), editor.getHTML())
    },
  })

  if (!editor) return null

  const insertTemplate = (tpl) => editor.commands.insertContent(tpl)

  return (
    <div className="rounded-lg border bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 border-b">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 rounded ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}
        >
          B
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 rounded ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}
        >
          I
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-2 py-1 rounded ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}
        >
          U
        </button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className="px-2 py-1 rounded">• List</button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className="px-2 py-1 rounded">1. List</button>
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className="px-2 py-1 rounded">Left</button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className="px-2 py-1 rounded">Center</button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className="px-2 py-1 rounded">Right</button>

        {/* Templates dropdown */}
        <div className="ml-auto">
          <select
            className="border rounded px-2 py-1 text-sm"
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
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} className="prose max-w-none p-3 min-h-[160px]" />
    </div>
  )
}
