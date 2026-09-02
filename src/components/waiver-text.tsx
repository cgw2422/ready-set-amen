import { Fragment, type ReactNode } from "react";

/**
 * A deliberately tiny formatting subset for waiver language: paragraphs,
 * `- ` bullets, **bold** and *italic*.
 *
 * Waiver bodies are snapshotted and reprinted years later, so arbitrary HTML is
 * not accepted anywhere in the pipeline (docs/ARCHITECTURE.md §10). Text is
 * rendered as React nodes — never dangerouslySetInnerHTML — so a pasted
 * `<script>` is displayed as characters, not executed.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
    i += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function WaiverText({ body, className = "" }: { body: string; className?: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);

  return (
    <div className={`space-y-3 leading-relaxed ${className}`}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        const isList = lines.length > 0 && lines.every((l) => /^[-*•]\s+/.test(l.trim()));

        if (isList) {
          return (
            <ul key={blockIndex} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {renderInline(line.trim().replace(/^[-*•]\s+/, ""), `${blockIndex}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, `${blockIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
