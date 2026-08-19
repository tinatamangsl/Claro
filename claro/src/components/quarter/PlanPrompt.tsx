import { EditableText } from "@/components/EditableText";

/**
 * One planning question and the space to answer it.
 *
 * The answer is a roomy writing surface: these are reflections, not fields, and
 * a long answer must stay fully readable rather than being clipped.
 */
export function PlanPrompt({
  question,
  hint,
  value,
  placeholder,
  onCommit,
}: {
  question: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <div>
      <label className="block">
        <span className="block text-[0.95rem] leading-snug">{question}</span>
        {hint && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
            {hint}
          </span>
        )}
        <div className="paper-panel ruled mt-2 px-3 pb-2">
          <EditableText
            value={value}
            onCommit={onCommit}
            multiline
            rows={3}
            ariaLabel={question}
            placeholder={placeholder}
            className="ruled-text -ml-2 py-0"
          />
        </div>
      </label>
    </div>
  );
}
