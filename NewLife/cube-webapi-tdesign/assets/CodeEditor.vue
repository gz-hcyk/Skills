<template>
  <div class="code-editor" :class="{ 'is-readonly': readonly }" :style="{ height }">
    <div ref="host" class="code-editor__host"></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { json as jsonLang } from '@codemirror/lang-json';
import { markdown as markdownLang } from '@codemirror/lang-markdown';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: 'json' | 'markdown' | 'text';
    readonly?: boolean;
    height?: string;
  }>(),
  { language: 'text', readonly: false, height: '240px' },
);

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

function buildExtensions() {
  const exts: any[] = [
    basicSetup,
    keymap.of([indentWithTab]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
    }),
  ];
  if (props.language === 'json') exts.push(jsonLang());
  else if (props.language === 'markdown') exts.push(markdownLang());
  if (props.readonly) {
    exts.push(EditorState.readOnly.of(true));
    exts.push(EditorView.editable.of(false));
  }
  return exts;
}

function createView() {
  if (!host.value) return;
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc: props.modelValue ?? '', extensions: buildExtensions() }),
  });
}

function destroyView() {
  view?.destroy();
  view = null;
}

/** 外部值变化（如切换编辑记录）时同步回编辑器 */
function syncExternal(value: string) {
  if (!view) return;
  const current = view.state.doc.toString();
  if (value !== current) {
    view.dispatch({ changes: { from: 0, to: current.length, insert: value ?? '' } });
  }
}

onMounted(createView);
onBeforeUnmount(destroyView);

// 语言/只读切换 → 重建视图（CodeMirror 扩展在创建时固定）
watch(
  () => [props.language, props.readonly],
  () => {
    destroyView();
    createView();
  },
);
// 外部值变化（新增/编辑回填、reset）→ 不重建，仅同步文档，保住焦点
watch(() => props.modelValue, syncExternal);
</script>

<style scoped>
.code-editor {
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default, 3px);
  overflow: hidden;
}
.code-editor.is-readonly {
  background: var(--td-bg-color-container-disabled, #f5f5f5);
}
.code-editor__host {
  height: 100%;
}
.code-editor :deep(.cm-editor) {
  height: 100%;
  font-size: 13px;
}
.code-editor :deep(.cm-scroller) {
  font-family: var(--td-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
</style>
