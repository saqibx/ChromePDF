import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type NoteBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'math'; text: string }
  | { type: 'divider' }
  | { type: 'list'; ordered: boolean; kind: 'bullet' | 'checklist'; items: ListItem[] }
  | { type: 'toggle'; text: string };

type ListItem = {
  text: string;
  checked?: boolean;
  lineIndex?: number;
};

export function NotePreview({
  text,
  onToggleChecklistItem,
}: {
  text: string;
  onToggleChecklistItem?: (lineIndex: number) => void;
}) {
  const blocks = parseBlocks(text);

  return <div className="note-preview">{blocks.map((block, index) => renderBlock(block, index, onToggleChecklistItem))}</div>;
}

function parseBlocks(text: string): NoteBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: NoteBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const collected: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        collected.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', text: collected.join('\n') });
      continue;
    }

    if (trimmed === '$$') {
      const collected: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== '$$') {
        collected.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'math', text: collected.join('\n') });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const collected: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        collected.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: collected.join('\n') });
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('▸')) {
      blocks.push({ type: 'toggle', text: trimmed.slice(1).trim() });
      index += 1;
      continue;
    }

    const listMatch = trimmed.match(/^(\d+\.|-|\*)\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d+\./.test(listMatch[1]);
      const items: ListItem[] = [];
      let kind: 'bullet' | 'checklist' = 'bullet';

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentMatch = current.match(/^(\d+\.|-|\*)\s+(.*)$/);
        if (!currentMatch || /^\d+\./.test(currentMatch[1]) !== ordered) break;

        const itemText = currentMatch[2];
        const checkedMatch = current.match(/^-+\s+\[([ xX])\]\s+(.*)$/);
        if (checkedMatch) {
          items.push({
            text: checkedMatch[2],
            checked: checkedMatch[1].toLowerCase() !== ' ',
            lineIndex: index,
          });
          kind = 'checklist';
        } else {
          items.push({ text: itemText, lineIndex: index });
        }

        index += 1;
      }

      blocks.push({ type: 'list', ordered, kind, items });
      continue;
    }

    const collected: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (
        currentTrimmed.startsWith('```') ||
        currentTrimmed === '$$' ||
        currentTrimmed.startsWith('>') ||
        /^#{1,3}\s+/.test(currentTrimmed) ||
        /^---+$/.test(currentTrimmed) ||
        /^(\d+\.|-|\*)\s+/.test(currentTrimmed) ||
        currentTrimmed.startsWith('▸')
      ) {
        break;
      }

      collected.push(current);
      index += 1;
    }

    if (collected.length === 0) {
      collected.push(line);
      index += 1;
    }

    blocks.push({ type: 'paragraph', text: collected.join('\n') });
  }

  return blocks;
}

function renderBlock(
  block: NoteBlock,
  index: number,
  onToggleChecklistItem?: (lineIndex: number) => void
): React.ReactNode {
  switch (block.type) {
    case 'heading':
      return (
        <div key={index} className={`note-heading note-heading-${block.level}`}>
          {renderInline(block.text)}
        </div>
      );
    case 'paragraph':
      return (
        <div key={index} className="note-paragraph">
          {renderInline(block.text)}
        </div>
      );
    case 'quote':
      return (
        <blockquote key={index} className="note-quote">
          {renderInline(block.text)}
        </blockquote>
      );
    case 'code':
      return (
        <pre key={index} className="note-code">
          <code>{block.text}</code>
        </pre>
      );
    case 'math': {
      let html = '';
      try {
        html = katex.renderToString(block.text, { displayMode: true, throwOnError: false });
      } catch {
        html = `<span class="note-math-error">${block.text}</span>`;
      }
      return <div key={index} className="note-math-block" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    case 'divider':
      return <hr key={index} className="note-divider" />;
    case 'toggle':
      return (
        <div key={index} className="note-toggle">
          <span className="note-toggle-marker">▸</span>
          <span>{renderInline(block.text)}</span>
        </div>
      );
    case 'list':
      return block.ordered ? (
        <ol key={index} className="note-list note-list-ordered">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className={item.checked ? 'is-checked' : ''}>
              <span className="note-bullet">{itemIndex + 1}.</span>
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul key={index} className="note-list note-list-bulleted">
          {block.items.map((item, itemIndex) => {
            const handleToggle = () => {
              if (item.lineIndex != null) onToggleChecklistItem?.(item.lineIndex);
            };

            return (
              <li key={itemIndex} className={item.checked ? 'is-checked' : ''}>
                {block.kind === 'checklist' ? (
                  <button
                    type="button"
                    className="note-checkbox note-checkbox-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggle();
                    }}
                    aria-label={item.checked ? 'Mark item as unchecked' : 'Mark item as checked'}
                  >
                    {item.checked ? '☑' : '□'}
                  </button>
                ) : (
                  <span className="note-bullet">•</span>
                )}
                <span>{renderInline(item.text)}</span>
              </li>
            );
          })}
        </ul>
      );
    default:
      return null;
  }
}

function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\$\$[^$]+\$\$|\$[^$]+\$|\*\*[^*]+\*\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(...splitPreservingText(text.slice(lastIndex, match.index), `${match.index}-text`));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      tokens.push(
        <code key={`${match.index}-code`} className="note-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('$$')) {
      const mathSrc = token.slice(2, -2);
      let mathHtml = '';
      try { mathHtml = katex.renderToString(mathSrc, { displayMode: true, throwOnError: false }); } catch { mathHtml = mathSrc; }
      tokens.push(<span key={`${match.index}-math`} className="note-inline-math" dangerouslySetInnerHTML={{ __html: mathHtml }} />);
    } else if (token.startsWith('$')) {
      const mathSrc = token.slice(1, -1);
      let mathHtml = '';
      try { mathHtml = katex.renderToString(mathSrc, { displayMode: false, throwOnError: false }); } catch { mathHtml = mathSrc; }
      tokens.push(<span key={`${match.index}-math`} className="note-inline-math" dangerouslySetInnerHTML={{ __html: mathHtml }} />);
    } else if (token.startsWith('**')) {
      tokens.push(
        <strong key={`${match.index}-bold`} className="note-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('~~')) {
      tokens.push(
        <span key={`${match.index}-strike`} className="note-strike">
          {token.slice(2, -2)}
        </span>
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      tokens.push(
        <a
          key={`${match.index}-link`}
          className="note-link"
          href={linkMatch?.[2] ?? '#'}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {linkMatch?.[1] ?? token}
        </a>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    tokens.push(...splitPreservingText(text.slice(lastIndex), `${lastIndex}-tail`));
  }

  return tokens;
}

function splitPreservingText(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\n)/).map((segment, index) =>
    segment === '\n' ? <br key={`${keyPrefix}-br-${index}`} /> : segment
  );
}
