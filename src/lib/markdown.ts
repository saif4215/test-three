import "server-only";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Editable text (descriptions, policies, announcements) is Markdown. It is converted to HTML and then passed through a
 * strict allow-list, so pasted scripts, event handlers, iframes and images can never reach a visitor's browser.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a", "table", "thead", "tbody", "tr", "th", "td", "code", "pre", "hr", "del"],
  allowedAttributes: { a: ["href", "title", "rel", "target"], th: ["align"], td: ["align"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const external = /^https?:\/\//i.test(href);
      return { tagName, attribs: { ...attribs, ...(external ? { rel: "noopener noreferrer", target: "_blank" } : {}) } };
    },
  },
};

export function renderMarkdown(md: string): string {
  if (!md.trim()) return "";
  const html = marked.parse(md.slice(0, 50_000), { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(html, OPTIONS);
}

/** Plain text of some Markdown, for short previews and meta descriptions. */
export function markdownToText(md: string, max = 200): string {
  const text = sanitizeHtml(marked.parse(md.slice(0, 5000), { async: false }) as string, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
