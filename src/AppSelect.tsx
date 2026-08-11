import { Select } from "@base-ui/react/select";

export interface AppSelectOption {
  value: string;
  label: string;
}

export function AppSelect({
  label,
  value,
  options,
  onValueChange,
  variant = "toolbar",
  ariaLabel,
}: {
  label: string;
  value: string;
  options: AppSelectOption[];
  onValueChange: (value: string) => void;
  variant?: "toolbar" | "sidebar";
  ariaLabel?: string;
}) {
  return (
    <Select.Root
      items={options}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
    >
      <div className={`app-select app-select-${variant}`}>
        <Select.Trigger className="app-select-trigger" aria-label={ariaLabel ?? label}>
          <span className="app-select-label">{label}</span>
          <Select.Value className="app-select-value" />
          <Select.Icon className="app-select-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Positioner
          className="app-select-positioner"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <Select.Popup className={`app-select-popup app-select-popup-${variant}`}>
            <Select.List className="app-select-list">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="app-select-item"
                >
                  <Select.ItemIndicator className="app-select-check" aria-hidden="true">
                    ✓
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
