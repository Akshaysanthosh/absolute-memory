import StarterKit from '@tiptap/starter-kit';
import UniqueID from '@tiptap/extension-unique-id';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';

export function noteExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
    UniqueID.configure({ types: ['paragraph', 'heading', 'codeBlock', 'image', 'horizontalRule'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image,
  ];
}
