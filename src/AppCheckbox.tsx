import { Checkbox } from "@base-ui/react/checkbox";

export function AppCheckbox({
  checked,
  onCheckedChange,
  disabled,
  name,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <Checkbox.Root
      className="app-checkbox"
      checked={checked}
      disabled={disabled}
      name={name}
      onCheckedChange={onCheckedChange}
    >
      <Checkbox.Indicator className="app-checkbox-indicator" keepMounted={false}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.4 6.3 11.2 12.5 4.8" />
        </svg>
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
