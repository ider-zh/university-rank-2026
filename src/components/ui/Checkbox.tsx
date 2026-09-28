import * as Primitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";

export function Checkbox(props: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      {...props}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded border border-muted/50 bg-white data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white disabled:opacity-40"
    >
      <Primitive.Indicator>
        <Check size={12} strokeWidth={3} />
      </Primitive.Indicator>
    </Primitive.Root>
  );
}
