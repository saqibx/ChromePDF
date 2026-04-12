import React, { useEffect, useMemo, useRef, useState } from 'react';

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  apply: (args: CommandApplyArgs) => CommandApplyResult;
};

type CommandApplyArgs = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  triggerStart: number;
  triggerEnd: number;
};

type CommandApplyResult = {
  nextValue: string;
  caret: number;
};

type SlashState = {
  start: number;
  end: number;
  query: string;
};

interface RichNoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  onCancel: () => void;
}

const COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: ['title', 'header', 'heading'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '# ', 2),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['title', 'header', 'heading'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '## ', 3),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    keywords: ['title', 'header', 'heading'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '### ', 4),
  },
  {
    id: 'bullet',
    label: 'Bullet list',
    description: 'Start a bulleted list',
    keywords: ['list', 'bullets'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '- ', 2),
  },
  {
    id: 'number',
    label: 'Numbered list',
    description: 'Start a numbered list',
    keywords: ['list', 'ordered'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '1. ', 3),
  },
  {
    id: 'check',
    label: 'Checklist',
    description: 'Start a task list item',
    keywords: ['todo', 'task', 'checkbox'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '- [ ] ', 6),
  },
  {
    id: 'quote',
    label: 'Quote block',
    description: 'Format text as a quote',
    keywords: ['blockquote'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '> ', 2),
  },
  {
    id: 'code',
    label: 'Code block',
    description: 'Insert a fenced code block',
    keywords: ['snippet', 'monospace', 'pre'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '```\n\n```', 4),
  },
  {
    id: 'math',
    label: 'LaTeX block',
    description: 'Insert a display math block',
    keywords: ['latex', 'equation', 'formula', 'math'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '$$\n\n$$', 3),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Insert a horizontal rule',
    keywords: ['separator', 'rule'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '\n---\n', 5),
  },
  {
    id: 'link',
    label: 'Link',
    description: 'Insert a markdown link',
    keywords: ['url', 'anchor', 'reference'],
    apply: ({ value, selectionStart, selectionEnd, triggerStart, triggerEnd }) => {
      if (selectionEnd > selectionStart) {
        return wrapSelection(value, selectionStart, selectionEnd, '[', '](https://)');
      }

      return insertAtRange(value, triggerStart, triggerEnd, '[link text](https://)', 11);
    },
  },
  {
    id: 'inlineCode',
    label: 'Inline code',
    description: 'Wrap the current text in backticks',
    keywords: ['code', 'monospace', 'snippet'],
    apply: ({ value, selectionStart, selectionEnd, triggerStart, triggerEnd }) => {
      if (selectionEnd > selectionStart) {
        return wrapSelection(value, selectionStart, selectionEnd, '`', '`');
      }

      return insertAtRange(value, triggerStart, triggerEnd, '`code`', 1);
    },
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'Wrap text in bold markers',
    keywords: ['strong', 'emphasis'],
    apply: ({ value, selectionStart, selectionEnd, triggerStart, triggerEnd }) => {
      if (selectionEnd > selectionStart) {
        return wrapSelection(value, selectionStart, selectionEnd, '**', '**');
      }

      return insertAtRange(value, triggerStart, triggerEnd, '**bold**', 2);
    },
  },
  {
    id: 'italic',
    label: 'Italic',
    description: 'Wrap text in italic markers',
    keywords: ['emphasis'],
    apply: ({ value, selectionStart, selectionEnd, triggerStart, triggerEnd }) => {
      if (selectionEnd > selectionStart) {
        return wrapSelection(value, selectionStart, selectionEnd, '*', '*');
      }

      return insertAtRange(value, triggerStart, triggerEnd, '*italic*', 1);
    },
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    description: 'Wrap text in strike markers',
    keywords: ['delete', 'done'],
    apply: ({ value, selectionStart, selectionEnd, triggerStart, triggerEnd }) => {
      if (selectionEnd > selectionStart) {
        return wrapSelection(value, selectionStart, selectionEnd, '~~', '~~');
      }

      return insertAtRange(value, triggerStart, triggerEnd, '~~done~~', 2);
    },
  },
  {
    id: 'template',
    label: 'Template',
    description: 'Insert a structured note outline',
    keywords: ['outline', 'starter', 'preset'],
    apply: ({ value, triggerStart, triggerEnd }) =>
      insertAtRange(
        value,
        triggerStart,
        triggerEnd,
        '# Note title\n\n- Key point\n- Follow up\n- Open question\n',
        12
      ),
  },
  {
    id: 'toggle',
    label: 'Toggle list',
    description: 'Insert a collapsible section marker',
    keywords: ['fold', 'section', 'disclosure'],
    apply: ({ value, triggerStart, triggerEnd }) => insertAtRange(value, triggerStart, triggerEnd, '▸ ', 2),
  },
];

export function RichNoteEditor({ value, onChange, onDone, onCancel }: RichNoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [slashState, setSlashState] = useState<SlashState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!slashState) return COMMANDS;

    const query = slashState.query.trim().toLowerCase();
    if (!query) return COMMANDS;

    return COMMANDS.filter((command) => {
      const haystack = [command.id, command.label, command.description, ...command.keywords]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [slashState]);

  useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, filteredCommands.length]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const syncSlashState = (nextValue: string, cursor: number) => {
    const nextState = getSlashState(nextValue, cursor);
    setSlashState(nextState);
    setActiveIndex(0);
  };

  const applyCommand = (command: SlashCommand) => {
    if (!slashState) return;

    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? slashState.end;
    const selectionEnd = textarea?.selectionEnd ?? slashState.end;
    const result = command.apply({
      value,
      selectionStart,
      selectionEnd,
      triggerStart: slashState.start,
      triggerEnd: slashState.end,
    });

    onChange(result.nextValue);
    setSlashState(null);
    setActiveIndex(0);

    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
    });
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    const cursor = event.target.selectionStart ?? nextValue.length;
    onChange(nextValue);
    syncSlashState(nextValue, cursor);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashState && filteredCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % filteredCommands.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        applyCommand(filteredCommands[activeIndex]);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashState(null);
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onDone();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="rich-note-editor">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(event) => syncSlashState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
        onKeyUp={(event) => syncSlashState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
        onSelect={(event) => syncSlashState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
        placeholder="Add your note... Type / for commands"
        autoFocus
      />

      {slashState && filteredCommands.length > 0 && (
        <div className="slash-menu" role="listbox" aria-label="Note commands">
          <div className="slash-menu-header">
            <span>Commands</span>
            <span>/ {slashState.query || 'all'}</span>
          </div>
          {filteredCommands.map((command, index) => (
            <button
              key={command.id}
              type="button"
              className={`slash-menu-item ${index === activeIndex ? 'active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => applyCommand(command)}
            >
              <div className="slash-menu-label">{command.label}</div>
              <div className="slash-menu-description">{command.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getSlashState(value: string, cursor: number): SlashState | null {
  const beforeCursor = value.slice(0, cursor);
  const lineStart = beforeCursor.lastIndexOf('\n') + 1;
  const currentLine = beforeCursor.slice(lineStart);
  const slashIndex = currentLine.lastIndexOf('/');

  if (slashIndex === -1) return null;

  const prefix = currentLine.slice(0, slashIndex);
  if (prefix && !/\s$/.test(prefix)) return null;

  const query = currentLine.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    start: lineStart + slashIndex,
    end: cursor,
    query,
  };
}

function insertAtRange(value: string, start: number, end: number, insertion: string, caretOffset: number): CommandApplyResult {
  const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
  return {
    nextValue,
    caret: start + caretOffset,
  };
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string
): CommandApplyResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const insertion = `${prefix}${selected}${suffix}`;
  return {
    nextValue: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`,
    caret: selectionStart + prefix.length + selected.length + suffix.length,
  };
}
