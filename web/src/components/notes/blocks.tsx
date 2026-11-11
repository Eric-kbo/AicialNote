import type { Editor } from '@tiptap/react'
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Table,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { MessageKey } from '../../i18n'

/** Block types offered by the toolbar's block menu and the "/" menu. */
export interface BlockType {
  id: string
  label: MessageKey
  icon: ReactNode
  /** Extra words the "/" menu matches, in both languages. */
  keywords: string
  isActive?: (e: Editor) => boolean
  run: (e: Editor) => void
}

export const BLOCKS: BlockType[] = [
  {
    id: 'paragraph',
    label: 'editor.paragraph',
    icon: <Pilcrow />,
    keywords: 'text paragraph p 正文 段落 zw',
    isActive: (e) => e.isActive('paragraph'),
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  ...([1, 2, 3] as const).map(
    (level): BlockType => ({
      id: `h${level}`,
      label: `editor.h${level}`,
      icon: level === 1 ? <Heading1 /> : level === 2 ? <Heading2 /> : <Heading3 />,
      keywords: `h${level} heading title 标题 bt`,
      isActive: (e) => e.isActive('heading', { level }),
      run: (e) => e.chain().focus().toggleHeading({ level }).run(),
    }),
  ),
  {
    id: 'bullet',
    label: 'editor.bullet',
    icon: <List />,
    keywords: 'ul bullet list 列表 无序 lb',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'editor.ordered',
    icon: <ListOrdered />,
    keywords: 'ol ordered numbered list 编号 有序 bh',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'task',
    label: 'editor.task',
    icon: <CheckSquare />,
    keywords: 'todo task checkbox 待办 清单 任务 db',
    isActive: (e) => e.isActive('taskList'),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'quote',
    label: 'editor.quote',
    icon: <Quote />,
    keywords: 'quote blockquote 引用 yy',
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'code',
    label: 'editor.codeBlock',
    icon: <Code2 />,
    keywords: 'code pre 代码 dm',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'table',
    label: 'editor.table',
    icon: <Table />,
    keywords: 'table grid 表格 bg',
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'divider',
    label: 'editor.divider',
    icon: <Minus />,
    keywords: 'hr divider line rule 分隔线 分割线 fgx',
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
]
