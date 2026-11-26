import { makeMatcher } from './src/matching.js';
import { artifactHtml, cleanTerm, markdownFor, resolveLinks, svgFor, validTerm } from './src/card.js';
import { attachHighlights } from './src/highlights.js';
import { mountForceGraph } from './src/force-graph.js';
import { css } from './src/style.js';
import { clampPopupPosition, POPUP_MARGIN } from './src/popup-position.js';
import { EXCLUDED_TEXT, isMessageSelection, readTurnContext } from './src/turn-context.js';

const inChinese = () => document.documentElement.lang.toLowerCase().startsWith('zh');
const t = (zh, en) => inChinese() ? zh : en;
const routeKey = route => route ? JSON.stringify([route.provider, route.model]) : '';
const message = error => error?.code === 'eli5Cards/format'
  ? t('模型返回的内容格式不正确。', 'The model returned an invalid response.')
  : error?.message || t('操作失败，请重试。', 'Something went wrong. Try again.');

window.__ModuleLoader__.load({
  id: '@local/dsh-eli5-card',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
    function Button({ children, ...props }) {
      return h('button', { className: 'eli5-button', type: 'button', ...props }, children);
    }
    function download(card) {
      const url = URL.createObjectURL(new Blob([artifactHtml(card)], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.term.replace(/[^\p{L}\p{N} _-]/gu, '_')}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function Card({ card, matcher, onOpen, source, ask, showExports = false }) {
      const [feedback, setFeedback] = useState('');
      const [updated, setUpdated] = useState(card);
      const [question, setQuestion] = useState('');
      const [pending, setPending] = useState(false);
      const [error, setError] = useState('');
      const request = useRef(null), end = useRef(null);
      useEffect(() => () => request.current?.abort(), []);
      useEffect(() => { if (pending || updated !== card) end.current?.scrollIntoView({ block: 'nearest' }); }, [pending, updated]);
      const submit = async event => {
        event.preventDefault();
        if (request.current || !question.trim()) return;
        const controller = new AbortController();
        request.current = controller; setPending(true); setError('');
        try {
          const { card: next } = await ask(card.id, question.trim(), controller.signal);
          if (!controller.signal.aborted) { setUpdated(next); setQuestion(''); }
        } catch (error) { if (!controller.signal.aborted) setError(message(error)); }
        finally { request.current = null; if (!controller.signal.aborted) setPending(false); }
      };
      const copy = async () => {
        try { await navigator.clipboard.writeText(markdownFor(updated)); setFeedback(t('已复制', 'Copied')); }
        catch (error) { setFeedback(message(error)); }
      };
      return h(React.Fragment, null,
        h('h2', { className: 'eli5-title' }, card.title),
        h('figure', { className: 'eli5-picture', dangerouslySetInnerHTML: { __html: svgFor(card.visual) } }),
        h('p', { className: 'eli5-summary' }, card.summary),
        h('p', { className: 'eli5-analogy' }, h('strong', null, t('打个比方', 'An analogy')), ' · ', card.analogy),
        card.related.length > 0 && h('details', null, h('summary', null, t('相关概念', 'Related concepts')),
          h('ul', null, card.related.map(link => {
            const target = matcher.lookup(link.term);
            return h('li', { key: link.term }, target ? h('button', { type: 'button', className: 'eli5-link', onClick: () => onOpen(target.id) }, link.term) : h('strong', null, link.term), ' · ', link.reason);
          }))),
        source,
        showExports && h('details', null, h('summary', null, t('Markdown 元数据', 'Markdown metadata')), h('pre', null, markdownFor(updated)),
          h('div', { className: 'eli5-bar' }, h(Button, { onClick: () => download(updated) }, t('下载 HTML', 'Download HTML')),
            h(Button, { onClick: copy }, t('复制 Markdown', 'Copy Markdown')), h('span', { role: 'status' }, feedback))),
        h('div', { className: 'eli5-followups', 'aria-live': 'polite' }, (updated.followUps ?? []).map((turn, i) =>
          h('div', { key: i }, h('p', { className: 'eli5-question' }, turn.question), h('p', { className: 'eli5-answer' }, turn.answer)))),
        (updated.followUps?.length ?? 0) < 100 && h('form', { className: 'eli5-ask', onSubmit: submit, 'aria-busy': pending },
          h('input', { 'aria-label': t('追问', 'Follow-up question'), placeholder: t('追问…', 'Ask a follow-up…'), maxLength: 500,
            value: question, onChange: event => setQuestion(event.target.value), readOnly: pending }),
          h(Button, { type: 'submit', disabled: pending || !question.trim() }, pending ? '…' : t('发送', 'Send'))),
        error && h('p', { role: 'alert' }, error), h('div', { ref: end }));
    }
    function Graph({ cards, readCard, onOpen, cardOpen }) {
      const [failed, setFailed] = useState(false);
      const [preview, setPreview] = useState(null);
      const [ready, setReady] = useState(false);
      const canvas = useRef(null), previewEl = useRef(null);
      const callbacks = useRef(null);
      const { edges } = useMemo(() => resolveLinks(cards), [cards]);
      const byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
      const hovered = useRef(null);
      const hover = (id, anchor) => {
        if (!id || !anchor || cardOpen) { hovered.current = null; setPreview(null); return; }
        if (id === hovered.current?.id) return;
        hovered.current = { id, anchor };
        setPreview(hovered.current);
      };
      const openNode = (id, anchor, trigger) => { hover(null); onOpen(id, anchor, trigger); };
      callbacks.current = { hover, openNode };
      const stageKey = useMemo(() => JSON.stringify([cards.map(({ id, term }) => [id, term]), edges.map(({ from, to }) => [from, to])]), [cards, edges]);
      useEffect(() => {
        if (!canvas.current || failed) return;
        callbacks.current.hover(null);
        const controller = new AbortController();
        setReady(false);
        void mountForceGraph(canvas.current, { cards, edges, signal: controller.signal,
          onOpen: (id, anchor) => callbacks.current.openNode(id, anchor),
          onHover: (id, anchor) => callbacks.current.hover(id, anchor),
          onFailure: () => setFailed(true),
        }).then(() => { if (!controller.signal.aborted) setReady(true); })
          .catch(() => { if (!controller.signal.aborted) { callbacks.current.hover(null); setFailed(true); } });
        return () => controller.abort();
      }, [failed, stageKey]);
      const summary = preview && byId.get(preview.id);
      useEffect(() => {
        if (!summary) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
          void readCard(summary.id, controller.signal).then(({ card }) => {
            if (!controller.signal.aborted) setPreview(current => current?.id === summary.id ? { ...current, card } : current);
          }).catch(() => {});
        }, 160);
        const clear = () => hover(null);
        const escape = event => { if (event.key === 'Escape') clear(); };
        window.addEventListener('scroll', clear, true);
        window.addEventListener('resize', clear);
        document.addEventListener('keydown', escape);
        return () => {
          clearTimeout(timer); controller.abort();
          window.removeEventListener('scroll', clear, true);
          window.removeEventListener('resize', clear);
          document.removeEventListener('keydown', escape);
        };
      }, [summary?.id, summary?.createdAt]);
      useLayoutEffect(() => {
        const el = previewEl.current;
        if (!el || !preview) return;
        const glass = { width: el.offsetWidth, height: el.offsetHeight };
        const { left: x, top, bottom } = preview.anchor;
        const left = x + glass.width + 24 < innerWidth ? x + 14 : x - glass.width - 14;
        const point = clampPopupPosition({ left, top: (top + bottom) / 2 - 12 }, glass, { viewportWidth: innerWidth, viewportHeight: innerHeight });
        el.style.left = `${point.left}px`; el.style.top = `${point.top}px`;
      }, [preview]);
      return h(React.Fragment, null,
        h('div', { className: 'eli5-force-frame', 'aria-busy': !ready && !failed },
          h('div', { className: 'eli5-force-canvas', ref: canvas, role: 'img', 'aria-label': t('三维知识图谱', '3D knowledge graph') }),
          failed && h('div', { className: 'eli5-force-error', role: 'alert' },
            h('span', null, t('3D 图谱不可用', '3D graph unavailable')),
            h(Button, { onClick: () => setFailed(false) }, t('重试', 'Retry')))),
        summary && h('aside', { ref: previewEl, className: 'eli5-root eli5-popup eli5-graph-preview', 'aria-hidden': true },
          summary.term !== summary.title && h('span', { className: 'eli5-muted' }, summary.term),
          h('strong', { className: 'eli5-preview-title' }, summary.title),
          preview.card && h('figure', { className: 'eli5-picture', dangerouslySetInnerHTML: { __html: svgFor(preview.card.visual) } }),
          h('p', null, summary.summary),
          h('span', { className: 'eli5-muted' }, t('点击节点查看完整卡片', 'Click the node for the full card'))));
    }
    return {
      inject: ['slots', 'connection', 'uiWorkspace', 'sessions', 'workspaces'],
      apply(ctx) {
        const lifetime = new AbortController();
        const call = async (request, signal = lifetime.signal) => {
          const result = await ctx.connection.rpc.call('/api', 'eli5Cards/dispatch', { args: { request } }, signal);
          if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
          return result.value;
        };
        let library = null;
        let popup = null;
        let active = null;
        const librarySubs = new Set(), popupSubs = new Set();
        const watch = set => listener => { set.add(listener); return () => set.delete(listener); };
        const onLibrary = watch(librarySubs), onPopup = watch(popupSubs);
        const readLibrary = () => library, readPopup = () => popup;
        const publish = value => { popup = value; popupSubs.forEach(listener => listener()); };
        let refreshId = 0;
        async function refresh() {
          const id = ++refreshId;
          try {
            const response = await call({ action: 'list' });
            if (id === refreshId && !lifetime.signal.aborted) {
              library = response;
              librarySubs.forEach(listener => listener());
            }
            return response;
          } catch (error) {
            if (id === refreshId && !lifetime.signal.aborted) {
              library = { cards: [], settings: { prompt: '', background: '', route: null, storagePath: '' }, error: message(error) };
              librarySubs.forEach(listener => listener());
            }
            throw error;
          }
        }
        let returnFocus;
        function close() {
          active?.abort(); active = null; publish(null);
          if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
          returnFocus = null;
        }
        async function show(request, label, anchor, trigger = null, graph = false) {
          if (trigger) returnFocus = trigger;
          active?.abort();
          const controller = new AbortController();
          active = controller;
          const signal = AbortSignal.any([lifetime.signal, controller.signal]);
          publish({ label, anchor, graph, status: 'loading', request });
          try {
            const { card } = await call(request, signal);
            if (signal.aborted) return;
            publish({ label, anchor, graph, status: 'ready', card });
            if (request.action === 'explain') void refresh().catch(() => {});
          } catch (error) {
            if (!signal.aborted) publish({ label, anchor, graph, status: 'error', error: message(error), request });
          }
        }
        const open = (id, anchor, trigger) => show({ action: 'read', id }, '', anchor, trigger);
        const openGraphCard = (id, anchor, trigger) => show({ action: 'read', id }, '', anchor, trigger, true);
        const readCard = (id, signal) => call({ action: 'read', id }, AbortSignal.any([lifetime.signal, signal]));
        const ask = (id, question, signal) => call({ action: 'ask', id, question }, AbortSignal.any([lifetime.signal, signal]));
        function Overlay() {
          const data = useSyncExternalStore(onLibrary, readLibrary);
          const state = useSyncExternalStore(onPopup, readPopup);
          const [selected, setSelected] = useState(null);
          useEffect(() => {
            const sourceOf = node => (node instanceof Element ? node : node.parentElement)?.closest('[data-text-interaction-source]');
            let frame = 0, dragging = false;
            const update = () => {
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(() => {
                const selection = document.getSelection();
                if (dragging || !selection || selection.isCollapsed || selection.rangeCount !== 1) { setSelected(null); return; }
                const range = selection.getRangeAt(0);
                const source = sourceOf(range.startContainer);
                const scope = source?.closest('[data-conversation-session]');
                const sessionId = scope?.getAttribute('data-conversation-session');
                const term = cleanTerm(selection.toString());
                const elementOf = node => node instanceof Element ? node : node.parentElement;
                if (!source || sourceOf(range.endContainer) !== source || !sessionId || !validTerm(term)
                  || !isMessageSelection(source, range) || [range.startContainer, range.endContainer].some(node => elementOf(node)?.closest(EXCLUDED_TEXT))) {
                  setSelected(null); return;
                }
                const viewport = source.closest('[data-conversation-scroll]')?.getBoundingClientRect();
                const composer = scope.querySelector('[data-composer-seat]')?.getBoundingClientRect();
                const top = Math.max(0, viewport?.top ?? 0);
                const bottom = Math.min(innerHeight, viewport?.bottom ?? innerHeight, composer?.height ? composer.top : innerHeight);
                const rect = [...range.getClientRects()].find(r => r.width > 0 && r.bottom > top && r.top < bottom && r.right > 0 && r.left < innerWidth);
                if (!rect) { setSelected(null); return; }
                // The host owns Quote and its layout; place our sibling outside its bounds.
                const surface = scope.querySelector('[data-text-interaction-surface][aria-hidden="false"]');
                const native = surface && getComputedStyle(surface).visibility === 'visible' ? surface.getBoundingClientRect() : null;
                setSelected({ term, sessionId, rect, source, scope, range: range.cloneRange(), native: native?.width && native.height ? native : null });
              });
            };
            const down = event => {
              if (event.target.closest?.('.eli5-selection-action')) return;
              dragging = event.button === 0;
              setSelected(null);
            };
            const up = () => { dragging = false; update(); };
            const escape = event => { if (event.key === 'Escape') { cancelAnimationFrame(frame); setSelected(null); } };
            document.addEventListener('pointerdown', down, true);
            document.addEventListener('pointerup', up);
            document.addEventListener('pointercancel', up);
            document.addEventListener('keydown', escape);
            document.addEventListener('selectionchange', update);
            document.addEventListener('scroll', update, true);
            window.addEventListener('resize', update);
            return () => {
              cancelAnimationFrame(frame);
              document.removeEventListener('pointerdown', down, true);
              document.removeEventListener('pointerup', up);
              document.removeEventListener('pointercancel', up);
              document.removeEventListener('keydown', escape);
              document.removeEventListener('selectionchange', update);
              document.removeEventListener('scroll', update, true);
              window.removeEventListener('resize', update);
            };
          }, []);
          const ref = useRef(null);
          const [position, setPosition] = useState(undefined);
          const manualPosition = useRef(null);
          const drag = useRef(null);
          const clampPosition = (el, point) => clampPopupPosition(point, { width: el.offsetWidth, height: el.offsetHeight },
            { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
          const movePopup = (el, point) => {
            manualPosition.current = clampPosition(el, point);
            setPosition(manualPosition.current);
          };
          const matcher = useMemo(() => makeMatcher(data?.cards ?? []), [data]);
          useEffect(() => {
            void refresh().catch(() => {});
            const timer = setInterval(() => void refresh().catch(() => {}), 30000);
            return () => clearInterval(timer);
          }, []);
          useEffect(() => attachHighlights(matcher, open), [matcher]);
          useEffect(() => {
            if (!state) return;
            const pointer = event => {
              if (ref.current?.contains(event.target) || event.target.closest?.('.eli5-selection-action')) return;
              close();
            };
            const keyboard = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
            document.addEventListener('pointerdown', pointer);
            document.addEventListener('keydown', keyboard, true);
            return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', keyboard, true); };
          }, [Boolean(state)]);
          useLayoutEffect(() => {
            const el = ref.current;
            if (!el) return;
            const place = () => {
              if (drag.current) return;
              const anchor = state.anchor;
              const width = el.offsetWidth, height = el.offsetHeight, margin = POPUP_MARGIN;
              if (manualPosition.current) {
                setPosition(clampPosition(el, manualPosition.current));
                return;
              }
              const room = innerHeight - height - margin;
              const below = (anchor?.bottom ?? margin) + 8;
              const above = (anchor?.top ?? margin) - 8 - height;
              const top = anchor ? (below <= room ? below : above >= margin ? above : room) : (innerHeight - height) / 2;
              setPosition(clampPosition(el, { left: anchor?.left ?? (innerWidth - width) / 2, top }));
            };
            place();
            const observer = new ResizeObserver(place);
            observer.observe(el); window.addEventListener('resize', place);
            return () => { observer.disconnect(); window.removeEventListener('resize', place); };
          }, [state]);
          useEffect(() => {
            if (state) ref.current?.focus({ preventScroll: true });
            else { drag.current = null; manualPosition.current = null; setPosition(undefined); }
          }, [Boolean(state)]);
          const startDrag = event => {
            if (drag.current || !event.isPrimary || event.button !== 0 || event.target.closest?.('button')) return;
            const el = ref.current;
            if (!el) return;
            const left = position?.left ?? el.offsetLeft, top = position?.top ?? el.offsetTop;
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          };
          const moveDrag = event => {
            const origin = drag.current, el = ref.current;
            if (!origin || origin.id !== event.pointerId || !el) return;
            movePopup(el, { left: origin.left + event.clientX - origin.x, top: origin.top + event.clientY - origin.y });
          };
          const endDrag = event => {
            if (drag.current?.id !== event.pointerId) return;
            drag.current = null;
            if (ref.current && manualPosition.current) movePopup(ref.current, manualPosition.current);
          };
          const nudgeDrag = event => {
            const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
            if (!delta) return;
            event.preventDefault();
            const el = ref.current;
            if (!el) return;
            movePopup(el, { left: el.offsetLeft + delta[0], top: el.offsetTop + delta[1] });
          };
          const popup = state && h('section', { className: 'eli5-root eli5-popup', ref, style: position, role: 'dialog', 'aria-label': t('解释卡片', 'Explanation card'), tabIndex: -1 },
            h('div', { className: 'eli5-bar eli5-caption eli5-drag-handle', onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag, onKeyDown: event => { if (event.target === event.currentTarget) nudgeDrag(event); }, tabIndex: 0, 'aria-label': t('移动卡片', 'Move card') }, h('span', null, state.card && state.card.term === state.card.title ? '' : state.card?.term || state.label || t('解释卡片', 'Explanation card')),
              h(Button, { onClick: close, title: t('关闭', 'Close'), 'aria-label': t('关闭解释', 'Close explanation') }, '×')),
            state.status === 'ready' ? h(Card, { key: state.card.id, card: state.card, matcher, ask,
              onOpen: id => (state.graph ? openGraphCard : open)(id, state.anchor),
              source: state.graph && state.card.sourceSessionId && h(SourceConversation, { id: state.card.sourceSessionId, onNavigate: close }) }) :
              state.status === 'loading' ? h('p', { className: 'eli5-pending', role: 'status' }, state.request.action === 'explain' ? t('正在生成图解…', 'Creating an illustration…') : t('正在读取…', 'Loading…')) :
              h('div', { role: 'alert' }, h('p', null, state.error), h(Button, { onClick: () => show(state.request, state.label, state.anchor, null, state.graph) }, t('重试', 'Retry'))));
          const actionRef = useRef(null);
          useLayoutEffect(() => {
            const el = actionRef.current;
            if (!el || !selected) return;
            const { rect, native } = selected;
            const { offsetWidth: width, offsetHeight: height } = el;
            const margin = 8, gap = 4;
            const clamp = (n, max) => Math.max(margin, Math.min(n, max - margin));
            let left = rect.left + (rect.width - width) / 2;
            let top = rect.top - gap - height >= margin ? rect.top - gap - height : rect.bottom + gap;
            if (native) {
              if (native.right + gap + width <= innerWidth - margin) {
                left = native.right + gap; top = native.top + (native.height - height) / 2;
              } else if (native.left - gap - width >= margin) {
                left = native.left - gap - width; top = native.top + (native.height - height) / 2;
              } else {
                left = native.left; top = native.top - gap - height >= margin ? native.top - gap - height : native.bottom + gap;
              }
            }
            el.style.left = `${clamp(left, innerWidth - width)}px`;
            el.style.top = `${clamp(top, innerHeight - height)}px`;
          }, [selected, Boolean(state)]);
          const selectionAction = selected && !state && h('div', { className: 'eli5-selection-action', ref: actionRef }, h('button', {
            type: 'button', className: 'eli5-quote-action', onPointerDown: event => event.preventDefault(), onClick: () => {
              const { rect, term, sessionId, source, scope, range } = selected;
              const context = readTurnContext(source, range, scope);
              const request = { action: 'explain', term, sessionId, language: inChinese() ? 'zh' : 'en', ...(context ? { context } : {}) };
              document.getSelection()?.removeAllRanges();
              setSelected(null);
              void show(request, term, rect);
            },
          }, t('解释', 'Explain')));
          return h(React.Fragment, null, selectionAction, popup);
        }
        function SourceConversation({ id, onNavigate }) {
          const sessions = ctx.sessions.list, workspaces = ctx.workspaces.list;
          const sources = useMemo(() => ({
            subscribeSessions: listener => sessions.subscribe(listener),
            subscribeWorkspaces: listener => workspaces.subscribe(listener),
            readSessions: () => sessions.getSnapshot(),
            readWorkspaces: () => workspaces.getSnapshot(),
          }), [sessions, workspaces]);
          const sessionList = useSyncExternalStore(sources.subscribeSessions, sources.readSessions);
          const workspaceList = useSyncExternalStore(sources.subscribeWorkspaces, sources.readWorkspaces);
          const canOpen = (s, w) => s.ids.includes(id) && w.phase === 'ready' && w.state !== 'error' && !w.archivedSessionIds.includes(id);
          return h('div', { className: 'eli5-source' }, h(Button, { disabled: !canOpen(sessionList, workspaceList), onClick: () => {
            if (canOpen(sources.readSessions(), sources.readWorkspaces())) { onNavigate?.(); ctx.uiWorkspace.openSession(id); }
          } }, t('跳转到来源会话', 'Open source conversation')));
        }
        function GraphPage() {
          const data = useSyncExternalStore(onLibrary, readLibrary);
          const cardOpen = useSyncExternalStore(onPopup, () => Boolean(readPopup()));
          const [settingsOpen, setSettingsOpen] = useState(false);
          useEffect(() => {
            void refresh().catch(() => {});
            return () => { if (readPopup()?.graph) close(); };
          }, []);
          return h('section', { className: 'eli5-root eli5-graph-page', 'aria-label': t('知识图谱', 'Knowledge graph') },
            data?.error ? h('p', { role: 'alert' }, data.error)
              : data && h(Graph, { cards: data.cards, onOpen: openGraphCard, readCard, cardOpen }),
            h('button', { type: 'button', className: 'eli5-graph-settings-toggle', 'aria-label': t('图谱设置', 'Graph settings'), 'aria-expanded': settingsOpen,
              onClick: () => setSettingsOpen(value => !value) },
              h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true },
                h('circle', { cx: 12, cy: 12, r: 3 }), h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 3.12-.08-.02a1.7 1.7 0 0 0-1.7.32l-.07.06h-3.6l-.04-.08a1.7 1.7 0 0 0-1.4-1.02l-.09-.01-1.8-3.12.06-.06A1.7 1.7 0 0 0 9.6 14l-.02-.09v-3.6l.08-.04a1.7 1.7 0 0 0 1.02-1.4l.01-.09 3.12-1.8.06.06a1.7 1.7 0 0 0 1.88.34l.06-.02 3.12 1.8-.02.08a1.7 1.7 0 0 0 .32 1.7l.06.07v3.6z' }))
            ),
            settingsOpen && data && h(GraphSettings, { settings: data.settings, onClose: () => setSettingsOpen(false) }));
        }
        function GraphSettings({ settings, onClose }) {
          const [draft, setDraft] = useState(settings);
          const [models, setModels] = useState(null);
          const [modelError, setModelError] = useState('');
          const [saving, setSaving] = useState(false);
          const [notice, setNotice] = useState('');
          useEffect(() => { setDraft(settings); }, [settings]);
          useEffect(() => {
            const escape = event => { if (event.key === 'Escape') onClose(); };
            document.addEventListener('keydown', escape);
            return () => document.removeEventListener('keydown', escape);
          }, [onClose]);
          useEffect(() => {
            const controller = new AbortController();
            const signal = AbortSignal.any([controller.signal, lifetime.signal]);
            void call({ action: 'models' }, signal).then(value => { if (!signal.aborted) setModels(value); })
              .catch(error => { if (!signal.aborted) setModelError(message(error)); });
            return () => controller.abort();
          }, []);
          const save = async event => {
            event.preventDefault(); setSaving(true); setNotice('');
            try {
              await call({ action: 'settings', settings: draft });
              await refresh(); setNotice(t('已保存设置', 'Settings saved'));
            } catch (error) { setNotice(message(error)); }
            finally { setSaving(false); }
          };
          return h('aside', { className: 'eli5-root eli5-graph-settings', 'aria-label': t('图谱设置', 'Graph settings') },
            h('div', { className: 'eli5-graph-settings-head' }, h('strong', null, t('设置', 'Settings')),
              h('button', { type: 'button', className: 'eli5-graph-settings-close', 'aria-label': t('关闭设置', 'Close settings'), onClick: onClose }, '×')),
            h('form', { onSubmit: save },
              h('label', null, t('解释模型', 'Explanation model'), h('select', { value: routeKey(draft.route), onChange: event => {
                const route = models?.models.find(model => routeKey(model) === event.target.value);
                setDraft(value => ({ ...value, route: route ? { provider: route.provider, model: route.model } : null }));
              } },
                h('option', { value: '' }, t('使用当前会话模型', 'Use current conversation model')),
                draft.route && !models?.models.some(model => routeKey(model) === routeKey(draft.route)) && h('option', { value: routeKey(draft.route) }, `${draft.route.model} · ${draft.route.provider}`),
                models?.models.map(model => h('option', { key: routeKey(model), value: routeKey(model) }, model.label)))),
              !models && !modelError && h('p', { className: 'eli5-muted', role: 'status' }, t('正在读取模型列表…', 'Loading models…')),
              (modelError || models?.incomplete) && h('p', { className: 'eli5-muted', role: 'status' }, modelError || t('部分模型暂时不可用。', 'Some models are temporarily unavailable.')),
              h('label', null, t('卡片库文件', 'Card library file'), h('input', { value: draft.storagePath ?? '', onChange: event => setDraft(value => ({ ...value, storagePath: event.target.value })),
                placeholder: t('默认位置', 'Default location'), spellCheck: false, maxLength: 4096 })),
              h('label', null, t('解释 Prompt', 'Explanation prompt'), h('textarea', { value: draft.prompt || '', onChange: event => setDraft(value => ({ ...value, prompt: event.target.value })), maxLength: 3000, rows: 5 })),
              h('button', { type: 'submit', className: 'eli5-button', disabled: saving }, saving ? t('保存中…', 'Saving…') : t('保存设置', 'Save settings')),
              notice && h('p', { role: 'status' }, notice)));
        }
        function Settings() {
          const data = useSyncExternalStore(onLibrary, readLibrary);
          const [draft, setDraft] = useState(null);
          const [models, setModels] = useState(null);
          const [modelError, setModelError] = useState('');
          const [modelRetry, setModelRetry] = useState(0);
          const [notice, setNotice] = useState('');
          const [selected, setSelected] = useState(null);
          const [pendingDelete, setPendingDelete] = useState(null);
          const [saving, setSaving] = useState(false);
          const [query, setQuery] = useState('');
          const detailRef = useRef(null);
          useEffect(() => { void refresh().catch(error => setNotice(message(error))); }, []);
          useEffect(() => { if (!selected?.loading) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [selected]);
          useEffect(() => {
            if (models) return;
            const controller = new AbortController();
            const signal = AbortSignal.any([controller.signal, lifetime.signal]);
            setModelError('');
            void call({ action: 'models' }, signal).then(value => {
              if (!signal.aborted) setModels(value);
            }).catch(error => {
              if (!signal.aborted) setModelError(message(error));
            });
            return () => controller.abort();
          }, [models, modelRetry]);
          const cards = data?.cards ?? [];
          const matcher = useMemo(() => makeMatcher(cards), [cards]);
          const settings = draft ?? data?.settings ?? { prompt: '', background: '', route: null, storagePath: '' };
          const update = patch => { setDraft({ ...settings, ...patch }); setNotice(''); };
          const save = async event => {
            event.preventDefault(); setSaving(true); setNotice('');
            try { await call({ action: 'settings', settings }); close(); await refresh(); get.current++; setSelected(null); setPendingDelete(null); setDraft(null); setNotice(t('已保存设置', 'Settings saved')); }
            catch (error) { setNotice(message(error)); }
            finally { setSaving(false); }
          };
          const get = useRef(0);
          async function read(id) {
            const n = ++get.current;
            setNotice(''); setSelected({ id, loading: true });
            try { const { card } = await call({ action: 'read', id }); if (n === get.current) setSelected(card); }
            catch (error) { if (n === get.current) { setSelected(null); setNotice(message(error)); } }
          }
          async function remove(id) {
            setSaving(true);
            try { await call({ action: 'remove', id }); setSelected(null); setPendingDelete(null); await refresh(); }
            catch (error) { setNotice(message(error)); }
            finally { setSaving(false); }
          }
          const match = query.trim().toLowerCase();
          const results = cards.filter(card => !match || [card.term, card.title, ...card.aliases, ...card.tags].some(value => value.toLowerCase().includes(match)));
          const detail = selected && h('section', { className: 'eli5-detail', ref: detailRef, 'aria-label': t('卡片详情', 'Card details') },
            h('div', { className: 'eli5-bar eli5-caption' }, h('span', null, t('卡片详情', 'Card details')), h(Button, { onClick: () => { get.current++; setSelected(null); setPendingDelete(null); } }, t('关闭', 'Close'))),
            selected.loading ? h('p', { role: 'status' }, t('正在读取…', 'Loading…')) : h(React.Fragment, null,
              h(Card, { key: selected.id, card: selected, matcher, onOpen: read, ask, showExports: true,
                source: selected.sourceSessionId && h(SourceConversation, { id: selected.sourceSessionId }) }),
              (pendingDelete === selected.id
                ? h('div', { className: 'eli5-bar' }, h('span', null, t('删除此解释及其高亮？', 'Delete this explanation and its highlights?')),
                  h(Button, { onClick: () => remove(selected.id), disabled: saving }, t('确认删除', 'Delete card')), h(Button, { onClick: () => setPendingDelete(null) }, t('取消', 'Cancel')))
                : h(Button, { onClick: () => setPendingDelete(selected.id) }, t('删除卡片', 'Delete card')))));
          return h('section', { className: 'eli5-root eli5-settings' },
            (notice || data?.error) && h('p', { role: 'status' }, notice || data.error),
            h('form', { onSubmit: save },
                h('label', null, t('卡片库文件', 'Card library file'), h('input', { value: settings.storagePath ?? '', onChange: e => update({ storagePath: e.target.value }),
                  placeholder: t('默认位置', 'Default location'), spellCheck: false, maxLength: 4096 })),
                h('label', null, t('基础提示词', 'Base prompt'), h('textarea', { value: settings.prompt || '', onChange: e => update({ prompt: e.target.value }), maxLength: 3000, rows: 4 })),
                h('label', null, t('专业背景', 'Professional background'), h('textarea', { value: settings.background, onChange: e => update({ background: e.target.value }), maxLength: 2000, rows: 3 })),
                h('label', null, t('解释模型', 'Explanation model'), h('select', { value: routeKey(settings.route), onChange: e => { const value = models?.models.find(model => routeKey(model) === e.target.value); update({ route: value ? { provider: value.provider, model: value.model } : null }); } },
                  h('option', { value: '' }, t('跟随当前会话', 'Follow conversation')), settings.route && !models?.models.some(model => routeKey(model) === routeKey(settings.route)) && h('option', { value: routeKey(settings.route) }, `${settings.route.model} · ${settings.route.provider}`),
                  models?.models.map(model => h('option', { key: routeKey(model), value: routeKey(model) }, model.label)))),
                !models && !modelError && h('p', { className: 'eli5-muted', role: 'status' }, t('正在读取模型列表…', 'Loading models…')),
                (modelError || models?.incomplete) && h('div', { className: 'eli5-bar' },
                  h('p', { className: 'eli5-muted', role: 'status' }, modelError || t('部分服务商的模型列表暂不可用。', 'Some provider catalogs are unavailable.')),
                  h(Button, { onClick: () => { setModels(null); setModelRetry(value => value + 1); } }, t('重试', 'Retry'))),
                h(Button, { type: 'submit', disabled: !data || !draft || saving }, t('保存设置', 'Save settings'))),
            h('section', { className: 'eli5-library', 'aria-label': t('卡片库', 'Card library') },
                  h('input', { className: 'eli5-search', type: 'search', 'aria-label': t('搜索卡片', 'Search cards'), placeholder: t('搜索卡片', 'Search cards'), value: query, onChange: e => setQuery(e.target.value) }),
                  results.length ? h('ul', { className: 'eli5-list' }, results.map(card => h('li', { key: card.id }, h('button', { type: 'button', onClick: () => read(card.id), 'aria-pressed': selected?.id === card.id }, h('strong', null, card.term), h('span', null, card.summary))))) : h('p', { className: 'eli5-empty' }, !data && !notice ? t('正在读取…', 'Loading…') : match ? t('未找到匹配的卡片。', 'No matching cards.') : t('还没有保存的解释。', 'No saved explanations.'))),
            detail);
        }
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-eli5-card'; style.textContent = css; document.head.append(style);
          return () => { lifetime.abort(); active?.abort(); style.remove(); };
        });
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'eli5-card-overlay', order: 30 }, Overlay));
        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({ name: 'settings.plugins.tab', id: 'eli5-card', order: 40, label: () => t('划词解释', 'ELI5 cards') }, Settings));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'eli5-knowledge-graph', order: 11, label: () => t('知识图谱', 'Knowledge graph') }, function GraphIcon({ size }) {
          return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M6 6l6 6 6-7M6 6l1 12 5-6 6 6M18 5v13' }),
            h('circle', { cx: 6, cy: 6, r: 2 }), h('circle', { cx: 18, cy: 5, r: 2 }),
            h('circle', { cx: 12, cy: 12, r: 2 }), h('circle', { cx: 7, cy: 18, r: 2 }), h('circle', { cx: 18, cy: 18, r: 2 }));
        }));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'eli5-knowledge-graph' }, GraphPage));
      },
    };
  },
});
