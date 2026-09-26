import { useEffect, useId, useRef, useState } from 'react';

export interface NodeOption {
  value: string;
  label: string;
  detail?: string;
}

export function NodePicker({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: NodeOption[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open)
      list.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);
  const current = options.find((option) => option.value === value);
  const choose = (index: number) => {
    if (!options[index]) return;
    onChange(options[index].value);
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div
      className="node-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span id={`${id}-label`} className="node-field-label">
        {label}
      </span>
      <button
        ref={button}
        type="button"
        role="combobox"
        className="node-picker-trigger"
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-haspopup="listbox"
        aria-activedescendant={
          open && options[activeIndex] ? `${id}-${activeIndex}` : undefined
        }
        disabled={disabled || !options.length}
        onClick={() => {
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((o) => o.value === value)
            )
          );
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            setOpen(false);
            return;
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : !open
                    ? Math.max(
                        0,
                        options.findIndex((o) => o.value === value)
                      )
                    : Math.max(
                        0,
                        Math.min(
                          options.length - 1,
                          activeIndex + (event.key === 'ArrowDown' ? 1 : -1)
                        )
                      );
            setActiveIndex(next);
          }
          if (open && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            choose(activeIndex);
          }
        }}
      >
        <span className="node-picker-value">
          {current?.label ?? placeholder}
        </span>
        <span className="node-picker-detail">{current?.detail}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          ref={list}
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="node-picker-options"
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              className={index === activeIndex ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') choose(index);
              }}
            >
              <span>{option.label}</span>
              <small>{option.detail}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
