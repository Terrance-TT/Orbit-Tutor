"use client";

import katex from "katex";
import { useMemo } from "react";

interface LatexProps {
  latex: string;
  block?: boolean;
  className?: string;
}

export default function Latex({ latex, block = false, className }: LatexProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: block,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  }, [latex, block]);

  if (html === null) {
    return <code className={className}>{latex}</code>;
  }
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
