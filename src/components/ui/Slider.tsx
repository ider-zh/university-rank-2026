import * as Primitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";

export function Slider(props: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      {...props}
      className="relative flex h-6 w-full touch-none select-none items-center data-[disabled]:opacity-35"
    >
      <Primitive.Track className="relative h-1.5 grow rounded-full bg-line">
        <Primitive.Range className="absolute h-full rounded-full bg-ink" />
      </Primitive.Track>
      <Primitive.Thumb
        aria-label={props["aria-label"]}
        className="block size-4 rounded-full border-2 border-ink bg-white shadow-sm focus-visible:ring-4 focus-visible:ring-ink/15"
      />
    </Primitive.Root>
  );
}
