/**
 * 客户证言轮播折叠 —— Node（jsdom）与 Worker（linkedom）共用模块。
 *
 * 从 `scripts/update/fetch.ts` 抽出，消除两份逻辑漂移：Node 抓取链与
 * Worker/Defuddle 抓取链必须对同一批轮播 DOM 做出相同处理，否则
 * `FETCH_BACKEND=worker` 时 16 张 logo 会再次进入 Markdown/D1。
 *
 * 本模块只用 WHATWG 常用 DOM API（querySelectorAll / remove / append /
 * contains / createElement ...），jsdom 与 linkedom 均实现。类型用最小
 * 结构接口 `CarouselNode` 描述，不依赖具体 DOM 实现类型（worker tsconfig
 * 无 DOM lib），调用方在边界处做一次窄化转换。
 */

const CAROUSEL_CONTAINER_PATTERN = /(^|[\s_-])carousel([\s_-]|$)/i;
const CAROUSEL_ITEM_PATTERN = /(^|[\s_-])carousel[-_]?item([\s_-]|$)/i;
const CAROUSEL_UI_PATTERN =
  /(^|[\s_-])(pagination|dots?|indicators?|arrows?|prev|next|controls?|navigation|nav|counter|progress)([\s_-]|$)/i;
const LOGO_ALT_PATTERN = /logo/i;
const MAX_CAROUSEL_ITEMS = 3;

/** 轮播折叠用到的 Document 最小结构（jsdom / linkedom 均满足）。 */
export interface CarouselDocument {
  createElement(tagName: string): CarouselNode;
  createTextNode(text: string): CarouselNode;
}

/** 轮播折叠用到的 Element 最小结构（jsdom / linkedom 均满足）。 */
export interface CarouselNode {
  ownerDocument: CarouselDocument;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): Iterable<CarouselNode>;
  querySelector(selector: string): CarouselNode | null;
  remove(): void;
  append(...nodes: Array<CarouselNode | string>): void;
  appendChild<T extends CarouselNode>(node: T): T;
  contains(node: CarouselNode): boolean;
  parentElement: CarouselNode | null;
  readonly children: Iterable<CarouselNode>;
  textContent: string | null;
}

function isCarouselItem(element: CarouselNode): boolean {
  const token = `${element.getAttribute('class') ?? ''} ${element.getAttribute('id') ?? ''}`;
  if (CAROUSEL_ITEM_PATTERN.test(token)) return true;
  const image = element.querySelector('img');
  return Boolean(
    image && LOGO_ALT_PATTERN.test(image.getAttribute('alt') ?? '') && element.querySelector('blockquote'),
  );
}

function findCarouselContainers(root: CarouselNode): CarouselNode[] {
  const candidates: CarouselNode[] = [];
  const scan = [root, ...root.querySelectorAll('*')];

  // Heuristic: an element whose class/id mentions "carousel" ...
  for (const element of scan) {
    const token = `${element.getAttribute('class') ?? ''} ${element.getAttribute('id') ?? ''}`;
    if (CAROUSEL_CONTAINER_PATTERN.test(token)) candidates.push(element);
  }
  // ... or a wrapper that directly carries at least 2 items shaped like
  // "logo image + blockquote" (this is what survives Readability, which
  // strips class names before Turndown ever runs).
  for (const element of scan) {
    let itemChildren = 0;
    for (const child of element.children) {
      if (isCarouselItem(child)) itemChildren += 1;
    }
    if (itemChildren >= 2) candidates.push(element);
  }

  const unique = [...new Set(candidates)];
  // Only the outermost container of a nesting chain is collapsed, otherwise
  // inner wrappers (e.g. a track) would be processed repeatedly.
  return unique.filter(
    (candidate) => !unique.some((other) => other !== candidate && other.contains(candidate)),
  );
}

function findCarouselItems(container: CarouselNode): CarouselNode[] {
  const matches = [...container.querySelectorAll('*')].filter((element) => isCarouselItem(element));
  // A wrapper (e.g. the track) also matches the "logo + quote" shape, so keep
  // only the deepest matches — an element that contains another match is a
  // wrapper, not a slide.
  return matches.filter((item) => !matches.some((other) => other !== item && item.contains(other)));
}

/**
 * Collapse testimonial carousels before noise removal and Markdown conversion.
 * Readability flattens the whole carousel DOM (e.g. 16 slides), which Turndown
 * then renders as 16 standalone logo images plus un-attributed quotes. Keep
 * only the first MAX_CAROUSEL_ITEMS slides (logo + quote + attribution), drop
 * UI chrome (page counters, arrows, dots, navigation) and append a pointer to
 * the original article. Non-carousel content is left untouched.
 */
export function collapseCarousels(root: CarouselNode, articleUrl: string): void {
  const containers = findCarouselContainers(root);
  if (!containers.length) return;

  for (const container of containers) {
    const items = findCarouselItems(container);
    if (!items.length) continue;

    const kept = items.slice(0, MAX_CAROUSEL_ITEMS);
    const keptSet = new Set(kept);
    for (const item of items.slice(MAX_CAROUSEL_ITEMS)) item.remove();

    // Remove carousel chrome (counter, arrows, dots, nav) while preserving
    // wrappers that contain kept items (e.g. the track element).
    for (const ui of container.querySelectorAll('[class], [id]')) {
      if (keptSet.has(ui)) continue;
      if (kept.some((item) => item.contains(ui) || ui.contains(item))) continue;
      const token = `${ui.getAttribute('class') ?? ''} ${ui.getAttribute('id') ?? ''}`;
      if (CAROUSEL_UI_PATTERN.test(token)) ui.remove();
    }

    const doc = container.ownerDocument;
    const note = doc.createElement('p');
    const link = doc.createElement('a');
    link.setAttribute('href', articleUrl);
    link.textContent = '原文';
    note.append(doc.createTextNode('更多客户证言请见'));
    note.appendChild(link);
    note.append(doc.createTextNode('。'));
    container.appendChild(note);
  }
}
