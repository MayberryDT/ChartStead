import { Input } from "@base-ui/react/input";
import type { ComponentProps } from "react";

export function AppInput({
  className = "settings-input",
  ...props
}: ComponentProps<typeof Input>) {
  return <Input className={className} {...props} />;
}
