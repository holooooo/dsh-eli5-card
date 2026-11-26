export const css = `
::highlight(dsh-eli5-terms) { color: var(--dsw-alias-link); text-decoration: underline; text-underline-offset: 3px; }
.eli5-root { --ec-bg: var(--dsw-alias-bg-layer-1); --ec-text: var(--dsw-alias-label-primary); --ec-muted: var(--dsw-alias-label-secondary); --ec-edge: var(--dsw-alias-border-l2); --ec-soft: var(--dsw-alias-interactive-bg-hover); --ec-link: var(--dsw-alias-link); color: var(--ec-text); font: 14px/1.55 system-ui,sans-serif; overflow-wrap: anywhere; }
.eli5-root *, .eli5-root { box-sizing: border-box; }
.eli5-button { border: 1px solid var(--ec-edge); background: var(--ec-bg); color: inherit; padding: 5px 10px; border-radius: 6px; font: inherit; cursor: pointer; }
.eli5-button:hover, .eli5-button[aria-pressed=true] { background: var(--ec-soft); }
.eli5-button:disabled { opacity: .55; cursor: default; }
.eli5-root :focus-visible { outline: 2px solid var(--ec-link); outline-offset: 2px; }
.eli5-selection-action { position: fixed; z-index: 9999; pointer-events: auto; }
.eli5-quote-action { display: block; padding: 5px 10px; border: 0; border-radius: 999px; corner-shape: round; background: var(--dsw-alias-button-floating-fill); --dsw-elevation-stroke-color: var(--dsw-alias-border-l3); box-shadow: var(--dsw-elevation-panel); color: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13); white-space: nowrap; cursor: pointer; }
.eli5-quote-action:focus-visible { background: var(--dsw-alias-button-floating-hover); }
@media (hover: hover) { .eli5-quote-action:hover { background: var(--dsw-alias-button-floating-hover); } }
.eli5-popup { position: fixed; z-index: 10000; pointer-events: auto; inset: 12px auto auto 12px; width: min(480px, calc(100vw - 24px)); max-height: min(680px, calc(100dvh - 24px)); overflow: auto; background: var(--ec-bg); border: 1px solid var(--ec-edge); border-radius: 8px; box-shadow: 0 8px 32px color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 18%, transparent); padding: 14px 16px; }
.eli5-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.eli5-caption { justify-content: space-between; flex-wrap: nowrap; color: var(--ec-muted); font-size: 12px; }
.eli5-caption .eli5-button { flex: none; }
.eli5-drag-handle { cursor: grab; touch-action: none; user-select: none; }
.eli5-drag-handle:active { cursor: grabbing; }
.eli5-drag-handle:focus-visible { outline: 2px solid var(--ec-link); outline-offset: 2px; }
.eli5-title { font-size: 23px; line-height: 1.25; margin: 8px 0 12px; }
.eli5-picture { margin: 0; }
.eli5-picture svg { display: block; width: 100%; height: auto; }
.eli5-summary { font-size: 16px; margin: 12px 0 8px; }
.eli5-analogy { margin: 8px 0 12px; padding-left: 10px; border-left: 2px solid var(--ec-link); }
.eli5-pending { min-height: 70px; display: grid; place-items: center; color: var(--ec-muted); }
.eli5-root details { margin: 8px 0; color: var(--ec-muted); }
.eli5-root summary { cursor: pointer; }
.eli5-muted, .eli5-empty { color: var(--ec-muted); }
.eli5-link { font: inherit; color: var(--ec-link); border: 0; background: none; padding: 0; cursor: pointer; text-decoration: underline; }
.eli5-settings { max-width: 760px; min-width: 0; padding: 12px 2px; }
.eli5-graph-page { flex: 1; width: 100%; height: 100%; min-height: 0; position: relative; overflow: hidden; }
.eli5-graph-settings-toggle { position: absolute; z-index: 3; top: 16px; right: 18px; display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--ec-edge); border-radius: 50%; color: inherit; background: var(--ec-bg); box-shadow: 0 2px 12px color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 14%, transparent); cursor: pointer; }
.eli5-graph-settings-toggle:hover, .eli5-graph-settings-close:hover { background: var(--ec-soft); }
.eli5-graph-settings { position: absolute; z-index: 4; top: 12px; right: 12px; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; padding: 16px; border: 1px solid var(--ec-edge); border-radius: 12px; background: var(--ec-bg); box-shadow: 0 10px 34px color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 20%, transparent); }
.eli5-graph-settings-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.eli5-graph-settings-close { width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: inherit; font: 22px/1 system-ui, sans-serif; cursor: pointer; }
.eli5-graph-settings form { display: grid; gap: 12px; }
.eli5-graph-settings label { display: grid; gap: 5px; font-weight: 600; }
.eli5-graph-settings input, .eli5-graph-settings select, .eli5-graph-settings textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--ec-edge); border-radius: 6px; background: var(--ec-bg); color: inherit; font: inherit; font-weight: 400; }
.eli5-graph-settings textarea { resize: vertical; }
.eli5-graph-settings form > button { justify-self: start; }
.eli5-source { margin: 12px 0; }
.eli5-settings form { display: grid; gap: 12px; margin-top: 14px; }
.eli5-settings form label { display: grid; gap: 5px; font-weight: 600; }
.eli5-settings form > button { justify-self: start; }
.eli5-settings textarea, .eli5-settings input, .eli5-settings select { width: 100%; max-width: 100%; min-width: 0; border: 1px solid var(--ec-edge); border-radius: 6px; background: var(--ec-bg); color: inherit; font: inherit; font-weight: 400; padding: 7px 9px; }
.eli5-settings textarea { resize: vertical; }
.eli5-search { margin-top: 14px; }
.eli5-list { margin: 8px 0; padding: 0; list-style: none; max-height: 240px; overflow: auto; }
.eli5-list button { width: 100%; display: grid; text-align: start; background: none; border: 0; border-bottom: 1px solid var(--ec-edge); color: inherit; padding: 8px; font: inherit; cursor: pointer; }
.eli5-list button:hover, .eli5-list button[aria-pressed=true] { background: var(--ec-soft); }
.eli5-list button span { color: var(--ec-muted); }
.eli5-detail { border-top: 1px solid var(--ec-edge); margin-top: 12px; padding-top: 10px; }
.eli5-detail figure { max-width: 520px; }
.eli5-detail pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.eli5-force-frame, .eli5-force-canvas, .eli5-node-labels, .eli5-force-error { position: absolute; inset: 0; }
.eli5-force-canvas { background: var(--ec-bg); }
.eli5-node-labels { width: 100%; height: 100%; pointer-events: none; }
.eli5-force-error { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--ec-muted); }
.eli5-library { border-top: 1px solid var(--ec-edge); margin-top: 20px; }
.eli5-popup form.eli5-ask, .eli5-settings form.eli5-ask { display: flex; margin: 12px 0 0; gap: 6px; }
.eli5-ask input { flex: 1; min-width: 0; padding: 7px 9px; border: 1px solid var(--ec-edge); border-radius: 6px; background: var(--ec-bg); color: inherit; font: inherit; }
.eli5-ask button { flex: none; }
.eli5-followups:empty { display: none; }
.eli5-followups { border-top: 1px solid var(--ec-edge); margin-top: 12px; }
.eli5-question { width: fit-content; max-width: 90%; margin: 12px 0 8px auto; padding: 6px 9px; border-radius: 7px; background: var(--ec-soft); font-weight: 550; }
.eli5-answer { margin: 8px 0 12px; white-space: pre-wrap; }
.eli5-graph-preview { z-index: 9999; width: min(278px, calc(100vw - 24px)); overflow: hidden; pointer-events: none; padding: 10px 12px; }
.eli5-graph-preview p { margin: 7px 0; }
.eli5-preview-title { display: block; margin-block: 3px 6px; }
`;
