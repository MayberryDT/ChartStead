import { Button } from "@base-ui/react/button";
import type { ComponentProps } from "react";

export function AppButton({
  className = "btn btn-secondary",
  type = "button",
  ...props
}: ComponentProps<typeof Button>) {
  return <Button className={className} type={type} {...props} />;
}
