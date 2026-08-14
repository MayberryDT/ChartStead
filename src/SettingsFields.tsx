import type { HTMLInputTypeAttribute } from "react";
import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";

import { AppSelect, type AppSelectOption } from "./AppSelect";

export function SettingsTextField({
  label,
  value,
  onChange,
  type = "text",
  id,
  name,
  placeholder,
  required,
  autoComplete,
  spellCheck,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: HTMLInputTypeAttribute;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  spellCheck?: boolean;
}) {
  return (
    <Field.Root className="settings-field" name={name}>
      <Field.Label className="settings-field-label">{label}</Field.Label>
      <Input
        id={id}
        className="settings-input"
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        onValueChange={onChange}
      />
    </Field.Root>
  );
}

export function SettingsSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Field.Root className="settings-field">
      <Field.Label className="settings-field-label" nativeLabel={false}>
        {label}
      </Field.Label>
      <AppSelect
        label={label}
        value={value}
        options={options}
        onValueChange={onChange}
        variant="field"
        hideLabel
      />
    </Field.Root>
  );
}

export function SettingsCheckbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Field.Root className="settings-check-field">
      <Field.Item className="settings-check">
        <Checkbox.Root
          className="settings-checkbox"
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        >
          <Checkbox.Indicator className="settings-checkbox-mark" />
        </Checkbox.Root>
        <Field.Label className="settings-check-label">{label}</Field.Label>
      </Field.Item>
    </Field.Root>
  );
}
