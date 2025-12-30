import { type SlateElementProps } from "platejs";

import { SlateElement } from "platejs";

import { cn } from "@/lib/utils";

export function PresentationParagraphElementStatic(props: SlateElementProps) {
  // Use 'div' when element has listStyleType to avoid invalid HTML nesting
  // (ul/ol cannot be a descendant of p)
  const hasListStyle = props.element && "listStyleType" in props.element && props.element.listStyleType;

  return (
    <SlateElement
      {...props}
      as={hasListStyle ? "div" : "p"}
      className={cn("presentation-paragraph m-0 px-0 py-1 text-base")}
    >
      {props.children}
    </SlateElement>
  );
}

