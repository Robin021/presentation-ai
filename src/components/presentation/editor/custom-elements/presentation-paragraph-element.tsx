"use client";

import { cn } from "@/lib/utils";
import { PlateElement, withRef } from "platejs/react";
import type React from "react";

export interface PresentationParagraphElementProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export const PresentationParagraphElement = withRef<
  typeof PlateElement,
  PresentationParagraphElementProps
>(({ className, children, element, ...props }, ref) => {
  // Use 'div' when element has listStyleType to avoid invalid HTML nesting
  // (ul/ol cannot be a descendant of p)
  const hasListStyle = element && "listStyleType" in element && element.listStyleType;

  return (
    <PlateElement
      ref={ref}
      as={hasListStyle ? "div" : "p"}
      element={element}
      className={cn(
        "presentation-paragraph m-0 px-0 py-1 text-base",
        className,
      )}
      {...props}
    >
      {children}
    </PlateElement>
  );
});

PresentationParagraphElement.displayName = "PresentationParagraphElement";

