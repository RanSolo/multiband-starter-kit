import Image from "@tiptap/extension-image";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  decodeImageTitle,
  encodeImageTitle,
  imageWidth,
} from "@/lib/editor-image-size.mjs";

export type SelectedImage = { position: number; node: ProseMirrorNode };

export function selectedImage(editor: Editor): SelectedImage | null {
  const selection = editor.state.selection;
  return selection instanceof NodeSelection &&
    selection.node.type.name === "image"
    ? { position: selection.from, node: selection.node }
    : null;
}

export function canMoveImage(
  editor: Editor,
  position: number,
  direction: -1 | 1,
) {
  const $position = editor.state.doc.resolve(position);
  const index = $position.index();
  const parent = $position.parent;
  return (
    parent.child(index)?.type.name === "image" &&
    (direction < 0 ? index > 0 : index + 1 < parent.childCount)
  );
}

export function moveImage(editor: Editor, position: number, direction: -1 | 1) {
  if (!canMoveImage(editor, position, direction)) return false;
  const $position = editor.state.doc.resolve(position);
  const index = $position.index();
  const parent = $position.parent;
  const image = parent.child(index);
  const neighbor = parent.child(index + direction);
  const from = direction < 0 ? position - neighbor.nodeSize : position;
  const to =
    direction < 0
      ? position + image.nodeSize
      : position + image.nodeSize + neighbor.nodeSize;
  const nodes = direction < 0 ? [image, neighbor] : [neighbor, image];
  const nextPosition = direction < 0 ? from : position + neighbor.nodeSize;
  const transaction = editor.state.tr.replaceWith(
    from,
    to,
    Fragment.fromArray(nodes),
  );
  transaction.setSelection(NodeSelection.create(transaction.doc, nextPosition));
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

export function resetImageSize(editor: Editor, position: number) {
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== "image") return false;
  const transaction = editor.state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    width: null,
    height: null,
  });
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
  editor.view.dispatch(transaction);
  return true;
}

type ImageAttrs = {
  src: string;
  alt?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
};

function sameImageSource(stored: string, observed: string) {
  if (stored === observed) return true;
  try {
    return (
      new URL(stored, document.baseURI).href ===
      new URL(observed, document.baseURI).href
    );
  } catch {
    return false;
  }
}

export function createEditorImageExtension(
  onSelection: (editor: Editor, selected: SelectedImage | null) => void,
) {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        title: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            decodeImageTitle(element.getAttribute("title")).title,
        },
        width: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const decoded = decodeImageTitle(element.getAttribute("title"));
            return decoded.encoded ? decoded.width : null;
          },
          renderHTML: (attributes: ImageAttrs) =>
            attributes.width === null
              ? {}
              : {
                  width: imageWidth(attributes.width),
                  style: "max-width: 100%; height: auto",
                },
        },
        height: { default: null, renderHTML: () => ({}) },
      };
    },
    addCommands() {
      return {
        setImage:
          (options: ImageAttrs) =>
          ({ editor, commands }) => {
            const selection = selectedImage(editor);
            if (
              selection &&
              sameImageSource(selection.node.attrs.src, options.src) &&
              typeof options.width === "number" &&
              Number.isFinite(options.width) &&
              typeof options.height === "number" &&
              Number.isFinite(options.height)
            ) {
              return commands.insertContentAt(
                {
                  from: selection.position,
                  to: selection.position + selection.node.nodeSize,
                },
                {
                  type: "image",
                  attrs: {
                    ...selection.node.attrs,
                    width: imageWidth(options.width),
                    height: null,
                  },
                },
              );
            }
            return commands.insertContent({ type: "image", attrs: options });
          },
      };
    },
    addStorage() {
      return {
        markdown: {
          serialize: (
            state: {
              write: (value: string) => void;
              esc: (value: string) => string;
              closeBlock: (node: ProseMirrorNode) => void;
            },
            node: ProseMirrorNode,
          ) => {
            const alt = state.esc(node.attrs.alt || "");
            const src = String(node.attrs.src || "")
              .replace(/\\/g, "\\\\")
              .replace(/[()]/g, "\\$&");
            const title = encodeImageTitle(node.attrs.title, node.attrs.width);
            const quoted = title
              ? ` "${title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
              : "";
            state.write(`![${alt}](${src}${quoted})`);
            state.closeBlock(node);
          },
          parse: {},
        },
      };
    },
    onCreate() {
      onSelection(this.editor, selectedImage(this.editor));
    },
    onSelectionUpdate() {
      onSelection(this.editor, selectedImage(this.editor));
    },
    onUpdate() {
      onSelection(this.editor, selectedImage(this.editor));
    },
    onDestroy() {
      onSelection(this.editor, null);
    },
  }).configure({
    HTMLAttributes: {
      class: "novel-rounded-lg novel-border novel-border-stone-200",
    },
  });
}
